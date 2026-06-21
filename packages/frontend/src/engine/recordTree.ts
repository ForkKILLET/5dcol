import { Action, FiveDPGN, type Coord, type Multiverse } from '@5dcol/core'
import {
  StudyDocumentSchema,
  StoredRecordAnnotationSchema,
  StoredRecordLineSchema,
  type RecordAnnotationTarget,
  type StudyActionNode,
  type StudyBranch,
  type StudyDocument,
  type StudyPosition,
  type StoredRecordAnnotation,
  type StoredRecordLine,
} from '@5dcol/shared/protocol'
import { Scalar } from '@engine/basic'

export interface RecordCursorTarget {
  recordLineId: number
  recordActionIndex: number
}

export interface RecordLine {
  id: number
  branchId: string
  createdAt: number
  parent: {
    lineId: number
    beforeActionIndex: number
  } | null
  actions: Action[]
  actionIds: string[]
  actionCreatedAts: number[]
  actionAuthorIds: (string | undefined)[]
  branchLineIdsBeforeAction: Map<number, number[]>
  depth: number
}

export type RecordAnnotation = StoredRecordAnnotation

export type RecordSquareMarkerAnnotation = Extract<RecordAnnotation, { type: 'marker' }> & {
  target: Extract<RecordAnnotationTarget, { type: 'square' }>
}

export type RecordArrowMarkerAnnotation = Extract<RecordAnnotation, { type: 'marker' }> & {
  target: Extract<RecordAnnotationTarget, { type: 'arrow' }>
}

export interface StoredRecordTree {
  recordLines?: StoredRecordLine[]
  recordAnnotations?: StoredRecordAnnotation[]
  activeRecordLineId?: number
  nextRecordLineId?: number
}

export interface CreateStudyDocumentOptions {
  id: string
  title: string
  initialMultiverse: Multiverse
  createdAt?: number
  updatedAt?: number
}

export class RecordDocument {
  public static create(actions: Action[], annotations: RecordAnnotation[] = []): RecordDocument {
    return new RecordDocument(actions, annotations)
  }

  public static fromActionTree(
    tree: FiveDPGN.ActionTree,
    annotations: RecordAnnotation[] = [],
  ): RecordDocument {
    const document = new RecordDocument([], [])
    document.loadActionTree(tree)
    document.replaceAnnotations([
      ...document.annotations,
      ...annotations,
    ])
    return document
  }

  public static fromFiveDPGN(input: string): RecordDocument {
    return RecordDocument.fromActionTree(
      stripActionTreeAnnotations(FiveDPGN.parseActionTree(input)),
      FiveDPGN.parseStudyAnnotations(input) as RecordAnnotation[],
    )
  }

  public static fromStudyDocument(studyDocument: StudyDocument): RecordDocument | null {
    const parsed = StudyDocumentSchema.safeParse(studyDocument)
    if (! parsed.success) return null

    const state = toStoredRecordTree(parsed.data)
    if (! state) return null

    const document = new RecordDocument([], [])
    const restored = document.restore(state, [])
    return restored ? document : null
  }

  private lines = new Map<number, RecordLine>()
  private annotations: RecordAnnotation[] = []
  private activeLineId = 0
  private nextLineId = 1

  private constructor(actions: Action[], annotations: RecordAnnotation[]) {
    this.reset(actions, annotations)
  }

  public get activeRecordLineId(): number {
    return this.activeLineId
  }

  public get nextRecordLineId(): number {
    return this.nextLineId
  }

  public reset(actions: Action[], annotations: RecordAnnotation[] = []) {
    this.lines.clear()
    this.nextLineId = 1
    this.activeLineId = 0
    this.lines.set(0, {
      id: 0,
      branchId: createRecordEntityId('branch'),
      createdAt: Date.now(),
      parent: null,
      actions: [...actions],
      actionIds: actions.map(() => createRecordEntityId('action')),
      actionCreatedAts: actions.map(() => Date.now()),
      actionAuthorIds: actions.map(() => undefined),
      branchLineIdsBeforeAction: new Map(),
      depth: 0,
    })
    this.annotations = parseStoredRecordAnnotations(annotations)
    this.pruneAnnotations()
  }

  public restore(state: StoredRecordTree, fallbackActions: Action[]): boolean {
    if (! state.recordLines || state.recordLines.length === 0) return false

    const lines = new Map<number, RecordLine>()
    for (const stored of state.recordLines) {
      const parsed = parseStoredRecordLine(stored)
      if (! parsed) return false
      lines.set(parsed.id, {
        id: parsed.id,
        branchId: parsed.branchId ?? createRecordEntityId('branch'),
        createdAt: parsed.createdAt ?? Date.now(),
        parent: parsed.parent,
        actions: [...parsed.actions],
        actionIds: normalizeRecordActionIds(parsed.actions, parsed.actionIds),
        actionCreatedAts: normalizeRecordActionCreatedAts(parsed.actions, parsed.actionCreatedAts),
        actionAuthorIds: normalizeRecordActionAuthorIds(parsed.actions, parsed.actionAuthorIds),
        branchLineIdsBeforeAction: new Map(parsed.branchLineIdsBeforeAction),
        depth: parsed.depth,
      })
    }
    if (! lines.has(0)) return false

    const activeRecordLineId = state.activeRecordLineId ?? 0
    if (! lines.has(activeRecordLineId)) return false

    this.lines = lines
    this.activeLineId = activeRecordLineId
    this.nextLineId = Math.max(
      state.nextRecordLineId ?? 1,
      ...[...lines.keys()].map(id => id + 1),
    )
    const parsedAnnotations = parseStoredRecordAnnotations(state.recordAnnotations ?? [])
    if (state.recordAnnotations && parsedAnnotations.length !== state.recordAnnotations.length) {
      this.reset(fallbackActions)
      return false
    }
    this.annotations = parsedAnnotations

    if (! isActionPrefix(fallbackActions, this.getLineFullActions(this.activeLineId))) {
      this.reset(fallbackActions)
      return false
    }
    this.pruneAnnotations()
    return true
  }

