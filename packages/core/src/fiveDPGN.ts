import {
  Board,
  Coord,
  GameState,
  Line,
  Multiverse,
  Piece,
  Pieces,
  Player,
  Players,
  type Action,
  type CoordSpacelike,
  type CoordTimelike,
  type Move,
} from './index.js'

const FILES = 'abcdefgh'
const PIECE_NAMES = 'PWKCQYSNRBUD'
const EVALUATION_SYMBOLS = ['!!', '!?', '?!', '??', '!', '?', '-']
const STANDARD_NAG_GLYPHS = new Map<number, string>([
  [1, '!'],
  [2, '?'],
  [3, '!!'],
  [4, '??'],
  [5, '!?'],
  [6, '?!'],
])
const STANDARD_GLYPH_NAGS = new Map([...STANDARD_NAG_GLYPHS.entries()].map(([nag, glyph]) => [glyph, nag]))
const CUSTOM_GLYPH_NAG_START = 140
const RESULT_SYMBOLS = ['1-0', '0-1', '1/2-1/2', '*']
const PIECE_SYMBOLS: Partial<Record<number, string>> = {
  [0x02]: 'R',
  [0x03]: 'N',
  [0x04]: 'B',
  [0x05]: 'Q',
  [0x06]: 'K',
  [0x12]: 'R',
  [0x13]: 'N',
  [0x14]: 'B',
  [0x15]: 'Q',
  [0x16]: 'K',
}

export interface ExportOptions {
  includePieceSymbols?: boolean
  includeTravelMarkers?: boolean
  includeCaptureMarkers?: boolean
  includeCheckMarkers?: boolean
  includePromotionMarkers?: boolean
  includeBuiltInGlyphNAGs?: boolean
  omitUnnecessarySourceSquares?: boolean
  omitSingleMoveSourceBoards?: boolean
  initialMultiverse?: Multiverse
  headers?: ExportHeaders
  result?: ExportResult
  studyAnnotations?: readonly StudyAnnotation[]
  studyGlyphTemplates?: readonly StudyGlyphTemplate[]
}

export type ExportResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export type ExportHeaders = Record<string, string | number | null | undefined> | ExportHeader[]

export interface ExportHeader {
  key: string
  value: string | number | null | undefined
}

export interface FormattedAction {
  index: number
  serial: string
  player: 'w' | 'b'
  moves: FormattedMove[]
}

export interface FormattedMove {
  text: string
  segments: FormattedMoveSegment[]
}

export interface FormattedMoveSegment {
  text: string
  board: CoordTimelike
}

export interface ActionTree {
  variations: ActionTreeVariation[]
}

export interface ActionTreeVariation {
  action: Action
  subtree?: ActionTree
  commentsBefore?: string[]
  commentsAfter?: string[]
  moveGlyphs?: string[][]
}

export type StudyAnnotation = StudyCommentAnnotation | StudyGlyphAnnotation | StudyMarkerAnnotation

export type StudyAnnotationTarget =
  | {
    type: 'action'
    lineId: number
    actionIndex: number
    position: 'before' | 'after'
  }
  | {
    type: 'move'
    lineId: number
    actionIndex: number
    moveIndex: number
  }
  | {
    type: 'square'
    branchId: string
    m: number
    coord: Coord
  }
  | {
    type: 'arrow'
    branchId: string
    from: Coord
    fromPlayer?: Player
    to: Coord
    toPlayer?: Player
  }
  | {
    type: 'cursor'
    lineId: number
    actionIndex: number
  }
  | {
    type: 'line'
    lineId: number
  }

export interface StudyCommentAnnotation {
  id: string
  type: 'comment'
  target: Extract<StudyAnnotationTarget, { type: 'action' }>
  authorId?: string
  text: string
  createdAt: number
  updatedAt: number
}

export interface StudyGlyphAnnotation {
  id: string
  type: 'glyph'
  target: Extract<StudyAnnotationTarget, { type: 'move' }>
  authorId?: string
  glyph: string
}

export interface StudyMarkerAnnotation {
  id: string
  type: 'marker'
  target: StudyAnnotationTarget
  authorId: string
  color?: string
  label?: string
}

export interface StudyGlyphTemplate {
  nag?: number
  glyph: string
  color?: string
}

interface ParsedGame {
  initialMultiverse: Multiverse
  tree: ActionTree
  studyAnnotations: StudyAnnotation[]
  studyGlyphTemplates: StudyGlyphTemplate[]
}

interface FENBoardBlock {
  board: Board
  l: number
  t: number
  player: Player
}

interface MoveFormatContext {
  piece: Piece
  capture: boolean
  branching: boolean
  promotion: boolean
  suffix: string
  sourceBoardText: string
  sourceHint: string
}

interface SourceHintContext {
  piece: Piece
  capture: boolean
  branching: boolean
  promotion: boolean
  sourceBoardText: string
}

interface ActionFormatResult {
  action: FormattedAction
  multiverse: Multiverse
  player: Player
}

interface GlyphExportContext {
  glyphToNag: ReadonlyMap<string, number>
  templates: StudyGlyphTemplate[]
}

interface ResolvedExportOptions extends Required<Omit<ExportOptions, 'headers' | 'result' | 'initialMultiverse'>> {
  initialMultiverse?: Multiverse
  headers?: ExportHeaders
  result: ExportResult
  studyAnnotations: readonly StudyAnnotation[]
  studyGlyphTemplates: readonly StudyGlyphTemplate[]
}

interface BoardPattern {
  l?: number
  t?: number
}

interface MovePattern {
  sourceBoard?: BoardPattern
  targetBoard?: BoardPattern
  piece?: string
  fromFile?: number
  fromRankY?: number
  toFile: number
  toRankY: number
  jump?: '>' | '>>'
  physical?: boolean
}

interface TurnSerial {
  number?: number
  player?: Player
}

const DEFAULT_HEADER_VALUES: Record<string, string> = {
  Event: '5D Chess Online',
  Site: '?',
  Date: '????.??.??',
  Time: '??:??:??',
  Round: '?',
  White: 'White',
  Black: 'Black',
  Mode: '5D',
  Board: 'Standard',
}

const HEADER_ORDER = [
  'Event',
  'Site',
  'Date',
  'Time',
  'Round',
  'White',
  'Black',
  'Result',
  'Mode',
  'Board',
]

const DEFAULT_EXPORT_OPTIONS: ResolvedExportOptions = {
  includePieceSymbols: false,
  includeTravelMarkers: false,
  includeCaptureMarkers: false,
  includeCheckMarkers: false,
  includePromotionMarkers: false,
  includeBuiltInGlyphNAGs: false,
  omitUnnecessarySourceSquares: false,
  omitSingleMoveSourceBoards: false,
  result: '*',
  studyAnnotations: [],
  studyGlyphTemplates: [],
}

export const exportGameState = (
  { actions, initialMultiverse }: Pick<GameState, 'actions'> & Partial<Pick<GameState, 'initialMultiverse'>>,
  options: ExportOptions = {},
): string => {
  return exportActionTree(actionsToTree(actions), {
    ...options,
    initialMultiverse: options.initialMultiverse ?? initialMultiverse,
  })
}

export const exportFEN = (
  multiverse: Multiverse = Multiverse.createInitial(),
): string => {
  const blocks: string[] = []
  for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
    if (! line) continue
    for (const [m, board] of Line.getBoardEntries(line)) {
      if (! board) continue
      const player = m % 2
      blocks.push(`[${formatBoardFEN(board)}:${l}:${Coord.turn(m, player)}:${player === Player.W ? 'w' : 'b'}]`)
    }
  }
  return `${blocks.join('\n')}\n`
}

const shouldExportInitialMultiverse = (multiverse: Multiverse): boolean => (
  exportFEN(multiverse) !== exportFEN(Multiverse.createInitial())
)

export const exportActionTree = (
  tree: ActionTree,
  options: ExportOptions = {},
): string => {
  const resolvedOptions = resolveExportOptions(options)
  const initialMultiverse = resolvedOptions.initialMultiverse ?? Multiverse.createInitial()
  const glyphContext = createGlyphExportContext(tree, resolvedOptions)
  const body = formatActionTree(tree, {
    actionIndex: 0,
    glyphContext,
    multiverse: initialMultiverse,
    options: resolvedOptions,
    player: Player.W,
  })
  const fenPrelude = shouldExportInitialMultiverse(initialMultiverse)
    ? [exportFEN(initialMultiverse).trim(), '']
    : []
  const lines = [
    ...formatHeaders(resolvedOptions, glyphContext.templates),
    '',
    ...fenPrelude,
    ...(body.trim() ? [body] : []),
    resolvedOptions.result,
  ]
  return `${lines.join('\n')}\n`
}

export const formatActions = (
  actions: readonly Action[],
  options: ExportOptions = {},
): FormattedAction[] => {
  const resolvedOptions = resolveExportOptions(options)
  let multiverse = resolvedOptions.initialMultiverse ?? Multiverse.createInitial()
  let player = Player.W

  return actions.map((action, actionIndex) => {
    const result = formatActionInContext(action, {
      actionIndex,
      markTerminalCheckmate: actionIndex === actions.length - 1,
      multiverse,
      options: resolvedOptions,
      player,
    })
    multiverse = result.multiverse
    player = result.player
    return result.action
  })
}

export const importGameState = (input: string): GameState => {
  const { initialMultiverse, tree } = parseGame(input)
  return createGameState(initialMultiverse, actionTreeToMainline(tree))
}

