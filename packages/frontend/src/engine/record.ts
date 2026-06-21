import { Coord, FiveDPGN, Player, type Action, type Move, type Multiverse } from '@5dcol/core'
import { type RecordDocument, type RecordLine } from '@engine/recordTree'

export interface GameRecordAction {
  kind: 'action'
  index: number
  serial: string
  player: 'w' | 'b'
  clock: GameRecordClock | null
  moves: GameRecordMove[]
  recordKey?: string
  recordLineId?: number
  recordActionIndex?: number
  branchDepth?: number
  pending?: boolean
  commentsBefore?: GameRecordComment[]
  commentsAfter?: GameRecordComment[]
}

export interface GameRecordCursor {
  kind: 'cursor'
  recordKey: string
  recordLineId: number
  recordActionIndex: number
  branchDepth: number
  hasFuture?: boolean
  pending?: boolean
  current?: boolean
}

export type GameRecordRow = GameRecordAction | GameRecordCursor

export interface GameRecordClock {
  elapsed: string
  total: string
}

export interface GameRecordMove {
  segments: GameRecordMoveSegment[]
  glyphs?: GameRecordGlyph[]
}

export interface GameRecordMoveSegment {
  text: string
  l: number
  m: number
  recordLineId?: number
  recordActionIndex?: number
  moveIndex?: number
  segmentIndex?: number
  segmentCount?: number
}

export interface GameRecordComment {
  id: string
  text: string
  authorId?: string
  createdAt: number
  updatedAt: number
}

export interface GameRecordGlyph {
  id: string
  glyph: string
  authorId?: string
}

export interface BuildGameRecordRowsOptions {
  document: RecordDocument
  actionIndex: number
  pendingMoves: Move[]
  initialMultiverse: Multiverse
  fiveDPGNOptions?: FiveDPGN.ExportOptions
}

export const buildGameRecordRows = ({
  document,
  actionIndex,
  pendingMoves,
  initialMultiverse,
  fiveDPGNOptions = {},
}: BuildGameRecordRowsOptions): GameRecordRow[] => (
  buildGameRecordLineRows({
    document,
    lineId: 0,
    prefixActions: [],
    actionIndex,
    pendingMoves,
    fiveDPGNOptions: {
      ...fiveDPGNOptions,
      initialMultiverse,
    },
  })
)

export const buildGameRecordActions = (
  actions: Action[],
  options?: FiveDPGN.ExportOptions,
): GameRecordAction[] => (
  FiveDPGN.formatActions(actions, options).map((action) => {
    const sourceAction = actions[action.index]
    return {
      kind: 'action',
      index: action.index,
      serial: action.serial,
      player: action.player,
      clock: sourceAction.clock
        ? {
            elapsed: formatDuration(sourceAction.clock.elapsedMs),
            total: formatDuration(sourceAction.clock.totalMs),
          }
        : null,
      moves: action.moves.map(move => ({
        segments: move.segments.map(segment => ({
          text: segment.text,
          l: segment.board.l,
          m: Coord.boardIndex(segment.board, action.player === 'w' ? Player.W : Player.B),
          segmentCount: move.segments.length,
        })),
      })),
    }
  })
)