  public serializeLines(): StoredRecordLine[] {
    return [...this.lines.values()].map(line => ({
      id: line.id,
      branchId: line.branchId,
      createdAt: line.createdAt,
      parent: line.parent,
      actions: line.actions,
      actionIds: line.actionIds,
      actionCreatedAts: line.actionCreatedAts,
      actionAuthorIds: line.actionAuthorIds.map(authorId => authorId ?? null),
      branchLineIdsBeforeAction: [...line.branchLineIdsBeforeAction.entries()],
      depth: line.depth,
    }))
  }

  public serializeAnnotations(): StoredRecordAnnotation[] {
    return this.getAnnotations()
  }

  public toStudyDocument({
    id,
    title,
    initialMultiverse,
    createdAt = Date.now(),
    updatedAt = createdAt,
  }: CreateStudyDocumentOptions): StudyDocument {
    return StudyDocumentSchema.parse({
      id,
      title,
      initialMultiverse,
      rootBranchId: this.lines.get(0)?.branchId ?? createRecordEntityId('branch'),
      branches: this.serializeStudyBranches(createdAt),
      actions: this.serializeStudyActions(createdAt),
      annotations: this.serializeAnnotations(),
      createdAt,
      updatedAt,
    })
  }

  public serializeStudyBranches(createdAt = Date.now()): StudyBranch[] {
    return [...this.lines.values()].map(line => ({
      id: line.branchId,
      parent: line.parent ? this.createStudyPosition(line.parent.lineId, line.parent.beforeActionIndex) : null,
      actionIds: [...line.actionIds],
      createdAt: line.createdAt || createdAt,
    }))
  }

  public serializeStudyActions(createdAt = Date.now()): StudyActionNode[] {
    return [...this.lines.values()].flatMap(line => (
      line.actions.map((action, actionIndex) => ({
        id: line.actionIds[actionIndex] ?? createRecordEntityId('action'),
        branchId: line.branchId,
        action,
        authorId: line.actionAuthorIds[actionIndex],
        createdAt: line.actionCreatedAts[actionIndex] ?? createdAt,
      }))
    ))
  }

  public getAnnotations(): RecordAnnotation[] {
    return this.annotations.map(cloneAnnotation)
  }

  public getAnnotationsForTarget(target: RecordAnnotationTarget): RecordAnnotation[] {
    return this.annotations
      .filter(annotation => isSameRecordAnnotationTarget(annotation.target, target))
      .map(cloneAnnotation)
  }

  public getSquareMarkersAt(lineId: number, actionIndex: number): RecordSquareMarkerAnnotation[] {
    return this.annotations
      .filter((annotation): annotation is RecordSquareMarkerAnnotation => (
        annotation.type === 'marker'
          && annotation.target.type === 'square'
          && annotation.target.lineId === lineId
          && annotation.target.actionIndex === actionIndex
      ))
      .map(cloneAnnotation)
  }

  public getArrowMarkersAt(lineId: number, actionIndex: number): RecordArrowMarkerAnnotation[] {
    return this.annotations
      .filter((annotation): annotation is RecordArrowMarkerAnnotation => (
        annotation.type === 'marker'
          && annotation.target.type === 'arrow'
          && annotation.target.lineId === lineId
          && annotation.target.actionIndex === actionIndex
      ))
      .map(cloneAnnotation)
  }

  public getMoveGlyphs(lineId: number, actionIndex: number, moveIndex: number): string[] {
    return this.getMoveGlyphTexts(lineId, actionIndex, moveIndex)
  }

  public replaceAnnotations(annotations: RecordAnnotation[]) {
    this.annotations = parseStoredRecordAnnotations(annotations)
    this.pruneAnnotations()
  }

  public upsertAnnotation(annotation: RecordAnnotation) {
    const nextAnnotation = parseStoredRecordAnnotation(annotation)
    if (! nextAnnotation) return false
    if (! this.isAnnotationTargetValid(nextAnnotation.target)) return false

    const index = this.annotations.findIndex(item => item.id === nextAnnotation.id)
    if (index >= 0) this.annotations[index] = nextAnnotation
    else this.annotations.push(nextAnnotation)
    return true
  }

  public replaceActionComments(
    lineId: number,
    actionIndex: number,
    position: 'before' | 'after',
    texts: readonly string[],
    {
      authorId,
    }: {
      authorId?: string
    } = {},
  ): boolean {
    const target: RecordAnnotationTarget = {
      type: 'action',
      lineId,
      actionIndex,
      position,
    }
    if (! this.isAnnotationTargetValid(target)) return false

    this.annotations = this.annotations.filter(annotation => ! (
      annotation.type === 'comment'
        && isSameRecordAnnotationTarget(annotation.target, target)
    ))
    const now = Date.now()
    texts
      .map(text => text.trim())
      .filter(text => text.length > 0)
      .forEach((text, index) => {
        this.annotations.push({
          id: `comment:${lineId}:${actionIndex}:${position}:${now}:${index}`,
          type: 'comment',
          target,
          authorId,
          text,
          createdAt: now,
          updatedAt: now,
        })
      })
    return true
  }