export const parseActionTree = (input: string): ActionTree => {
  return parseGame(input).tree
}

export const parseStudyAnnotations = (input: string): StudyAnnotation[] => {
  return parseGame(input).studyAnnotations
}

export const parseStudyGlyphTemplates = (input: string): StudyGlyphTemplate[] => {
  return parseGame(input).studyGlyphTemplates
}

const parseGame = (input: string): ParsedGame => new Parser(input).parse()

const actionsToTree = (actions: readonly Action[]): ActionTree => {
  const root: ActionTree = { variations: [] }
  let tree = root
  for (const action of actions) {
    const subtree: ActionTree = { variations: [] }
    tree.variations.push({ action, subtree })
    tree = subtree
  }
  return root
}

const actionTreeToMainline = (tree: ActionTree): Action[] => {
  const actions: Action[] = []
  let current: ActionTree | undefined = tree
  while (current && current.variations.length > 0) {
    const variation: ActionTreeVariation = current.variations[current.variations.length - 1]!
    actions.push(variation.action)
    current = variation.subtree
  }
  return actions
}

const createGlyphExportContext = (
  tree: ActionTree,
  options: ResolvedExportOptions,
): GlyphExportContext => {
  const glyphToNag = new Map<string, number>()
  const templates: StudyGlyphTemplate[] = []
  const usedNags = new Set<number>()

  if (options.includeBuiltInGlyphNAGs) {
    for (const [glyph, nag] of STANDARD_GLYPH_NAGS) {
      glyphToNag.set(glyph, nag)
      usedNags.add(nag)
    }
  }

  const addTemplate = (template: StudyGlyphTemplate) => {
    const glyph = template.glyph.trim()
    if (! glyph || glyphToNag.has(glyph)) return
    const requestedNag = template.nag
    const nag = requestedNag !== undefined && Number.isInteger(requestedNag) && requestedNag > 0 && ! usedNags.has(requestedNag)
      ? requestedNag
      : getNextCustomGlyphNAG(usedNags)
    usedNags.add(nag)
    glyphToNag.set(glyph, nag)
    templates.push({
      nag,
      glyph,
      ...(template.color ? { color: template.color } : {}),
    })
  }

  for (const template of options.studyGlyphTemplates) {
    addTemplate(template)
  }

  for (const glyph of collectActionTreeGlyphs(tree)) {
    const shouldUseSymbol = EVALUATION_SYMBOLS.includes(glyph) && ! options.includeBuiltInGlyphNAGs
    if (shouldUseSymbol || glyphToNag.has(glyph)) continue
    addTemplate({ glyph })
  }

  return { glyphToNag, templates }
}

const collectActionTreeGlyphs = (tree: ActionTree): string[] => {
  const glyphs: string[] = []
  for (const variation of tree.variations) {
    for (const moveGlyphs of variation.moveGlyphs ?? []) {
      glyphs.push(...moveGlyphs)
    }
    if (variation.subtree) glyphs.push(...collectActionTreeGlyphs(variation.subtree))
  }
  return glyphs
}

const getNextCustomGlyphNAG = (usedNags: ReadonlySet<number>): number => {
  let nag = CUSTOM_GLYPH_NAG_START
  while (usedNags.has(nag)) nag += 1
  return nag
}

const createStudyAnnotationsFromActionTree = (
  tree: ActionTree,
  commentMetas: readonly StudyCommentMeta[],
  glyphMetas: readonly StudyGlyphMeta[],
): StudyAnnotation[] => {
  const annotations: StudyAnnotation[] = []
  const commentMetaMap = new Map(commentMetas.map(meta => [getStudyCommentMetaMapKey(meta), meta]))
  const glyphMetaMap = new Map(glyphMetas.map(meta => [getStudyGlyphMetaMapKey(meta), meta]))
  let nextLineId = 1

  const addVariationAnnotations = (lineId: number, actionIndex: number, variation: ActionTreeVariation) => {
    addComments(lineId, actionIndex, 'before', variation.commentsBefore)
    addComments(lineId, actionIndex, 'after', variation.commentsAfter)
    variation.moveGlyphs?.forEach((glyphs, moveIndex) => {
      glyphs?.forEach((glyph, index) => {
        const meta = glyphMetaMap.get(getStudyGlyphMetaMapKey({ lineId, actionIndex, moveIndex, index }))
        annotations.push({
          id: `5dpgn-glyph:${lineId}:${actionIndex}:${moveIndex}:${index}`,
          type: 'glyph',
          target: {
            type: 'move',
            lineId,
            actionIndex,
            moveIndex,
          },
          ...formatAuthorFromMeta(meta),
          glyph,
        })
      })
    })
  }

  const addComments = (
    lineId: number,
    actionIndex: number,
    position: 'before' | 'after',
    comments: readonly string[] | undefined,
  ) => {
    comments?.forEach((text, index) => {
      const meta = commentMetaMap.get(getStudyCommentMetaMapKey({ lineId, actionIndex, position, index }))
      annotations.push({
        id: `5dpgn-comment:${lineId}:${actionIndex}:${position}:${index}`,
        type: 'comment',
        target: {
          type: 'action',
          lineId,
          actionIndex,
          position,
        },
        ...formatAuthorFromMeta(meta),
        text,
        createdAt: 0,
        updatedAt: 0,
      })
    })
  }

  const populateLine = (lineId: number, currentTree: ActionTree | undefined, startActionIndex = 0) => {
    let actionIndex = startActionIndex
    let treeAtCursor = currentTree
    while (treeAtCursor && treeAtCursor.variations.length > 0) {
      const mainlineVariation = treeAtCursor.variations[treeAtCursor.variations.length - 1]!
      const branchVariations = treeAtCursor.variations.slice(0, -1)
      for (const variation of branchVariations) {
        const branchLineId = nextLineId ++
        populateVariation(branchLineId, variation)
      }

      addVariationAnnotations(lineId, actionIndex, mainlineVariation)
      actionIndex += 1
      treeAtCursor = mainlineVariation.subtree
    }
  }

  const populateVariation = (lineId: number, variation: ActionTreeVariation) => {
    addVariationAnnotations(lineId, 0, variation)
    populateLine(lineId, variation.subtree, 1)
  }

  populateLine(0, tree)
  return annotations
}

const formatAuthorFromMeta = (
  meta: StudyCommentMeta | StudyGlyphMeta | undefined,
): { authorId?: string } => (
  meta?.authorId === undefined ? {} : { authorId: meta.authorId }
)

const getStudyCommentMetaMapKey = (
  meta: Pick<StudyCommentMeta, 'lineId' | 'actionIndex' | 'position' | 'index'>,
): string => `${meta.lineId}:${meta.actionIndex}:${meta.position}:${meta.index}`

const getStudyGlyphMetaMapKey = (
  meta: Pick<StudyGlyphMeta, 'lineId' | 'actionIndex' | 'moveIndex' | 'index'>,
): string => `${meta.lineId}:${meta.actionIndex}:${meta.moveIndex}:${meta.index}`

const createGameState = (initialMultiverse: Multiverse, actions: Action[]): GameState => {
  let multiverseCommitted = initialMultiverse
  let player = Player.W

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex]!
    for (let moveIndex = 0; moveIndex < action.moves.length; moveIndex += 1) {
      multiverseCommitted = Multiverse.applyMove(
        action.moves[moveIndex]!,
        player,
        multiverseCommitted,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moveIndex,
      )
    }
    if (! Multiverse.hasSubmittedPresentMoves(multiverseCommitted, player)) {
      throw new Error(`5dpgn action ${actionIndex + 1} does not submit the present`)
    }
    player = Players.opponent(player)
  }

  return {
    initialMultiverse,
    actions,
    multiverseCommitted,
    multiverse: multiverseCommitted,
    player,
    actionIndex: actions.length,
    pendingMoves: [],
  }
}

const formatActionTree = (
  tree: ActionTree,
  {
    actionIndex,
    glyphContext,
    multiverse,
    options,
    player,
  }: {
    actionIndex: number
    glyphContext: GlyphExportContext
    multiverse: Multiverse
    options: ResolvedExportOptions
    player: Player
  },
): string => {
  const parts: string[] = []

  for (let index = 0; index < tree.variations.length; index += 1) {
    const variation = tree.variations[index]!
    const hasSubtree = Boolean(variation.subtree?.variations.length)
    const result = formatActionInContext(variation.action, {
      actionIndex,
      markTerminalCheckmate: ! hasSubtree,
      multiverse,
      options,
      player,
    })
    const actionLine = [
      ...formatComments(variation.commentsBefore),
      `${formatActionLine(result.action, variation.moveGlyphs, glyphContext)}${formatComments(variation.commentsAfter).map(comment => ` ${comment}`).join('')}`,
    ].join('\n')
    const subtreeText = hasSubtree
      ? formatActionTree(variation.subtree!, {
          actionIndex: actionIndex + 1,
          glyphContext,
          multiverse: result.multiverse,
          options,
          player: result.player,
        })
      : ''
    const variationText = subtreeText ? `${actionLine}\n${subtreeText}` : actionLine
    const shouldParenthesize = tree.variations.length > 1 && index < tree.variations.length - 1
    parts.push(shouldParenthesize ? `(${variationText})` : variationText)
  }

  return parts.join('\n')
}

