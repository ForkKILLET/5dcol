import { Player, type Action, type Move, type Multiverse } from '@5dcol/core'
import { type RecordCursor, type StoredRecordAnnotation, type StoredRecordLine } from '@5dcol/shared/protocol'

export interface PendingMove {
  move: Move
  isPass?: boolean
  order: number
  multiverseBefore: Multiverse
  is5D: boolean
  from: {
    l: number
    m: number
  }
  created: {
    l: number
    m: number
  }
}

export interface StoredGameState {
  version: 1
  initialMultiverse?: Multiverse
  actions?: Action[]
  recordLines?: StoredRecordLine[]
  recordAnnotations?: StoredRecordAnnotation[]
  activeRecordLineId?: number
  nextRecordLineId?: number
  multiverseCommitted: Multiverse
  multiverse: Multiverse
  player: Player
  actionIndex: number
  pendingMoves: PendingMove[]
  workspace?: GameWorkspaceState
}

export const GAME_STORAGE_KEY = '5dcol.gameState'

export interface GameBoardFocus {
  l: number
  m: number
}

export interface GameWorkspaceState {
  recordCursor?: RecordCursor | null
  focusedBoard?: GameBoardFocus | null
}

export const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  }
  catch {
    return null
  }
}

export const isStoredGameState = (
  state: Partial<StoredGameState>,
): state is StoredGameState => (
  state.version === 1
    && isMultiverseLike(state.multiverseCommitted)
    && isMultiverseLike(state.multiverse)
    && (state.initialMultiverse === undefined || isMultiverseLike(state.initialMultiverse))
    && (state.actions === undefined || Array.isArray(state.actions))
    && (state.recordLines === undefined || Array.isArray(state.recordLines))
    && (state.recordAnnotations === undefined || Array.isArray(state.recordAnnotations))
    && (state.activeRecordLineId === undefined || typeof state.activeRecordLineId === 'number')
    && (state.nextRecordLineId === undefined || typeof state.nextRecordLineId === 'number')
    && (state.player === Player.W || state.player === Player.B)
    && typeof state.actionIndex === 'number'
    && Array.isArray(state.pendingMoves)
    && (state.workspace === undefined || isGameWorkspaceState(state.workspace))
)

const isMultiverseLike = (value: unknown): value is Multiverse => {
  if (! value || typeof value !== 'object') return false
  const multiverse = value as Partial<Multiverse>
  return Array.isArray(multiverse.lines)
    && typeof multiverse.lOffset === 'number'
    && typeof multiverse.lFurthestB === 'number'
    && typeof multiverse.lFurthestW === 'number'
}

export const isGameWorkspaceState = (value: unknown): value is GameWorkspaceState => {
  if (! value || typeof value !== 'object') return false
  const workspace = value as Partial<GameWorkspaceState>
  return (workspace.recordCursor === undefined || workspace.recordCursor === null || isRecordCursorLike(workspace.recordCursor))
    && (workspace.focusedBoard === undefined || workspace.focusedBoard === null || isGameBoardFocusLike(workspace.focusedBoard))
}

const isRecordCursorLike = (value: unknown): value is RecordCursor => {
  if (! value || typeof value !== 'object') return false
  const cursor = value as Partial<RecordCursor>
  return Number.isInteger(cursor.recordLineId)
    && Number.isInteger(cursor.recordActionIndex)
    && cursor.recordLineId! >= 0
    && cursor.recordActionIndex! >= 0
}

const isGameBoardFocusLike = (value: unknown): value is GameBoardFocus => {
  if (! value || typeof value !== 'object') return false
  const focus = value as Partial<GameBoardFocus>
  return Number.isInteger(focus.l)
    && Number.isInteger(focus.m)
}