  public replaceMoveGlyphs(
    lineId: number,
    actionIndex: number,
    moveIndex: number,
    glyphs: readonly string[],
    {
      authorId,
    }: {
      authorId?: string
    } = {},
  ): boolean {
    const target: RecordAnnotationTarget = {
      type: 'move',
      lineId,
      actionIndex,
      moveIndex,
    }
    if (! this.isAnnotationTargetValid(target)) return false

    this.annotations = this.annotations.filter(annotation => ! (
      annotation.type === 'glyph'
        && isSameRecordAnnotationTarget(annotation.target, target)
    ))
    glyphs
      .map(glyph => glyph.trim())
      .filter(glyph => glyph.length > 0)
      .forEach((glyph, index) => {
        this.annotations.push({
          id: `glyph:${lineId}:${actionIndex}:${moveIndex}:${Date.now()}:${index}`,
          type: 'glyph',
          target,
          authorId,
          glyph,
        })
      })
    return true
  }

  public toggleSquareMarker(
    lineId: number,
    actionIndex: number,
    m: number,
    coord: Coord,
    {
      authorId,
      color,
    }: {
      authorId: string
      color?: string
    },
  ): boolean {
    const target: RecordAnnotationTarget = {
      type: 'square',
      lineId,
      actionIndex,
      m,
      coord,
    }
    if (! this.isAnnotationTargetValid(target)) return false

    const existingIndex = this.annotations.findIndex(annotation => (
      annotation.type === 'marker'
        && isSameRecordAnnotationTarget(annotation.target, target)
        && (annotation.authorId ?? '') === authorId
    ))
    if (existingIndex >= 0) {
      this.annotations.splice(existingIndex, 1)
      return true
    }

    this.annotations.push({
      id: `marker:${lineId}:${actionIndex}:${coord.l}:${m}:${coord.x}:${coord.y}:${Date.now()}`,
      type: 'marker',
      target,
      authorId,
      color,
    })
    return true
  }

  public toggleArrowMarker(
    lineId: number,
    actionIndex: number,
    from: Coord,
    fromPlayer: number,
    to: Coord,
    toPlayer: number,
    {
      authorId,
      color,
    }: {
      authorId: string
      color?: string
    },
  ): boolean {
    const target: RecordAnnotationTarget = {
      type: 'arrow',
      lineId,
      actionIndex,
      from,
      fromPlayer,
      to,
      toPlayer,
    }
    if (! this.isAnnotationTargetValid(target)) return false

    const existingIndex = this.annotations.findIndex(annotation => (
      annotation.type === 'marker'
        && isSameRecordAnnotationTarget(annotation.target, target)
        && (annotation.authorId ?? '') === authorId
    ))
    if (existingIndex >= 0) {
      this.annotations.splice(existingIndex, 1)
      return true
    }

    this.annotations.push({
      id: `marker-arrow:${lineId}:${actionIndex}:${from.l}:${from.t}:${from.x}:${from.y}:${to.l}:${to.t}:${to.x}:${to.y}:${Date.now()}`,
      type: 'marker',
      target,
      authorId,
      color,
    })
    return true
  }

  public deleteAnnotation(id: string): boolean {
    const before = this.annotations.length
    this.annotations = this.annotations.filter(annotation => annotation.id !== id)
    return this.annotations.length !== before
  }

  public deleteAnnotationsAtTarget(target: RecordAnnotationTarget): boolean {
    const before = this.annotations.length
    this.annotations = this.annotations.filter(annotation => ! isSameRecordAnnotationTarget(annotation.target, target))
    return this.annotations.length !== before
  }

  public getLine(lineId: number): RecordLine | undefined {
    return this.lines.get(lineId)
  }

  public getActiveLine(): RecordLine {
    return this.lines.get(this.activeLineId) ?? this.lines.get(0)!
  }

  public setActiveLine(lineId: number) {
    if (! this.lines.has(lineId)) return false
    this.activeLineId = lineId
    return true
  }

  public getLinePrefixActions(lineId: number): Action[] {
    const line = this.lines.get(lineId)
    if (! line?.parent) return []

    const parent = this.lines.get(line.parent.lineId)
    if (! parent) return []

    return [
      ...this.getLinePrefixActions(parent.id),
      ...parent.actions.slice(0, line.parent.beforeActionIndex),
    ]
  }

  public getLineFullActions(lineId: number): Action[] {
    const line = this.lines.get(lineId)
    if (! line) return []

    return [
      ...this.getLinePrefixActions(lineId),
      ...line.actions,
    ]
  }

  public getLineFullActionTarget(lineId: number, fullActionIndex: number): RecordCursorTarget | null {
    const line = this.lines.get(lineId)
    if (! line) return null

    const prefixTargets = this.getLinePrefixActionTargets(lineId)
    if (fullActionIndex < prefixTargets.length) {
      return prefixTargets[fullActionIndex] ?? null
    }

    const actionIndex = fullActionIndex - prefixTargets.length
    if (! isIntegerInRange(actionIndex, 0, line.actions.length - 1)) return null
    return {
      recordLineId: line.id,
      recordActionIndex: actionIndex,
    }
  }