const formatActionInContext = (
  action: Action,
  {
    actionIndex,
    markTerminalCheckmate,
    multiverse,
    options,
    player,
  }: {
    actionIndex: number
    markTerminalCheckmate: boolean
    multiverse: Multiverse
    options: ResolvedExportOptions
    player: Player
  },
): ActionFormatResult => {
  const moves: FormattedMove[] = []
  let nextMultiverse = multiverse

  for (let moveIndex = 0; moveIndex < action.moves.length; moveIndex ++) {
    const move = action.moves[moveIndex]!
    const piece = getMovePiece(nextMultiverse, move, player)
    const sourceBoardText = options.omitSingleMoveSourceBoards && action.moves.length === 1
      ? ''
      : formatBoard(move.from)
    const baseContext = {
      piece,
      capture: isCaptureMove(nextMultiverse, move, player, piece),
      branching: isBranchingMove(nextMultiverse, move, player),
      promotion: isPromotionMove(piece, move.to),
      sourceBoardText,
    }
    const context: MoveFormatContext = {
      ...baseContext,
      sourceHint: getSourceHint(
        nextMultiverse,
        move,
        player,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moveIndex,
        baseContext,
        options,
      ),
      suffix: '',
    }
    const checksBefore = options.includeCheckMarkers
      ? new Set(getChecksGiven(nextMultiverse, player).map(getMoveKey))
      : null

    nextMultiverse = Multiverse.applyMove(
      move,
      player,
      nextMultiverse,
      actionIndex * GameState.MOVE_ORDER_STRIDE + moveIndex,
    )
    if (
      options.includeCheckMarkers
      && getChecksGiven(nextMultiverse, player).some(check => ! checksBefore?.has(getMoveKey(check)))
    ) {
      context.suffix = '+'
    }
    moves.push(formatMove(move, context, options))
  }

  if (options.includeCheckMarkers && moves.length > 0 && markTerminalCheckmate) {
    applyTerminalCheckmateMarker(moves, nextMultiverse, player)
  }

  return {
    action: {
      index: actionIndex,
      serial: getTurnSerial(actionIndex),
      player: player === Player.W ? 'w' as const : 'b' as const,
      moves,
    },
    multiverse: nextMultiverse,
    player: Players.opponent(player),
  }
}

const applyTerminalCheckmateMarker = (
  moves: FormattedMove[],
  multiverse: Multiverse,
  player: Player,
): void => {
  const checkmateStatus = GameState.getCheckmateStatus({
    multiverse,
    player: Players.opponent(player),
  })
  if (checkmateStatus !== 'checkmate') return

  const lastMove = moves[moves.length - 1]!
  const withoutCheck = lastMove.text.endsWith('+') ? lastMove.text.slice(0, -1) : lastMove.text
  lastMove.text = `${withoutCheck}#`
  const lastSegment = lastMove.segments[lastMove.segments.length - 1]
  if (lastSegment) {
    lastSegment.text = lastSegment.text.endsWith('+')
      ? `${lastSegment.text.slice(0, -1)}#`
      : `${lastSegment.text}#`
  }
}

const formatActionLine = (
  action: FormattedAction,
  moveGlyphs: readonly (readonly string[] | undefined)[] | undefined,
  glyphContext: GlyphExportContext,
): string => (
  `${action.serial} ${action.moves.map((move, index) => `${move.text}${formatGlyphs(moveGlyphs?.[index], glyphContext)}`).join(' ')}`
)

const formatComments = (comments: readonly string[] | undefined): string[] => (
  comments?.map(comment => `{${comment}}`) ?? []
)

const formatGlyphs = (glyphs: readonly string[] | undefined, glyphContext: GlyphExportContext): string => (
  glyphs?.map(glyph => {
    const nag = glyphContext.glyphToNag.get(glyph)
    return nag === undefined ? glyph : `$${nag}`
  }).join('') ?? ''
)

class Parser {
  private cursor = 0
  private readonly fenBlocks: FENBoardBlock[] = []
  private readonly studyHeaders = new Map<string, string[]>()
  private studyGlyphsByNag = new Map(STANDARD_NAG_GLYPHS)

  constructor(private readonly input: string) {}

  parse(): ParsedGame {
    this.skipPrelude()
    const studyHeaders = parseStudyHeaders(this.studyHeaders)
    this.studyGlyphsByNag = getStudyGlyphsByNag(studyHeaders.glyphTemplates)
    const initialMultiverse = this.fenBlocks.length > 0
      ? createMultiverseFromFENBlocks(this.fenBlocks)
      : Multiverse.createInitial()
    const tree = this.parseGameTree(initialMultiverse, Player.W, 0)
    this.skipSpaceComments()
    if (this.consumeResult()) {
      this.skipSpaceComments()
    }
    if (! this.isDone()) {
      throw this.error(`Unexpected 5dpgn syntax near "${this.input.slice(this.cursor, this.cursor + 32).trim()}"`)
    }
    return {
      initialMultiverse,
      tree,
      studyAnnotations: [
        ...createStudyAnnotationsFromActionTree(tree, studyHeaders.commentMetas, studyHeaders.glyphMetas),
        ...studyHeaders.markerAnnotations,
      ],
      studyGlyphTemplates: studyHeaders.glyphTemplates,
    }
  }

  private parseGameTree(multiverse: Multiverse, player: Player, actionIndex: number): ActionTree {
    const variations: ActionTreeVariation[] = []

    while (true) {
      const commentsBefore = this.readSpaceComments()
      if (this.isDone() || this.peek() === ')' || this.isResultStart()) break

      if (this.isVariationStart()) {
        this.consume('(')
        variations.push(this.parseVariation(multiverse, player, actionIndex, [
          ...commentsBefore,
          ...this.readSpaceComments(),
        ]))
        this.skipSpaceComments()
        this.consume(')')
        continue
      }

      if (! this.isActionStart()) {
        throw this.error(`Expected 5dpgn action near "${this.input.slice(this.cursor, this.cursor + 32).trim()}"`)
      }

      variations.push(this.parseVariation(multiverse, player, actionIndex, commentsBefore))
      break
    }

    return { variations }
  }

  private parseVariation(
    multiverse: Multiverse,
    player: Player,
    actionIndex: number,
    commentsBefore: string[] = [],
  ): ActionTreeVariation {
    const { action, commentsAfter, moveGlyphs, multiverse: nextMultiverse } = this.parseAction(multiverse, player, actionIndex)
    const subtree = this.parseGameTree(nextMultiverse, Players.opponent(player), actionIndex + 1)
    return {
      action,
      ...(subtree.variations.length > 0 ? { subtree } : {}),
      ...(commentsBefore.length > 0 ? { commentsBefore } : {}),
      ...(commentsAfter.length > 0 ? { commentsAfter } : {}),
      ...(moveGlyphs.some(glyphs => glyphs.length > 0) ? { moveGlyphs } : {}),
    }
  }

  private parseAction(
    multiverse: Multiverse,
    player: Player,
    actionIndex: number,
  ): { action: Action, commentsAfter: string[], moveGlyphs: string[][], multiverse: Multiverse } {
    const serial = this.parseTurnSerial()
    this.assertTurnSerial(serial, player, actionIndex)

    const moves: Move[] = []
    const commentsAfter: string[] = []
    const moveGlyphs: string[][] = []
    let nextMultiverse = multiverse

    while (true) {
      const comments = this.readSpaceComments()
      if (
        this.isDone()
        || this.peek() === ')'
        || this.isResultStart()
        || this.isActionStart()
        || this.isVariationStart()
      ) {
        commentsAfter.push(...comments)
        break
      }
      commentsAfter.push(...comments)

      const token = this.readMoveToken()
      if (isNAGToken(token) && moveGlyphs.length > 0) {
        moveGlyphs[moveGlyphs.length - 1]!.push(this.readNAGGlyph(token))
        continue
      }
      moveGlyphs.push(readMoveGlyphs(token, nag => this.readNAGGlyph(nag)))
      const move = resolveMoveToken(
        token,
        nextMultiverse,
        player,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moves.length,
      )
      moves.push(move)
      nextMultiverse = Multiverse.applyMove(
        move,
        player,
        nextMultiverse,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moves.length - 1,
      )
    }

    if (moves.length === 0) throw this.error('Expected at least one 5dpgn move in action')
    return {
      action: { moves },
      commentsAfter,
      moveGlyphs,
      multiverse: nextMultiverse,
    }
  }

  private readNAGGlyph(token: string | number): string {
    const nag = typeof token === 'number'
      ? token
      : Number(/^\$(\d+)$/.exec(token)?.[1] ?? Number.NaN)
    return this.studyGlyphsByNag.get(nag) ?? `$${nag}`
  }

  private parseTurnSerial(): TurnSerial {
    this.skipSpaceComments()
    if (this.peek() === '/') {
      this.cursor += 1
      return {}
    }

    const start = this.cursor
    const number = this.readNaturalNumber()
    if (number === null) throw this.error('Expected 5dpgn turn serial')

    let player: Player | undefined
    if (this.peek() === 'w' || this.peek() === 'b') {
      player = this.peek() === 'w' ? Player.W : Player.B
      this.cursor += 1
    }
    if (this.peek() !== '.') {
      this.cursor = start
      throw this.error('Expected "." after 5dpgn turn serial')
    }
    this.cursor += 1
    return { number, player: player ?? Player.W }
  }

