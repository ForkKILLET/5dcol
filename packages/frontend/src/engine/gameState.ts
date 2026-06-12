import { Player, type Action, type Move, type Multiverse } from '@5dcol/core'

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
  actions?: Action[]
  recordLines?: StoredRecordLine[]
  activeRecordLineId?: number
  nextRecordLineId?: number
  multiverseCommitted: Multiverse
  multiverse: Multiverse
  player: Player
  actionIndex: number
  pendingMoves: PendingMove[]
}

export interface StoredRecordLine {
  id: number
  parent: {
    lineId: number
    beforeActionIndex: number
  } | null
  actions: Action[]
  branchLineIdsBeforeAction: [number, number[]][]
  depth: number
}

export const GAME_STORAGE_KEY = '5dcol.gameState'

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
    && (state.actions === undefined || Array.isArray(state.actions))
    && (state.recordLines === undefined || Array.isArray(state.recordLines))
    && (state.activeRecordLineId === undefined || typeof state.activeRecordLineId === 'number')
    && (state.nextRecordLineId === undefined || typeof state.nextRecordLineId === 'number')
    && (state.player === Player.W || state.player === Player.B)
    && typeof state.actionIndex === 'number'
    && Array.isArray(state.pendingMoves)
)

const isMultiverseLike = (value: unknown): value is Multiverse => {
  if (! value || typeof value !== 'object') return false
  const multiverse = value as Partial<Multiverse>
  return Array.isArray(multiverse.lines)
    && typeof multiverse.lOffset === 'number'
    && typeof multiverse.lFurthestB === 'number'
    && typeof multiverse.lFurthestW === 'number'
}