  public toStudyPosition(target: RecordCursorTarget): StudyPosition | null {
    const resolved = this.resolveCursorTarget(target)
    if (! resolved) return null
    return this.createStudyPosition(resolved.recordLineId, resolved.recordActionIndex)
  }

  public fromStudyPosition(position: StudyPosition): RecordCursorTarget | null {
    if (position.type === 'head') {
      const line = this.getLineByBranchId(position.branchId)
      return line
        ? {
            recordLineId: line.id,
            recordActionIndex: 0,
          }
        : null
    }

    for (const line of this.lines.values()) {
      const actionIndex = line.actionIds.indexOf(position.actionId)
      if (actionIndex >= 0) {
        return {
          recordLineId: line.id,
          recordActionIndex: actionIndex + 1,
        }
      }
    }
    return null
  }

  public getActiveLineLocalActionIndex(globalActionIndex: number): number {
    const prefixLength = this.getLinePrefixActions(this.activeLineId).length
    return Scalar.clampInteger(
      globalActionIndex - prefixLength,
      0,
      this.getActiveLine().actions.length,
    )
  }

  public resolveCursorTarget(cursor: RecordCursorTarget): RecordCursorTarget | null {
    const line = this.lines.get(cursor.recordLineId)
    if (! line) return null

    if (line.parent && this.isEmptyLineTree(line.id)) {
      return {
        recordLineId: line.parent.lineId,
        recordActionIndex: line.parent.beforeActionIndex,
      }
    }

    return {
      recordLineId: line.id,
      recordActionIndex: Scalar.clampInteger(
        cursor.recordActionIndex,
        0,
        line.actions.length,
      ),
    }
  }

  public getNextVariationCursorTarget(globalActionIndex: number): RecordCursorTarget | null {
    const line = this.getActiveLine()
    const actionIndex = this.getActiveLineLocalActionIndex(globalActionIndex)
    const current = {
      recordLineId: line.id,
      recordActionIndex: actionIndex,
    }

    if (line.parent && actionIndex === 0) {
      return getNextRecordVariationTarget(
        this.getVariationTargets(line.parent.lineId, line.parent.beforeActionIndex),
        current,
      )
    }

    return getNextRecordVariationTarget(
      this.getVariationTargets(line.id, actionIndex),
      current,
    )
  }

  public deleteActiveEmptyLineIfLeaving(nextRecordLineId: number) {
    if (this.activeLineId === nextRecordLineId) return
    this.deleteEmptyLineTree(this.activeLineId)
  }

  public deleteFutureAndResolveCursorTarget(lineId: number, actionIndex: number): RecordCursorTarget | null {
    const line = this.lines.get(lineId)
    if (! line) return null

    const localActionIndex = Scalar.clampInteger(
      actionIndex,
      0,
      line.actions.length,
    )
    if (! this.hasFutureAt(line.id, localActionIndex)) return null

    const nextTarget = line.parent && localActionIndex === 0
      ? {
          recordLineId: line.parent.lineId,
          recordActionIndex: line.parent.beforeActionIndex,
        }
      : {
          recordLineId: line.id,
          recordActionIndex: localActionIndex,
        }

    this.deleteActiveEmptyLineIfLeaving(nextTarget.recordLineId)
    this.deleteFuture(line.id, localActionIndex)
    if (line.parent && localActionIndex === 0 && this.isEmptyLineTree(line.id)) {
      this.deleteLineTree(line.id)
    }
    if (! this.lines.has(this.activeLineId)) this.activeLineId = nextTarget.recordLineId
    this.pruneAnnotations()
    return nextTarget
  }

  public appendActionToActiveLine(action: Action, globalActionIndex: number): Action[] {
    const line = this.getActiveLine()
    const localActionIndex = this.getActiveLineLocalActionIndex(globalActionIndex)
    const nextAction = line.actions[localActionIndex]
    if (nextAction && Action.isSame(nextAction, action)) {
      return this.getLineFullActions(line.id)
    }

    const branchIds = line.branchLineIdsBeforeAction.get(localActionIndex) ?? []
    const matchingBranchId = branchIds.find((branchId) => {
      const branchLine = this.lines.get(branchId)
      const branchAction = branchLine?.actions[0]
      return branchAction ? Action.isSame(branchAction, action) : false
    })
    if (matchingBranchId !== undefined) {
      this.activeLineId = matchingBranchId
      return this.getLineFullActions(matchingBranchId)
    }

    if (localActionIndex < line.actions.length || branchIds.length > 0) {
      const branchLine = this.createLine({
        parent: {
          lineId: line.id,
          beforeActionIndex: localActionIndex,
        },
        actions: [action],
        depth: line.depth + 1,
      })
      branchIds.push(branchLine.id)
      line.branchLineIdsBeforeAction.set(localActionIndex, branchIds)
      this.activeLineId = branchLine.id
      return this.getLineFullActions(branchLine.id)
    }

    line.actions.push(action)
    line.actionIds.push(createRecordEntityId('action'))
    line.actionCreatedAts.push(Date.now())
    line.actionAuthorIds.push(undefined)
    return this.getLineFullActions(line.id)
  }