  private assertTurnSerial(serial: TurnSerial, player: Player, actionIndex: number): void {
    const expectedTurn = Math.floor(actionIndex / 2) + 1
    if (serial.number !== undefined && serial.number !== expectedTurn) {
      throw this.error(`Unexpected 5dpgn turn number ${serial.number}; expected ${expectedTurn}`)
    }
    if (serial.player !== undefined && serial.player !== player) {
      throw this.error(`Unexpected 5dpgn player ${serial.player === Player.W ? 'w' : 'b'}`)
    }
  }

  private readMoveToken(): string {
    const start = this.cursor
    let boardDepth = 0
    while (! this.isDone()) {
      const char = this.peek()
      if (boardDepth === 0 && (/\s/.test(char) || char === '{' || char === '}')) break
      if (boardDepth === 0 && char === ')' && start !== this.cursor) break
      if (char === '(') boardDepth += 1
      else if (char === ')') boardDepth -= 1
      if (boardDepth < 0) break
      this.cursor += 1
    }

    if (start === this.cursor) throw this.error('Expected 5dpgn move')
    return this.input.slice(start, this.cursor)
  }

  private skipPrelude(): void {
    while (true) {
      this.skipSpaceComments()
      if (this.peek() !== '[') return
      const content = this.readBracketBlock()
      if (isBoardFenBlock(content)) {
        this.fenBlocks.push(parseFENBlock(content))
        continue
      }
      const header = parseHeaderBlock(content)
      if (header?.key.startsWith('5DStudy_')) {
        const values = this.studyHeaders.get(header.key) ?? []
        values.push(header.value)
        this.studyHeaders.set(header.key, values)
      }
    }
  }

  private readBracketBlock(): string {
    this.consume('[')
    const start = this.cursor
    let quoted = false
    let escaped = false
    while (! this.isDone()) {
      const char = this.peek()
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === '"') {
        quoted = ! quoted
      }
      else if (! quoted && char === ']') {
        break
      }
      this.cursor += 1
    }
    if (this.isDone()) throw this.error('Unterminated 5dpgn bracket block')
    const content = this.input.slice(start, this.cursor)
    this.cursor += 1
    return content
  }

  private isVariationStart(): boolean {
    if (this.peek() !== '(') return false
    let cursor = this.cursor + 1
    cursor = this.skipSpaceCommentsFrom(cursor)
    return this.isActionStartAt(cursor)
  }

  private isActionStart(): boolean {
    return this.isActionStartAt(this.cursor)
  }

  private isActionStartAt(cursor: number): boolean {
    if (this.input[cursor] === '/') return true
    let index = cursor
    if (! isDigit(this.input[index])) return false
    while (isDigit(this.input[index])) index += 1
    if (this.input[index] === 'w' || this.input[index] === 'b') index += 1
    return this.input[index] === '.'
  }

  private isResultStart(): boolean {
    return RESULT_SYMBOLS.some(result => this.input.startsWith(result, this.cursor))
  }

  private consumeResult(): boolean {
    for (const result of RESULT_SYMBOLS) {
      if (this.input.startsWith(result, this.cursor)) {
        this.cursor += result.length
        return true
      }
    }
    return false
  }

  private skipSpaceComments(): void {
    this.readSpaceComments()
  }

  private readSpaceComments(): string[] {
    const comments: string[] = []
    while (this.cursor < this.input.length) {
      if (/\s/.test(this.input[this.cursor]!)) {
        this.cursor += 1
        continue
      }
      if (this.input[this.cursor] !== '{') break
      comments.push(this.readCommentBlock())
    }
    return comments
  }

  private readCommentBlock(): string {
    this.consume('{')
    const start = this.cursor
    let depth = 1
    while (this.cursor < this.input.length && depth > 0) {
      if (this.input[this.cursor] === '{') depth += 1
      else if (this.input[this.cursor] === '}') depth -= 1
      this.cursor += 1
    }
    if (depth > 0) throw this.error('Unterminated 5dpgn comment')
    return this.input.slice(start, this.cursor - 1)
  }

  private skipSpaceCommentsFrom(start: number): number {
    let cursor = start
    while (cursor < this.input.length) {
      if (/\s/.test(this.input[cursor]!)) {
        cursor += 1
        continue
      }
      if (this.input[cursor] !== '{') break
      cursor += 1
      let depth = 1
      while (cursor < this.input.length && depth > 0) {
        if (this.input[cursor] === '{') depth += 1
        else if (this.input[cursor] === '}') depth -= 1
        cursor += 1
      }
      if (depth > 0) throw this.error('Unterminated 5dpgn comment')
    }
    return cursor
  }

  private readNaturalNumber(): number | null {
    const start = this.cursor
    while (isDigit(this.peek())) this.cursor += 1
    if (start === this.cursor) return null
    return Number(this.input.slice(start, this.cursor))
  }

  private consume(expected: string): void {
    if (this.peek() !== expected) throw this.error(`Expected "${expected}"`)
    this.cursor += 1
  }

  private peek(): string {
    return this.input[this.cursor] ?? ''
  }

  private isDone(): boolean {
    return this.cursor >= this.input.length
  }

  private error(message: string): Error {
    return new Error(message)
  }
}

const resolveMoveToken = (
  token: string,
  multiverse: Multiverse,
  player: Player,
  order: number,
): Move => {
  const pattern = parseMovePattern(token, player)
  const candidates = getLegalMoveCandidates(multiverse, player, order).filter(candidate => (
    matchesMovePattern(candidate, pattern, multiverse, player)
  ))

  if (pattern.piece === undefined) {
    const pawnCandidates = candidates.filter(candidate => isPawnPiece(candidate.piece))
    if (pawnCandidates.length === 1) return pawnCandidates[0]!.move
  }

  if (candidates.length === 1) return candidates[0]!.move
  if (candidates.length > 1) throw new Error(`Ambiguous 5dpgn move "${token}"`)
  throw new Error(`Illegal 5dpgn move "${token}"`)
}

const parseMovePattern = (rawToken: string, player: Player): MovePattern => {
  const token = stripMoveAnnotations(rawToken)
  let cursor = 0
  const sourceBoardResult = readBoardAt(token, cursor)
  const sourceBoard = sourceBoardResult?.board
  if (sourceBoardResult) cursor = sourceBoardResult.next

  if (token.startsWith('O-O-O', cursor) || token.startsWith('0-0-0', cursor)) {
    return parseCastlingPattern(sourceBoard, player, false)
  }
  if (token.startsWith('O-O', cursor) || token.startsWith('0-0', cursor)) {
    return parseCastlingPattern(sourceBoard, player, true)
  }

  let piece: string | undefined
  if (PIECE_NAMES.includes(token[cursor] ?? '')) {
    piece = token[cursor]
    cursor += 1
  }

  const body = token.slice(cursor)
  const jumpIndex = body.indexOf('>')
  const targetBoardIndex = findBoardStart(body, 0)
  const isSuperPhysical = jumpIndex >= 0 || targetBoardIndex !== null
  return isSuperPhysical
    ? parseSuperPhysicalPattern(body, sourceBoard, piece)
    : parsePhysicalPattern(body, sourceBoard, piece)
}

const isNAGToken = (token: string): boolean => /^\$\d+$/.test(token)

const parseCastlingPattern = (
  sourceBoard: BoardPattern | undefined,
  player: Player,
  kingSide: boolean,
): MovePattern => {
  const y = player === Player.W ? 7 : 0
  return {
    sourceBoard,
    piece: 'K',
    fromFile: 4,
    fromRankY: y,
    toFile: kingSide ? 6 : 2,
    toRankY: y,
    physical: true,
  }
}

const parsePhysicalPattern = (
  body: string,
  sourceBoard: BoardPattern | undefined,
  piece: string | undefined,
): MovePattern => {
  const { square, prefix } = splitTargetSquare(body)
  const source = parseSourceHint(stripTrailingCapture(prefix))
  return {
    sourceBoard,
    piece,
    ...source,
    toFile: square.x,
    toRankY: square.y,
    physical: true,
  }
}

const parseSuperPhysicalPattern = (
  body: string,
  sourceBoard: BoardPattern | undefined,
  piece: string | undefined,
): MovePattern => {
  const jumpIndex = body.indexOf('>')
  const targetBoardIndex = findBoardStart(body, 0)
  const splitIndex = jumpIndex >= 0
    ? jumpIndex
    : targetBoardIndex
  if (splitIndex === null || splitIndex < 0) {
    throw new Error(`Invalid 5dpgn jump "${body}"`)
  }

  const source = parseSourceHint(body.slice(0, splitIndex))
  let cursor = splitIndex
  let jump: '>' | '>>' | undefined
  if (body.startsWith('>>', cursor)) {
    jump = '>>'
    cursor += 2
  }
  else if (body.startsWith('>', cursor)) {
    jump = '>'
    cursor += 1
  }
  if (body[cursor] === 'x') cursor += 1

  const targetBoardResult = readBoardAt(body, cursor)
  const targetBoard = targetBoardResult?.board
  if (targetBoardResult) cursor = targetBoardResult.next

  const { square, prefix } = splitTargetSquare(body.slice(cursor))
  if (stripTrailingCapture(prefix).length > 0) {
    throw new Error(`Invalid 5dpgn jump target "${body}"`)
  }

  return {
    sourceBoard,
    targetBoard,
    piece,
    ...source,
    toFile: square.x,
    toRankY: square.y,
    jump,
    physical: false,
  }
}