export const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const buildGameRecordLineRows = ({
  document,
  lineId,
  prefixActions,
  actionIndex: globalActionIndex,
  pendingMoves,
  fiveDPGNOptions,
}: {
  document: RecordDocument
  lineId: number
  prefixActions: Action[]
  actionIndex: number
  pendingMoves: Move[]
  fiveDPGNOptions: FiveDPGN.ExportOptions
}): GameRecordRow[] => {
  const line = document.getLine(lineId)
  if (! line) return []

  const rows: GameRecordRow[] = []
  const activePendingLocalActionIndex = getActiveLocalActionIndex({
    document,
    line,
    globalActionIndex,
    enabled: pendingMoves.length > 0,
  })
  const currentCursorLocalActionIndex = getActiveLocalActionIndex({
    document,
    line,
    globalActionIndex,
    enabled: pendingMoves.length === 0,
  })
  const lineRows = buildGameRecordActions([
    ...prefixActions,
    ...line.actions,
  ], fiveDPGNOptions)

  for (let lineActionIndex = 0; lineActionIndex <= line.actions.length; lineActionIndex += 1) {
    const hasFuture = document.hasFutureAt(line.id, lineActionIndex)
    const isPendingAtActionIndex = activePendingLocalActionIndex === lineActionIndex
    const isCurrentCursorAtActionIndex = currentCursorLocalActionIndex === lineActionIndex
    const shouldRenderCursorAtActionIndex = line.id === 0 || lineActionIndex > 0 || hasFuture || isPendingAtActionIndex
    if (shouldRenderCursorAtActionIndex) {
      rows.push({
        kind: 'cursor',
        recordKey: `${line.id}:cursor:${lineActionIndex}`,
        recordLineId: line.id,
        recordActionIndex: lineActionIndex,
        branchDepth: line.depth,
        hasFuture,
        pending: isPendingAtActionIndex || undefined,
        current: isPendingAtActionIndex || isCurrentCursorAtActionIndex,
      })
    }

    const branchIds = line.branchLineIdsBeforeAction.get(lineActionIndex) ?? []
    const branchPrefixActions = [
      ...prefixActions,
      ...line.actions.slice(0, lineActionIndex),
    ]
    for (const branchId of branchIds) {
      rows.push(...buildGameRecordLineRows({
        document,
        lineId: branchId,
        prefixActions: branchPrefixActions,
        actionIndex: globalActionIndex,
        pendingMoves,
        fiveDPGNOptions,
      }))
    }

    if (isPendingAtActionIndex) {
      const pendingRows = buildGameRecordActions([
        ...branchPrefixActions,
        { moves: pendingMoves },
      ], fiveDPGNOptions)
      const pendingRow = pendingRows.at(-1)
      if (pendingRow) {
        const pendingActionKey = hasFuture
          ? `${line.id}:${lineActionIndex}:pending`
          : `${line.id}:${lineActionIndex}`
        rows.push({
          ...pendingRow,
          recordKey: pendingActionKey,
          recordLineId: line.id,
          recordActionIndex: lineActionIndex,
          branchDepth: line.depth,
          pending: true,
        })
      }
    }

    if (lineActionIndex >= line.actions.length) continue

    const row = lineRows[prefixActions.length + lineActionIndex]
    if (! row) continue

    rows.push({
      ...row,
      recordKey: `${line.id}:${lineActionIndex}`,
      recordLineId: line.id,
      recordActionIndex: lineActionIndex,
      branchDepth: line.depth,
      commentsBefore: getActionComments(document, line.id, lineActionIndex, 'before'),
      commentsAfter: getActionComments(document, line.id, lineActionIndex, 'after'),
      moves: row.moves.map((move, moveIndex) => ({
        ...move,
        segments: move.segments.map((segment, segmentIndex) => ({
          ...segment,
          recordLineId: line.id,
          recordActionIndex: lineActionIndex,
          moveIndex,
          segmentIndex,
          segmentCount: move.segments.length,
        })),
        glyphs: getMoveGlyphs(document, line.id, lineActionIndex, moveIndex),
      })),
    })
  }

  return rows
}

const getActiveLocalActionIndex = ({
  document,
  line,
  globalActionIndex,
  enabled,
}: {
  document: RecordDocument
  line: RecordLine
  globalActionIndex: number
  enabled: boolean
}): number | null => (
  enabled && line.id === document.activeRecordLineId
    ? document.getActiveLineLocalActionIndex(globalActionIndex)
    : null
)

const getActionComments = (
  document: RecordDocument,
  lineId: number,
  actionIndex: number,
  position: 'before' | 'after',
): GameRecordComment[] => (
  document.getActionComments(lineId, actionIndex, position)
    .map(annotation => ({
      id: annotation.id,
      text: annotation.text,
      authorId: annotation.authorId,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
    }))
)

const getMoveGlyphs = (
  document: RecordDocument,
  lineId: number,
  actionIndex: number,
  moveIndex: number,
): GameRecordGlyph[] => (
  document.getMoveGlyphAnnotations(lineId, actionIndex, moveIndex)
    .map(annotation => ({
      id: annotation.id,
      glyph: annotation.glyph,
      authorId: annotation.authorId,
    }))
)