  public hasFutureAt(lineId: number, actionIndex: number): boolean {
    const line = this.lines.get(lineId)
    if (! line) return false
    return actionIndex < line.actions.length
      || [...line.branchLineIdsBeforeAction.keys()].some(key => key >= actionIndex)
  }

  public deleteFuture(lineId: number, actionIndex: number) {
    const line = this.lines.get(lineId)
    if (! line) return

    line.actions = line.actions.slice(0, actionIndex)
    line.actionIds = line.actionIds.slice(0, actionIndex)
    line.actionCreatedAts = line.actionCreatedAts.slice(0, actionIndex)
    line.actionAuthorIds = line.actionAuthorIds.slice(0, actionIndex)
    for (const key of [...line.branchLineIdsBeforeAction.keys()]) {
      if (key < actionIndex) continue
      const branchIds = line.branchLineIdsBeforeAction.get(key) ?? []
      for (const branchId of branchIds) {
        this.deleteLineTree(branchId)
      }
      line.branchLineIdsBeforeAction.delete(key)
    }
    this.pruneAnnotations()
  }

  public buildActionTree(lineId = 0, actionIndex = 0): FiveDPGN.ActionTree {
    const line = this.lines.get(lineId)
    if (! line) return { variations: [] }

    const variations: FiveDPGN.ActionTreeVariation[] = []
    const branchIds = line.branchLineIdsBeforeAction.get(actionIndex) ?? []
    for (const branchId of branchIds) {
      variations.push(...this.buildActionTree(branchId).variations)
    }

    if (actionIndex < line.actions.length) {
      const variation: FiveDPGN.ActionTreeVariation = {
        action: line.actions[actionIndex],
        subtree: this.buildActionTree(lineId, actionIndex + 1),
      }
      const commentsBefore = this.getActionCommentTexts(lineId, actionIndex, 'before')
      const commentsAfter = this.getActionCommentTexts(lineId, actionIndex, 'after')
      const moveGlyphs = variation.action.moves.map((_, moveIndex) => (
        this.getMoveGlyphTexts(lineId, actionIndex, moveIndex)
      ))
      if (commentsBefore.length > 0) variation.commentsBefore = commentsBefore
      if (commentsAfter.length > 0) variation.commentsAfter = commentsAfter
      if (moveGlyphs.some(glyphs => glyphs.length > 0)) variation.moveGlyphs = moveGlyphs
      variations.push(variation)
    }

    return { variations }
  }

  private loadActionTree(tree: FiveDPGN.ActionTree) {
    this.lines.clear()
    this.nextLineId = 1
    this.activeLineId = 0
    const root: RecordLine = {
      id: 0,
      branchId: createRecordEntityId('branch'),
      createdAt: Date.now(),
      parent: null,
      actions: [],
      actionIds: [],
      actionCreatedAts: [],
      actionAuthorIds: [],
      branchLineIdsBeforeAction: new Map(),
      depth: 0,
    }
    this.lines.set(0, root)
    this.populateLineFromActionTree(root, tree)
    this.pruneAnnotations()
  }

  private populateLineFromActionTree(line: RecordLine, tree: FiveDPGN.ActionTree | undefined) {
    let currentTree = tree
    while (currentTree && currentTree.variations.length > 0) {
      const actionIndex = line.actions.length
      const mainlineVariation = currentTree.variations[currentTree.variations.length - 1]!
      const branchVariations = currentTree.variations.slice(0, -1)
      for (const variation of branchVariations) {
        const branchLine = this.createLine({
          parent: {
            lineId: line.id,
            beforeActionIndex: actionIndex,
          },
          actions: [],
          depth: line.depth + 1,
        })
        const branchIds = line.branchLineIdsBeforeAction.get(actionIndex) ?? []
        branchIds.push(branchLine.id)
        line.branchLineIdsBeforeAction.set(actionIndex, branchIds)
        this.populateLineFromVariation(branchLine, variation)
      }

      line.actions.push(mainlineVariation.action)
      line.actionIds.push(createRecordEntityId('action'))
      line.actionCreatedAts.push(Date.now())
      line.actionAuthorIds.push(undefined)
      this.addActionTreeVariationAnnotations(line.id, actionIndex, mainlineVariation)
      currentTree = mainlineVariation.subtree
    }
  }

  private populateLineFromVariation(line: RecordLine, variation: FiveDPGN.ActionTreeVariation) {
    const actionIndex = line.actions.length
    line.actions.push(variation.action)
    line.actionIds.push(createRecordEntityId('action'))
    line.actionCreatedAts.push(Date.now())
    line.actionAuthorIds.push(undefined)
    this.addActionTreeVariationAnnotations(line.id, actionIndex, variation)
    this.populateLineFromActionTree(line, variation.subtree)
  }

  private addActionTreeVariationAnnotations(
    lineId: number,
    actionIndex: number,
    variation: FiveDPGN.ActionTreeVariation,
  ) {
    this.addActionTreeComments(lineId, actionIndex, 'before', variation.commentsBefore)
    this.addActionTreeComments(lineId, actionIndex, 'after', variation.commentsAfter)
    this.addActionTreeMoveGlyphs(lineId, actionIndex, variation.moveGlyphs)
  }