const stripMoveAnnotations = (token: string): string => {
  let result = token
  let changed = true
  while (changed) {
    changed = false
    const nagMatch = /\$\d+$/.exec(result)
    if (nagMatch) {
      result = result.slice(0, -nagMatch[0].length)
      changed = true
      continue
    }
    for (const symbol of EVALUATION_SYMBOLS) {
      if (result.endsWith(symbol)) {
        result = result.slice(0, -symbol.length)
        changed = true
        break
      }
    }
    if (changed) continue
    if (/[+#*~]$/.test(result)) {
      result = result.slice(0, -1)
      changed = true
    }
  }
  return result.replace(/=[A-Z]$/, '')
}

const readMoveGlyphs = (token: string, readNAGGlyph: (nag: number) => string): string[] => {
  const glyphs: string[] = []
  let result = token
  let changed = true

  while (changed) {
    changed = false
    const nagMatch = /\$(\d+)$/.exec(result)
    if (nagMatch) {
      glyphs.unshift(readNAGGlyph(Number(nagMatch[1])))
      result = result.slice(0, -nagMatch[0].length)
      changed = true
      continue
    }
    for (const symbol of EVALUATION_SYMBOLS) {
      if (result.endsWith(symbol)) {
        glyphs.unshift(symbol)
        result = result.slice(0, -symbol.length)
        changed = true
        break
      }
    }
    if (changed) continue
    if (/[+#*~]$/.test(result)) {
      result = result.slice(0, -1)
      changed = true
    }
  }

  return glyphs
}

const splitTargetSquare = (body: string): { prefix: string, square: CoordSpacelike } => {
  if (body.length < 2) throw new Error(`Invalid 5dpgn move body "${body}"`)
  const file = body[body.length - 2]!
  const rank = body[body.length - 1]!
  if (! isFile(file) || ! isRank(rank)) {
    throw new Error(`Invalid 5dpgn target square "${body}"`)
  }
  return {
    prefix: body.slice(0, -2),
    square: parseSquare(file, rank),
  }
}

const parseSourceHint = (hint: string): Pick<MovePattern, 'fromFile' | 'fromRankY'> => {
  const source: Pick<MovePattern, 'fromFile' | 'fromRankY'> = {}
  for (const char of hint) {
    if (isFile(char) && source.fromFile === undefined) {
      source.fromFile = FILES.indexOf(char)
      continue
    }
    if (isRank(char) && source.fromRankY === undefined) {
      source.fromRankY = 8 - Number(char)
      continue
    }
    throw new Error(`Invalid 5dpgn source hint "${hint}"`)
  }
  return source
}

const stripTrailingCapture = (text: string): string => (
  text.endsWith('x') ? text.slice(0, -1) : text
)

const readBoardAt = (text: string, cursor: number): { board: BoardPattern, next: number } | null => {
  if (text[cursor] !== '(') return null
  const end = text.indexOf(')', cursor + 1)
  if (end < 0) throw new Error(`Unterminated 5dpgn board in "${text}"`)
  const content = text.slice(cursor + 1, end)
  return {
    board: parseBoardPattern(content),
    next: end + 1,
  }
}

const parseBoardPattern = (content: string): BoardPattern => {
  const normalized = content.startsWith('L') ? content.slice(1) : content
  if (normalized.includes('T')) {
    const [linePart, timePart] = normalized.split('T')
    if (timePart === undefined || timePart === '') throw new Error(`Invalid 5dpgn board "(${content})"`)
    return {
      ...(linePart ? { l: parseSignedInteger(linePart, content) } : {}),
      t: parseSignedInteger(timePart, content),
    }
  }
  if (normalized === '') throw new Error(`Invalid 5dpgn board "(${content})"`)
  return { l: parseSignedInteger(normalized, content) }
}

const parseSignedInteger = (value: string, context: string): number => {
  if (! /^[+-]?\d+$/.test(value)) throw new Error(`Invalid 5dpgn integer "${context}"`)
  return Number(value)
}

const findBoardStart = (text: string, start: number): number | null => {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] !== '(') continue
    readBoardAt(text, index)
    return index
  }
  return null
}

const getLegalMoveCandidates = (
  multiverse: Multiverse,
  player: Player,
  order: number,
): Array<{ move: Move, piece: Piece }> => {
  const candidates: Array<{ move: Move, piece: Piece }> = []
  for (const from of Multiverse.getMovablePieces(multiverse, player)) {
    const board = Multiverse.getBoard(multiverse, from, player)
    if (isBoardCreatedInSameAction(board, player, order)) continue
    const piece = board ? Board.getPiece(from, board) : Piece.E
    for (const to of Multiverse.getMoveTargets(multiverse, from, player)) {
      candidates.push({ move: { from, to }, piece })
    }
  }
  return candidates
}

const matchesMovePattern = (
  { move, piece }: { move: Move, piece: Piece },
  pattern: MovePattern,
  multiverse: Multiverse,
  player: Player,
): boolean => {
  if (! matchesBoardPattern(move.from, pattern.sourceBoard)) return false
  if (! matchesBoardPattern(move.to, pattern.targetBoard)) return false
  if (pattern.fromFile !== undefined && move.from.x !== pattern.fromFile) return false
  if (pattern.fromRankY !== undefined && move.from.y !== pattern.fromRankY) return false
  if (move.to.x !== pattern.toFile || move.to.y !== pattern.toRankY) return false
  if (! matchesPieceName(piece, pattern.piece)) return false

  const physical = Coord.isSameBoard(move.from, move.to)
  if (pattern.physical !== undefined && physical !== pattern.physical) return false
  if (pattern.jump !== undefined) {
    const branching = isBranchingMove(multiverse, move, player)
    if ((pattern.jump === '>>') !== branching) return false
  }
  return true
}

const matchesBoardPattern = (coord: CoordTimelike, pattern: BoardPattern | undefined): boolean => (
  ! pattern
  || (pattern.l === undefined || coord.l === pattern.l)
  && (pattern.t === undefined || coord.t === pattern.t)
)

const matchesPieceName = (piece: Piece, name: string | undefined): boolean => (
  name === undefined || getPieceName(piece) === name
)

const getPieceName = (piece: Piece): string | null => {
  switch (piece) {
    case Piece.PW:
    case Piece.PB:
      return 'P'
    case Piece.RW:
    case Piece.RB:
      return 'R'
    case Piece.NW:
    case Piece.NB:
      return 'N'
    case Piece.BW:
    case Piece.BB:
      return 'B'
    case Piece.QW:
    case Piece.QB:
      return 'Q'
    case Piece.KW:
    case Piece.KB:
      return 'K'
    default:
      return null
  }
}

const isPawnPiece = (piece: Piece): boolean => (
  piece === Piece.PW || piece === Piece.PB
)

const isBoardCreatedInSameAction = (
  board: Board | null,
  player: Player,
  order: number,
): boolean => {
  if (! board) return false
  if (board.createdByPlayer !== player) return false
  if (board.createdByOrder === null) return false
  return Math.floor(board.createdByOrder / GameState.MOVE_ORDER_STRIDE) === Math.floor(order / GameState.MOVE_ORDER_STRIDE)
}

const isBoardFenBlock = (content: string): boolean => (
  /^.+:[+-]?\d+:\d+:[wb]$/.test(content)
)

const isDigit = (char: string | undefined): boolean => (
  char !== undefined && char >= '0' && char <= '9'
)

const isFile = (char: string): boolean => FILES.includes(char)

const isRank = (char: string): boolean => char >= '1' && char <= '8'

const parseFENBlock = (content: string): FENBoardBlock => {
  const match = /^(.*):([+-]?\d+):(\d+):([wb])$/.exec(content)
  if (! match) throw new Error(`Invalid 5DFEN block "[${content}]"`)
  return {
    board: parseBoardFEN(match[1]!),
    l: Number(match[2]),
    t: Number(match[3]),
    player: match[4] === 'w' ? Player.W : Player.B,
  }
}

const createMultiverseFromFENBlocks = (blocks: FENBoardBlock[]): Multiverse => {
  if (blocks.length === 0) return Multiverse.createInitial()

  const lMin = Math.min(...blocks.map(block => block.l))
  const lMax = Math.max(...blocks.map(block => block.l))
  const lOffset = Math.max(Multiverse.LINE_OFFSET_INITIAL, -lMin)
  const lines: Line[] = []
  const blocksByLine = new Map<number, Array<{ m: number, board: Board }>>()

  for (const block of blocks) {
    const m = Coord.time(block.t, block.player)
    const lineBlocks = blocksByLine.get(block.l) ?? []
    lineBlocks.push({ m, board: block.board })
    blocksByLine.set(block.l, lineBlocks)
  }

  for (const [l, lineBlocks] of blocksByLine) {
    const boards: Board[] = []
    for (const { m, board } of lineBlocks) {
      boards[m] = board
    }
    lines[l + lOffset] = {
      boards,
      mStart: Math.min(...lineBlocks.map(block => block.m)),
    }
  }

  return {
    lines,
    lOffset,
    lFurthestB: lMin + lOffset,
    lFurthestW: lMax + lOffset,
    lastMove: null,
  }
}

const parseBoardFEN = (fen: string): Board => {
  const rows = fen.split('/')
  if (rows.length !== 8) throw new Error(`Invalid 5DFEN board "${fen}"`)

  const pieces = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => Piece.E))
  const unmoved = new Set<string>()

  for (let y = 0; y < rows.length; y += 1) {
    let x = 0
    for (let index = 0; index < rows[y]!.length; index += 1) {
      const char = rows[y]![index]!
      if (/[1-8]/.test(char)) {
        x += Number(char)
        continue
      }

      const piece = fenCharToPiece(char)
      if (piece === null) throw new Error(`Unsupported 5DFEN piece "${char}"`)
      if (x >= 8) throw new Error(`Invalid 5DFEN row "${rows[y]}"`)
      pieces[x]![y] = piece
      if (rows[y]![index + 1] === '*') {
        unmoved.add(`${x},${y}`)
        index += 1
      }
      x += 1
    }
    if (x !== 8) throw new Error(`Invalid 5DFEN row "${rows[y]}"`)
  }

  return {
    pieces,
    canCastleQW: hasUnmovedPiece(pieces, unmoved, 4, 7, Piece.KW) && hasUnmovedPiece(pieces, unmoved, 0, 7, Piece.RW),
    canCastleKW: hasUnmovedPiece(pieces, unmoved, 4, 7, Piece.KW) && hasUnmovedPiece(pieces, unmoved, 7, 7, Piece.RW),
    canCastleQB: hasUnmovedPiece(pieces, unmoved, 4, 0, Piece.KB) && hasUnmovedPiece(pieces, unmoved, 0, 0, Piece.RB),
    canCastleKB: hasUnmovedPiece(pieces, unmoved, 4, 0, Piece.KB) && hasUnmovedPiece(pieces, unmoved, 7, 0, Piece.RB),
    createdBy: null,
    createdByPlayer: null,
    createdByRole: null,
    createdByOrder: null,
  }
}

const hasUnmovedPiece = (
  pieces: Piece[][],
  unmoved: Set<string>,
  x: number,
  y: number,
  piece: Piece,
): boolean => (
  pieces[x]?.[y] === piece && unmoved.has(`${x},${y}`)
)

const formatBoardFEN = (board: Board): string => {
  const rows: string[] = []
  for (let y = 0; y < 8; y += 1) {
    let row = ''
    let empty = 0
    for (let x = 0; x < 8; x += 1) {
      const piece = Board.getPiece({ x, y }, board)
      if (piece === Piece.E) {
        empty += 1
        continue
      }

      if (empty > 0) {
        row += String(empty)
        empty = 0
      }
      row += pieceToFenChar(piece)
      if (shouldMarkUnmoved(board, piece, x, y)) row += '*'
    }
    if (empty > 0) row += String(empty)
    rows.push(row)
  }
  return rows.join('/')
}

const shouldMarkUnmoved = (board: Board, piece: Piece, x: number, y: number): boolean => {
  if (piece === Piece.KW && x === 4 && y === 7) return board.canCastleQW || board.canCastleKW
  if (piece === Piece.RW && x === 0 && y === 7) return board.canCastleQW
  if (piece === Piece.RW && x === 7 && y === 7) return board.canCastleKW
  if (piece === Piece.KB && x === 4 && y === 0) return board.canCastleQB || board.canCastleKB
  if (piece === Piece.RB && x === 0 && y === 0) return board.canCastleQB
  if (piece === Piece.RB && x === 7 && y === 0) return board.canCastleKB
  return false
}

const fenCharToPiece = (char: string): Piece | null => {
  switch (char) {
    case 'P': return Piece.PW
    case 'R': return Piece.RW
    case 'N': return Piece.NW
    case 'B': return Piece.BW
    case 'Q': return Piece.QW
    case 'K': return Piece.KW
    case 'p': return Piece.PB
    case 'r': return Piece.RB
    case 'n': return Piece.NB
    case 'b': return Piece.BB
    case 'q': return Piece.QB
    case 'k': return Piece.KB
    default: return null
  }
}

const pieceToFenChar = (piece: Piece): string => {
  switch (piece) {
    case Piece.PW: return 'P'
    case Piece.RW: return 'R'
    case Piece.NW: return 'N'
    case Piece.BW: return 'B'
    case Piece.QW: return 'Q'
    case Piece.KW: return 'K'
    case Piece.PB: return 'p'
    case Piece.RB: return 'r'
    case Piece.NB: return 'n'
    case Piece.BB: return 'b'
    case Piece.QB: return 'q'
    case Piece.KB: return 'k'
    default:
      throw new Error(`Unsupported 5DFEN piece ${piece}`)
  }
}

const formatHeaders = (options: ResolvedExportOptions, glyphTemplates: readonly StudyGlyphTemplate[]): string[] => {
  const headers = new Map<string, string>()
  for (const [key, value] of Object.entries(DEFAULT_HEADER_VALUES)) {
    headers.set(key, value)
  }
  applyExportHeaders(headers, options.headers)
  headers.set('Result', options.result)
  const studyHeaders = formatStudyAnnotationHeaders(options.studyAnnotations, glyphTemplates)

  const ordered: Array<{ key: string, value: string }> = []
  for (const key of HEADER_ORDER) {
    const value = headers.get(key)
    if (value !== undefined) ordered.push({ key, value })
    headers.delete(key)
  }
  for (const [key, value] of headers) {
    ordered.push({ key, value })
  }
  ordered.push(...studyHeaders)

  return ordered
    .filter(({ key }) => /^[A-Za-z0-9_]+$/.test(key))
    .map(({ key, value }) => `[${key} "${escapeHeaderValue(value)}"]`)
}

const STUDY_HEADER_VERSION = '1'

const formatStudyAnnotationHeaders = (
  annotations: readonly StudyAnnotation[],
  glyphTemplates: readonly StudyGlyphTemplate[],
): Array<{ key: string, value: string }> => {
  if (annotations.length === 0 && glyphTemplates.length === 0) return []

  const output: Array<{ key: string, value: string }> = []
  const members = getStudyAnnotationMembers(annotations)
  const memberIndexes = new Map(members.map((id, index) => [id, index]))

  const memberHeaders = members.map((id) => {
    return { key: '5DStudy_Member', value: formatFlowMap({ id }) }
  })

  glyphTemplates.forEach((template) => {
    output.push({ key: '5DStudy_GlyphTemplate', value: formatFlowMap({
      nag: template.nag,
      glyph: template.glyph,
      ...(template.color ? { color: template.color } : {}),
    }) })
  })

  const commentMetaIndexes = new Map<string, number>()
  const glyphMetaIndexes = new Map<string, number>()

  for (const annotation of annotations) {
    if (annotation.type === 'comment') {
      if (! annotation.authorId) continue
      output.push({ key: '5DStudy_CommentMeta', value: formatFlowMap({
        author: getStudyAnnotationMemberIndex(memberIndexes, annotation.authorId),
        line: annotation.target.lineId,
        action: annotation.target.actionIndex,
        ...(annotation.target.position !== 'after' ? { position: annotation.target.position } : {}),
        index: getNextStudyMetaIndex(commentMetaIndexes, getStudyCommentMetaKey(annotation.target)),
      }) })
      continue
    }

    if (annotation.type === 'glyph') {
      if (! annotation.authorId) continue
      output.push({ key: '5DStudy_GlyphMeta', value: formatFlowMap({
        author: getStudyAnnotationMemberIndex(memberIndexes, annotation.authorId),
        line: annotation.target.lineId,
        action: annotation.target.actionIndex,
        move: annotation.target.moveIndex,
        index: getNextStudyMetaIndex(glyphMetaIndexes, getStudyGlyphMetaKey(annotation.target)),
      }) })
      continue
    }

    if (annotation.type !== 'marker') continue

    switch (annotation.target.type) {
      case 'square':
        output.push({ key: '5DStudy_Square', value: formatFlowMap({
          author: getStudyAnnotationMemberIndex(memberIndexes, annotation.authorId),
          branch: annotation.target.branchId,
          at: formatMarkerCoord(annotation.target.coord, annotation.target.m),
          ...(annotation.label ? { label: annotation.label } : {}),
        }) })
        break

      case 'arrow':
        output.push({ key: '5DStudy_Arrow', value: formatFlowMap({
          author: getStudyAnnotationMemberIndex(memberIndexes, annotation.authorId),
          branch: annotation.target.branchId,
          from: formatMarkerCoord(
            annotation.target.from,
            Coord.boardIndex(annotation.target.from, annotation.target.fromPlayer ?? Player.W),
          ),
          to: formatMarkerCoord(
            annotation.target.to,
            Coord.boardIndex(annotation.target.to, annotation.target.toPlayer ?? Player.W),
          ),
          ...(annotation.label ? { label: annotation.label } : {}),
        }) })
        break
    }
  }
  return output.length === 0
    ? []
    : [
        { key: '5DStudy_Version', value: STUDY_HEADER_VERSION },
        ...memberHeaders,
        ...output,
      ]
}

const getNextStudyMetaIndex = (indexes: Map<string, number>, key: string): number => {
  const index = indexes.get(key) ?? 0
  indexes.set(key, index + 1)
  return index
}

const getStudyCommentMetaKey = (
  target: Extract<StudyAnnotationTarget, { type: 'action' }>,
): string => `${target.lineId}:${target.actionIndex}:${target.position}`

const getStudyGlyphMetaKey = (
  target: Extract<StudyAnnotationTarget, { type: 'move' }>,
): string => `${target.lineId}:${target.actionIndex}:${target.moveIndex}`