  private addActionTreeComments(
    lineId: number,
    actionIndex: number,
    position: 'before' | 'after',
    comments: readonly string[] | undefined,
  ) {
    comments?.forEach((text, index) => {
      this.annotations.push({
        id: `5dpgn-comment:${lineId}:${actionIndex}:${position}:${index}`,
        type: 'comment',
        target: {
          type: 'action',
          lineId,
          actionIndex,
          position,
        },
        text,
        createdAt: 0,
        updatedAt: 0,
      })
    })
  }

  private addActionTreeMoveGlyphs(
    lineId: number,
    actionIndex: number,
    moveGlyphs: readonly (readonly string[] | undefined)[] | undefined,
  ) {
    moveGlyphs?.forEach((glyphs, moveIndex) => {
      glyphs?.forEach((glyph, glyphIndex) => {
        this.annotations.push({
          id: `5dpgn-glyph:${lineId}:${actionIndex}:${moveIndex}:${glyphIndex}`,
          type: 'glyph',
          target: {
            type: 'move',
            lineId,
            actionIndex,
            moveIndex,
          },
          glyph,
        })
      })
    })
  }

  private createLine({
    parent,
    actions,
    depth,
  }: {
    parent: RecordLine['parent']
    actions: Action[]
    depth: number
  }): RecordLine {
    const line: RecordLine = {
      id: this.nextLineId++,
      branchId: createRecordEntityId('branch'),
      createdAt: Date.now(),
      parent,
      actions: [...actions],
      actionIds: actions.map(() => createRecordEntityId('action')),
      actionCreatedAts: actions.map(() => Date.now()),
      actionAuthorIds: actions.map(() => undefined),
      branchLineIdsBeforeAction: new Map(),
      depth,
    }
    this.lines.set(line.id, line)
    return line
  }

  private getLinePrefixActionTargets(lineId: number): RecordCursorTarget[] {
    const line = this.lines.get(lineId)
    if (! line?.parent) return []

    const parent = this.lines.get(line.parent.lineId)
    if (! parent) return []

    return [
      ...this.getLinePrefixActionTargets(parent.id),
      ...parent.actions
        .slice(0, line.parent.beforeActionIndex)
        .map((_, actionIndex) => ({
          recordLineId: parent.id,
          recordActionIndex: actionIndex,
        })),
    ]
  }

  private getVariationTargets(lineId: number, actionIndex: number): RecordCursorTarget[] {
    const line = this.lines.get(lineId)
    if (! line) return []

    const localActionIndex = Scalar.clampInteger(
      actionIndex,
      0,
      line.actions.length,
    )
    const targets = (line.branchLineIdsBeforeAction.get(localActionIndex) ?? [])
      .filter(branchId => this.lines.has(branchId))
      .map(branchId => ({
        recordLineId: branchId,
        recordActionIndex: 0,
      }))

    if (localActionIndex < line.actions.length) {
      targets.push({
        recordLineId: line.id,
        recordActionIndex: localActionIndex,
      })
    }

    return targets
  }

  private deleteEmptyLineTree(lineId: number): boolean {
    if (lineId === 0 || ! this.isEmptyLineTree(lineId)) return false
    this.deleteLineTree(lineId)
    if (this.activeLineId === lineId) this.activeLineId = 0
    return true
  }

  private isEmptyLineTree(lineId: number): boolean {
    const line = this.lines.get(lineId)
    if (! line || line.actions.length > 0) return false
    return this.getLineChildIds(line).every(childId => this.isEmptyLineTree(childId))
  }

  private deleteLineTree(lineId: number) {
    const line = this.lines.get(lineId)
    if (! line) return

    for (const childId of this.getLineChildIds(line)) {
      this.deleteLineTree(childId)
    }

    if (line.parent) {
      const parent = this.lines.get(line.parent.lineId)
      const branchIds = parent?.branchLineIdsBeforeAction.get(line.parent.beforeActionIndex)
      if (branchIds) {
        const nextBranchIds = branchIds.filter(id => id !== line.id)
        if (nextBranchIds.length > 0) {
          parent!.branchLineIdsBeforeAction.set(line.parent.beforeActionIndex, nextBranchIds)
        }
        else {
          parent!.branchLineIdsBeforeAction.delete(line.parent.beforeActionIndex)
        }
      }
    }

    this.lines.delete(lineId)
  }

  private getLineChildIds(line: RecordLine): number[] {
    return [...line.branchLineIdsBeforeAction.values()].flat()
  }

  private createStudyPosition(lineId: number, beforeActionIndex: number): StudyPosition {
    const line = this.lines.get(lineId)
    if (! line || beforeActionIndex <= 0) {
      return {
        type: 'head',
        branchId: line?.branchId ?? this.lines.get(0)?.branchId ?? 'root',
      }
    }

    return {
      type: 'after',
      actionId: line.actionIds[beforeActionIndex - 1] ?? line.actionIds[line.actionIds.length - 1] ?? '',
    }
  }

  private getLineByBranchId(branchId: string): RecordLine | undefined {
    return [...this.lines.values()].find(line => line.branchId === branchId)
  }

  private getActionCommentTexts(
    lineId: number,
    actionIndex: number,
    position: 'before' | 'after',
  ): string[] {
    return this.annotations
      .filter((annotation): annotation is Extract<RecordAnnotation, { type: 'comment' }> => (
        annotation.type === 'comment'
          && isSameRecordAnnotationTarget(annotation.target, {
            type: 'action',
            lineId,
            actionIndex,
            position,
          })
      ))
      .map(annotation => annotation.text)
  }

  private getMoveGlyphTexts(lineId: number, actionIndex: number, moveIndex: number): string[] {
    return this.annotations
      .filter((annotation): annotation is Extract<RecordAnnotation, { type: 'glyph' }> => (
        annotation.type === 'glyph'
          && isSameRecordAnnotationTarget(annotation.target, {
            type: 'move',
            lineId,
            actionIndex,
            moveIndex,
          })
      ))
      .map(annotation => annotation.glyph)
  }

  private pruneAnnotations() {
    this.annotations = this.annotations.filter(annotation => this.isAnnotationTargetValid(annotation.target))
  }

  private isAnnotationTargetValid(target: RecordAnnotationTarget): boolean {
    const line = this.lines.get(target.lineId)
    if (! line) return false

    switch (target.type) {
      case 'line':
        return true
      case 'cursor':
      case 'square':
      case 'arrow':
        return isIntegerInRange(target.actionIndex, 0, line.actions.length)
      case 'action':
        if (target.position === 'before') return isIntegerInRange(target.actionIndex, 0, line.actions.length)
        return isIntegerInRange(target.actionIndex, 0, line.actions.length - 1)
      case 'move': {
        if (! isIntegerInRange(target.actionIndex, 0, line.actions.length - 1)) return false
        const action = line.actions[target.actionIndex]
        return Boolean(action && isIntegerInRange(target.moveIndex, 0, action.moves.length - 1))
      }
    }
  }
}

export const isSameRecordAnnotationTarget = (
  a: RecordAnnotationTarget,
  b: RecordAnnotationTarget,
): boolean => {
  if (a.type !== b.type || a.lineId !== b.lineId) return false

  switch (a.type) {
    case 'line':
      return true
    case 'cursor':
      return b.type === 'cursor' && a.actionIndex === b.actionIndex
    case 'action':
      return b.type === 'action'
        && a.actionIndex === b.actionIndex
        && a.position === b.position
    case 'move':
      return b.type === 'move'
        && a.actionIndex === b.actionIndex
        && a.moveIndex === b.moveIndex
    case 'square':
      return b.type === 'square'
        && a.actionIndex === b.actionIndex
        && a.m === b.m
        && a.coord.l === b.coord.l
        && a.coord.x === b.coord.x
        && a.coord.y === b.coord.y
    case 'arrow':
      return b.type === 'arrow'
        && a.actionIndex === b.actionIndex
        && a.from.l === b.from.l
        && a.from.t === b.from.t
        && a.from.x === b.from.x
        && a.from.y === b.from.y
        && (a.fromPlayer ?? null) === (b.fromPlayer ?? null)
        && a.to.l === b.to.l
        && a.to.t === b.to.t
        && a.to.x === b.to.x
        && a.to.y === b.to.y
        && (a.toPlayer ?? null) === (b.toPlayer ?? null)
  }
}

export const isActionPrefix = (prefix: Action[], actions: Action[]): boolean => {
  if (prefix.length > actions.length) return false

  for (let i = 0; i < prefix.length; i += 1) {
    if (! Action.isSame(prefix[i]!, actions[i]!)) return false
  }
  return true
}

const stripActionTreeAnnotations = (tree: FiveDPGN.ActionTree): FiveDPGN.ActionTree => ({
  variations: tree.variations.map((variation): FiveDPGN.ActionTreeVariation => ({
    action: variation.action,
    ...(variation.subtree ? { subtree: stripActionTreeAnnotations(variation.subtree) } : {}),
  })),
})

const getNextRecordVariationTarget = (
  targets: RecordCursorTarget[],
  current: RecordCursorTarget,
): RecordCursorTarget | null => {
  if (targets.length === 0) return null

  const currentIndex = targets.findIndex(target => isSameRecordCursorTarget(target, current))
  const target = targets[currentIndex >= 0 ? (currentIndex + 1) % targets.length : 0]!
  return isSameRecordCursorTarget(target, current) ? null : target
}

const isSameRecordCursorTarget = (a: RecordCursorTarget, b: RecordCursorTarget): boolean => (
  a.recordLineId === b.recordLineId
    && a.recordActionIndex === b.recordActionIndex
)