const getStudyAnnotationMembers = (annotations: readonly StudyAnnotation[]): string[] => {
  const members: string[] = []
  const seen = new Set<string>()
  for (const annotation of annotations) {
    const authorId = annotation.authorId
    if (! authorId || seen.has(authorId)) continue
    seen.add(authorId)
    members.push(authorId)
  }
  return members
}

const getStudyAnnotationMemberIndex = (
  memberIndexes: ReadonlyMap<string, number>,
  authorId: string | undefined,
): number | undefined => (
  authorId === undefined ? undefined : memberIndexes.get(authorId)
)

const applyExportHeaders = (
  output: Map<string, string>,
  headers: ExportHeaders | undefined,
): void => {
  if (! headers) return

  const entries = Array.isArray(headers)
    ? headers.map(({ key, value }) => [key, value] as const)
    : Object.entries(headers)

  for (const [key, value] of entries) {
    if (! key) continue
    if (value === null || value === undefined) {
      output.delete(key)
      continue
    }
    output.set(key, String(value))
  }
}

const escapeHeaderValue = (value: string | number): string => (
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
)

const parseHeaderBlock = (content: string): { key: string, value: string } | null => {
  const match = /^([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*$/s.exec(content.trim())
  if (! match) return null
  return {
    key: match[1]!,
    value: unescapeHeaderValue(match[2]!),
  }
}

const unescapeHeaderValue = (value: string): string => (
  value.replace(/\\(["\\])/g, '$1')
)

type FlowValue = string | number | boolean | null | undefined

const formatFlowMap = (values: Record<string, FlowValue>): string => {
  const entries = Object.entries(values)
    .filter((entry): entry is [string, Exclude<FlowValue, undefined>] => entry[1] !== undefined)
    .map(([key, value]) => `${key}: ${formatFlowValue(value)}`)
  return `{${entries.join(', ')}}`
}

const formatFlowValue = (value: Exclude<FlowValue, undefined>): string => {
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return 'null'
}

const parseFlowMap = (input: string): Record<string, string | number | boolean | null> => {
  const parser = new FlowMapParser(input)
  return parser.parse()
}

class FlowMapParser {
  private cursor = 0

  constructor(private readonly input: string) {}

  parse(): Record<string, string | number | boolean | null> {
    const result: Record<string, string | number | boolean | null> = {}
    this.skipSpace()
    this.consume('{')
    this.skipSpace()
    while (this.peek() !== '}') {
      const key = this.readKey()
      this.skipSpace()
      this.consume(':')
      this.skipSpace()
      result[key] = this.readValue()
      this.skipSpace()
      if (this.peek() === ',') {
        this.cursor += 1
        this.skipSpace()
        continue
      }
      break
    }
    this.consume('}')
    this.skipSpace()
    if (! this.isDone()) throw new Error(`Unexpected YAML flow content "${this.input.slice(this.cursor)}"`)
    return result
  }

  private readKey(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.input.slice(this.cursor))
    if (! match) throw new Error(`Expected YAML flow key near "${this.input.slice(this.cursor)}"`)
    this.cursor += match[0].length
    return match[0]
  }

  private readValue(): string | number | boolean | null {
    const char = this.peek()
    if (char === "'") return this.readSingleQuotedString()
    if (char === '"') return this.readDoubleQuotedString()

    const start = this.cursor
    while (! this.isDone() && this.peek() !== ',' && this.peek() !== '}') {
      this.cursor += 1
    }
    const raw = this.input.slice(start, this.cursor).trim()
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (raw === 'null') return null
    if (/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return Number(raw)
    if (raw.length > 0) return raw
    throw new Error('Expected YAML flow value')
  }

  private readSingleQuotedString(): string {
    this.consume("'")
    let result = ''
    while (! this.isDone()) {
      const char = this.peek()
      this.cursor += 1
      if (char !== "'") {
        result += char
        continue
      }
      if (this.peek() === "'") {
        this.cursor += 1
        result += "'"
        continue
      }
      return result
    }
    throw new Error('Unterminated YAML single-quoted string')
  }

  private readDoubleQuotedString(): string {
    this.consume('"')
    let result = ''
    while (! this.isDone()) {
      const char = this.peek()
      this.cursor += 1
      if (char === '"') return result
      if (char === '\\') {
        const escaped = this.peek()
        this.cursor += 1
        result += escaped === 'n' ? '\n' : escaped
      }
      else {
        result += char
      }
    }
    throw new Error('Unterminated YAML double-quoted string')
  }

  private skipSpace(): void {
    while (/\s/.test(this.peek())) this.cursor += 1
  }

  private consume(expected: string): void {
    if (this.peek() !== expected) throw new Error(`Expected "${expected}" in YAML flow value`)
    this.cursor += 1
  }

  private peek(): string {
    return this.input[this.cursor] ?? ''
  }

  private isDone(): boolean {
    return this.cursor >= this.input.length
  }
}

interface ParsedStudyHeaders {
  markerAnnotations: StudyMarkerAnnotation[]
  commentMetas: StudyCommentMeta[]
  glyphMetas: StudyGlyphMeta[]
  glyphTemplates: StudyGlyphTemplate[]
}

interface StudyCommentMeta {
  authorId?: string
  lineId: number
  actionIndex: number
  position: 'before' | 'after'
  index: number
}

interface StudyGlyphMeta {
  authorId?: string
  lineId: number
  actionIndex: number
  moveIndex: number
  index: number
}

const parseStudyHeaders = (headers: ReadonlyMap<string, readonly string[]>): ParsedStudyHeaders => {
  try {
    if (headers.size === 0) return emptyParsedStudyHeaders()
    if (getStudyHeaderValues(headers, '5DStudy_Version')[0] !== STUDY_HEADER_VERSION) {
      return emptyParsedStudyHeaders()
    }

    const members = getStudyHeaderValues(headers, '5DStudy_Member')
      .map(value => parseFlowMap(value).id)
      .filter((id): id is string => typeof id === 'string')

    return {
      markerAnnotations: [
        ...getStudyHeaderValues(headers, '5DStudy_Square')
          .map((value, index) => parseStudySquareMarkerAnnotation(value, index, members)),
        ...getStudyHeaderValues(headers, '5DStudy_Arrow')
          .map((value, index) => parseStudyArrowMarkerAnnotation(value, index, members)),
      ]
        .filter((annotation): annotation is StudyMarkerAnnotation => annotation !== null),
      commentMetas: getStudyHeaderValues(headers, '5DStudy_CommentMeta')
        .map(value => parseStudyCommentMeta(value, members))
        .filter((meta): meta is StudyCommentMeta => meta !== null),
      glyphMetas: getStudyHeaderValues(headers, '5DStudy_GlyphMeta')
        .map(value => parseStudyGlyphMeta(value, members))
        .filter((meta): meta is StudyGlyphMeta => meta !== null),
      glyphTemplates: getStudyHeaderValues(headers, '5DStudy_GlyphTemplate')
        .map(parseStudyGlyphTemplate)
        .filter((template): template is StudyGlyphTemplate => template !== null),
    }
  }
  catch {
    return emptyParsedStudyHeaders()
  }
}

const emptyParsedStudyHeaders = (): ParsedStudyHeaders => ({
  markerAnnotations: [],
  commentMetas: [],
  glyphMetas: [],
  glyphTemplates: [],
})

const parseStudyGlyphTemplate = (value: string): StudyGlyphTemplate | null => {
  const item = parseFlowMap(value)
  const glyph = readFlowString(item.glyph)
  if (! glyph) return null
  const nag = readFlowInteger(item.nag)
  return {
    ...(nag === null ? {} : { nag }),
    glyph,
    ...formatOptionalString('color', item.color),
  }
}

const getStudyGlyphsByNag = (templates: readonly StudyGlyphTemplate[]): Map<number, string> => {
  const result = new Map(STANDARD_NAG_GLYPHS)
  for (const template of templates) {
    if (template.nag === undefined) continue
    result.set(template.nag, template.glyph)
  }
  return result
}

const getStudyHeaderValues = (
  headers: ReadonlyMap<string, readonly string[]>,
  key: string,
): string[] => (
  [...(headers.get(key) ?? [])]
)

const parseStudyCommentMeta = (
  value: string,
  members: readonly string[],
): StudyCommentMeta | null => {
  const item = parseFlowMap(value)
  const lineId = readFlowInteger(item.line)
  const actionIndex = readFlowInteger(item.action)
  const index = readFlowInteger(item.index)
  if (lineId === null || actionIndex === null || index === null) return null
  return {
    ...formatAuthorFromFlowValue(item.author, members),
    lineId,
    actionIndex,
    position: item.position === 'before' ? 'before' : 'after',
    index,
  }
}

const parseStudyGlyphMeta = (
  value: string,
  members: readonly string[],
): StudyGlyphMeta | null => {
  const item = parseFlowMap(value)
  const lineId = readFlowInteger(item.line)
  const actionIndex = readFlowInteger(item.action)
  const moveIndex = readFlowInteger(item.move)
  const index = readFlowInteger(item.index)
  if (lineId === null || actionIndex === null || moveIndex === null || index === null) return null
  return {
    ...formatAuthorFromFlowValue(item.author, members),
    lineId,
    actionIndex,
    moveIndex,
    index,
  }
}

const parseStudySquareMarkerAnnotation = (
  value: string,
  index: number,
  members: readonly string[],
): StudyMarkerAnnotation | null => {
  const item = parseFlowMap(value)
  const branchId = readFlowString(item.branch)
  const target = parseMarkerCoord(readFlowString(item.at))
  const authorId = readAuthorId(item.author, members)
  if (! branchId || target === null || authorId === null) return null
  return {
    id: `5dpgn-study-square:${index}`,
    type: 'marker',
    target: {
      type: 'square',
      branchId,
      m: target.m,
      coord: target.coord,
    },
    authorId,
    ...formatOptionalString('color', item.color),
    ...formatOptionalString('label', item.label),
  }
}

const parseStudyArrowMarkerAnnotation = (
  value: string,
  index: number,
  members: readonly string[],
): StudyMarkerAnnotation | null => {
  const item = parseFlowMap(value)
  const branchId = readFlowString(item.branch)
  const from = parseMarkerCoord(readFlowString(item.from))
  const to = parseMarkerCoord(readFlowString(item.to))
  const authorId = readAuthorId(item.author, members)
  if (! branchId || from === null || to === null || authorId === null) return null
  return {
    id: `5dpgn-study-arrow:${index}`,
    type: 'marker',
    target: {
      type: 'arrow',
      branchId,
      from: from.coord,
      fromPlayer: from.player,
      to: to.coord,
      toPlayer: to.player,
    },
    authorId,
    ...formatOptionalString('color', item.color),
    ...formatOptionalString('label', item.label),
  }
}

const readFlowInteger = (value: string | number | boolean | null | undefined): number | null => (
  typeof value === 'number' && Number.isInteger(value) ? value : null
)

const readFlowString = (value: string | number | boolean | null | undefined): string | null => (
  typeof value === 'string' ? value : null
)

const readAuthorId = (
  value: string | number | boolean | null | undefined,
  members: readonly string[],
): string | null => {
  if (typeof value === 'string') return value
  if (typeof value !== 'number' || ! Number.isInteger(value)) return null
  return members[value] ?? null
}

const formatAuthorFromFlowValue = (
  value: string | number | boolean | null | undefined,
  members: readonly string[],
): { authorId?: string } => {
  const authorId = readAuthorId(value, members)
  return authorId === null ? {} : { authorId }
}

const formatOptionalString = <Key extends string>(
  key: Key,
  value: string | number | boolean | null | undefined,
): Partial<Record<Key, string>> => (
  typeof value === 'string' ? { [key]: value } as Partial<Record<Key, string>> : {}
)

const formatMarkerCoord = (coord: Coord, m: number): string => `(${coord.l}M${m})${formatSquare(coord)}`

const parseMarkerCoord = (value: string | null): { coord: Coord, m: number, player: Player } | null => {
  if (value === null) return null
  const match = /^\(([+-]?\d+)M([+-]?\d+)\)([a-h])([1-8])$/.exec(value)
  if (! match) return null
  const l = Number(match[1])
  const m = Number(match[2])
  const player = m % 2 === Player.B ? Player.B : Player.W
  const file = match[3]!
  const rank = match[4]!
  return {
    coord: {
      l,
      t: Math.floor(m / 2),
      ...parseSquare(file, rank),
    },
    m,
    player,
  }
}

const parseSquare = (file: string, rank: string): CoordSpacelike => ({
  x: FILES.indexOf(file),
  y: 8 - Number(rank),
})

const formatMove = (
  { from, to }: Move,
  context: MoveFormatContext,
  options: ResolvedExportOptions,
): FormattedMove => {
  const fromText = `${context.sourceBoardText}${formatPieceSymbol(context.piece, options)}${context.sourceHint}`
  const promotion = options.includePromotionMarkers && context.promotion ? '=Q' : ''
  const suffix = options.includeCheckMarkers ? context.suffix : ''
  const capture = options.includeCaptureMarkers && context.capture ? 'x' : ''
  const toSquare = formatSquare(to)
  if (Coord.isSameBoard(from, to)) {
    const text = `${fromText}${capture}${toSquare}${promotion}${suffix}`
    return {
      text,
      segments: [{
        text,
        board: from,
      }],
    }
  }

  const travel = options.includeTravelMarkers
    ? context.branching ? '>>' : '>'
    : ''
  const sourceText = fromText
  const targetText = `${travel}${capture}${formatBoard(to)}${toSquare}${promotion}${suffix}`
  return {
    text: `${sourceText}${targetText}`,
    segments: [
      {
        text: sourceText,
        board: from,
      },
      {
        text: targetText,
        board: to,
      },
    ],
  }
}

const getSourceHint = (
  multiverse: Multiverse,
  move: Move,
  player: Player,
  order: number,
  context: SourceHintContext,
  options: ResolvedExportOptions,
): string => {
  const fullSource = formatSquare(move.from)
  if (! options.omitUnnecessarySourceSquares) return fullSource

  for (const hint of getSourceHintCandidates(move.from)) {
    if (doesMoveTokenResolveToMove(
      formatMoveTokenForSourceHint(move, context, options, hint),
      move,
      multiverse,
      player,
      order,
    )) {
      return hint
    }
  }
  return fullSource
}

const getSourceHintCandidates = (from: CoordSpacelike): string[] => {
  const file = FILES[from.x]!
  const rank = `${8 - from.y}`
  return ['', file, rank, `${file}${rank}`]
}

const formatMoveTokenForSourceHint = (
  move: Move,
  context: SourceHintContext,
  options: ResolvedExportOptions,
  sourceHint: string,
): string => {
  const sourceText = `${context.sourceBoardText}${formatPieceSymbol(context.piece, options)}${sourceHint}`
  const promotion = options.includePromotionMarkers && context.promotion ? '=Q' : ''
  const capture = options.includeCaptureMarkers && context.capture ? 'x' : ''
  const toSquare = formatSquare(move.to)
  if (Coord.isSameBoard(move.from, move.to)) return `${sourceText}${capture}${toSquare}${promotion}`

  const travel = options.includeTravelMarkers
    ? context.branching ? '>>' : '>'
    : ''
  return `${sourceText}${travel}${capture}${formatBoard(move.to)}${toSquare}${promotion}`
}

const doesMoveTokenResolveToMove = (
  token: string,
  move: Move,
  multiverse: Multiverse,
  player: Player,
  order: number,
): boolean => {
  try {
    const pattern = parseMovePattern(token, player)
    const matches = getLegalMoveCandidates(multiverse, player, order).filter(candidate => (
      matchesMovePattern(candidate, pattern, multiverse, player)
    ))
    return matches.length === 1 && isSameMove(matches[0]!.move, move)
  }
  catch {
    return false
  }
}

const isSameMove = (p: Move, q: Move): boolean => (
  Coord.isSame(p.from, q.from) && Coord.isSame(p.to, q.to)
)

const formatBoard = ({ l, t }: CoordTimelike): string => `(${l}T${t})`

const formatSquare = ({ x, y }: CoordSpacelike): string => `${FILES[x]}${8 - y}`

const formatPieceSymbol = (piece: Piece, options: ResolvedExportOptions): string => (
  options.includePieceSymbols ? PIECE_SYMBOLS[piece] ?? '' : ''
)

const resolveExportOptions = (options: ExportOptions): ResolvedExportOptions => ({
  ...DEFAULT_EXPORT_OPTIONS,
  ...options,
})

const getMovePiece = (multiverse: Multiverse, { from }: Move, player: Player): Piece => {
  const board = Multiverse.getBoard(multiverse, from, player)
  return board ? Board.getPiece(from, board) : Piece.E
}

const isCaptureMove = (
  multiverse: Multiverse,
  { from, to }: Move,
  player: Player,
  piece: Piece,
): boolean => {
  const targetBoard = Multiverse.getBoard(multiverse, to, player)
  const targetPiece = targetBoard ? Board.getPiece(to, targetBoard) : Piece.E
  if (Pieces.getPlayer(targetPiece) === Players.opponent(player)) return true

  if (! Coord.isSameBoard(from, to)) return false
  if (piece !== Piece.PW && piece !== Piece.PB) return false
  if (Math.abs(to.x - from.x) !== 1) return false

  const sourceBoard = Multiverse.getBoard(multiverse, from, player)
  if (! sourceBoard) return false
  return Pieces.getPlayer(Board.getPiece({ x: to.x, y: from.y }, sourceBoard)) === Players.opponent(player)
}

const isBranchingMove = (multiverse: Multiverse, { from, to }: Move, player: Player): boolean => {
  if (Coord.isSameBoard(from, to)) return false

  const line = Multiverse.getLine(multiverse, to.l)
  const latestM = line ? Line.getLatestBoardIndex(line) : null
  if (latestM === null) return false
  return Coord.boardIndex(to, player) < latestM
}

const isPromotionMove = (piece: Piece, to: CoordSpacelike): boolean => (
  Pieces.promotePawn(piece, to) !== piece
)

const getChecksGiven = (multiverse: Multiverse, attackingPlayer: Player): Move[] => (
  Multiverse.findChecks(
    Multiverse.createPhantom(multiverse, Players.opponent(attackingPlayer)),
    attackingPlayer,
  )
)

const getMoveKey = ({ from, to }: Move): string => (
  `${from.l}:${from.t}:${from.x}:${from.y}->${to.l}:${to.t}:${to.x}:${to.y}`
)

const getTurnSerial = (actionIndex: number): string => {
  const turn = Math.floor(actionIndex / 2) + 1
  const player = actionIndex % 2 === 0 ? 'w' : 'b'
  return `${turn}${player}.`
}