const toStoredRecordTree = (studyDocument: StudyDocument): StoredRecordTree | null => {
  const branchById = new Map(studyDocument.branches.map(branch => [branch.id, branch]))
  const actionById = new Map(studyDocument.actions.map(action => [action.id, action]))
  const rootBranch = branchById.get(studyDocument.rootBranchId)
  if (! rootBranch) return null

  const branchLineIds = new Map<string, number>([[rootBranch.id, 0]])
  let nextLineId = 1
  for (const branch of studyDocument.branches) {
    if (branch.id === rootBranch.id) continue
    branchLineIds.set(branch.id, nextLineId)
    nextLineId += 1
  }

  const branchDepths = new Map<string, number>()
  const visitingBranches = new Set<string>()
  const getBranchDepth = (branchId: string): number | null => {
    if (branchDepths.has(branchId)) return branchDepths.get(branchId)!
    const branch = branchById.get(branchId)
    if (! branch || visitingBranches.has(branchId)) return null
    visitingBranches.add(branchId)

    const parentBranchId = branch.parent
      ? getStudyPositionBranchId(branch.parent, actionById)
      : null
    const parentDepth = parentBranchId === null ? -1 : getBranchDepth(parentBranchId)
    visitingBranches.delete(branchId)
    if (parentDepth === null) return null

    const depth = parentDepth + 1
    branchDepths.set(branchId, depth)
    return depth
  }

  const recordLines = new Map<number, RecordLine>()
  for (const branch of studyDocument.branches) {
    const lineId = branchLineIds.get(branch.id)
    const depth = getBranchDepth(branch.id)
    if (lineId === undefined || depth === null) return null

    const parent = branch.parent
      ? toRecordLineParent(branch.parent, branchById, actionById, branchLineIds)
      : null
    if (branch.parent && ! parent) return null

    const actions: Action[] = []
    for (const actionId of branch.actionIds) {
      const action = actionById.get(actionId)
      if (! action || action.branchId !== branch.id) return null
      actions.push(action.action)
    }

    recordLines.set(lineId, {
      id: lineId,
      branchId: branch.id,
      createdAt: branch.createdAt,
      parent,
      actions,
      actionIds: branch.actionIds,
      actionCreatedAts: branch.actionIds.map(actionId => actionById.get(actionId)?.createdAt ?? Date.now()),
      actionAuthorIds: branch.actionIds.map(actionId => actionById.get(actionId)?.authorId),
      branchLineIdsBeforeAction: new Map(),
      depth,
    })
  }

  for (const branch of studyDocument.branches) {
    if (! branch.parent) continue
    const lineId = branchLineIds.get(branch.id)
    const parent = toRecordLineParent(branch.parent, branchById, actionById, branchLineIds)
    if (lineId === undefined || ! parent) return null

    const parentLine = recordLines.get(parent.lineId)
    if (! parentLine) return null
    const branchIds = parentLine.branchLineIdsBeforeAction.get(parent.beforeActionIndex) ?? []
    branchIds.push(lineId)
    parentLine.branchLineIdsBeforeAction.set(parent.beforeActionIndex, branchIds)
  }

  return {
    recordLines: [...recordLines.values()].map(line => ({
      id: line.id,
      branchId: line.branchId,
      createdAt: line.createdAt,
      parent: line.parent,
      actions: line.actions,
      actionIds: line.actionIds,
      actionCreatedAts: line.actionCreatedAts,
      actionAuthorIds: line.actionAuthorIds.map(authorId => authorId ?? null),
      branchLineIdsBeforeAction: [...line.branchLineIdsBeforeAction.entries()],
      depth: line.depth,
    })),
    recordAnnotations: studyDocument.annotations,
    activeRecordLineId: 0,
    nextRecordLineId: nextLineId,
  }
}

const getStudyPositionBranchId = (
  position: StudyPosition,
  actionById: Map<string, StudyActionNode>,
): string | null => {
  if (position.type === 'head') return position.branchId
  return actionById.get(position.actionId)?.branchId ?? null
}

const toRecordLineParent = (
  position: StudyPosition,
  branchById: Map<string, StudyBranch>,
  actionById: Map<string, StudyActionNode>,
  branchLineIds: Map<string, number>,
): RecordLine['parent'] | null => {
  if (position.type === 'head') {
    const lineId = branchLineIds.get(position.branchId)
    return lineId === undefined
      ? null
      : {
          lineId,
          beforeActionIndex: 0,
        }
  }

  const action = actionById.get(position.actionId)
  if (! action) return null
  const branch = branchById.get(action.branchId)
  const lineId = branchLineIds.get(action.branchId)
  const actionIndex = branch?.actionIds.indexOf(action.id) ?? -1
  if (! branch || lineId === undefined || actionIndex < 0) return null
  return {
    lineId,
    beforeActionIndex: actionIndex + 1,
  }
}

const parseStoredRecordLine = (line: unknown): StoredRecordLine | null => {
  const result = StoredRecordLineSchema.safeParse(line)
  return result.success ? result.data : null
}

const normalizeRecordActionIds = (
  actions: readonly Action[],
  actionIds: readonly string[] | undefined,
): string[] => (
  actions.map((_, index) => actionIds?.[index] ?? createRecordEntityId('action'))
)

const normalizeRecordActionCreatedAts = (
  actions: readonly Action[],
  actionCreatedAts: readonly number[] | undefined,
): number[] => (
  actions.map((_, index) => actionCreatedAts?.[index] ?? Date.now())
)

const normalizeRecordActionAuthorIds = (
  actions: readonly Action[],
  actionAuthorIds: readonly (string | null)[] | undefined,
): (string | undefined)[] => (
  actions.map((_, index) => actionAuthorIds?.[index] ?? undefined)
)

const createRecordEntityId = (prefix: 'action' | 'branch'): string => (
  `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`}`
)

const parseStoredRecordAnnotation = (annotation: unknown): StoredRecordAnnotation | null => {
  const result = StoredRecordAnnotationSchema.safeParse(annotation)
  return result.success ? cloneAnnotation(result.data) : null
}

const parseStoredRecordAnnotations = (
  annotations: readonly unknown[],
): StoredRecordAnnotation[] => (
  annotations
    .map(parseStoredRecordAnnotation)
    .filter((annotation): annotation is StoredRecordAnnotation => annotation !== null)
)

const cloneAnnotation = <T extends RecordAnnotation>(annotation: T): T => (
  JSON.parse(JSON.stringify(annotation)) as T
)

const isIntegerInRange = (value: number, min: number, max: number): boolean => (
  Number.isInteger(value) && value >= min && value <= max
)
