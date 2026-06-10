import { Coord, FiveDPGN, Player, type Action } from '@5dcol/core'

export interface GameRecordAction {
  index: number
  serial: string
  player: 'w' | 'b'
  clock: GameRecordClock | null
  moves: GameRecordMove[]
}

export interface GameRecordClock {
  elapsed: string
  total: string
}

export interface GameRecordMove {
  segments: GameRecordMoveSegment[]
}

export interface GameRecordMoveSegment {
  text: string
  l: number
  m: number
}

export const buildGameRecordActions = (
  actions: Action[],
  options?: FiveDPGN.ExportOptions,
): GameRecordAction[] => (
  FiveDPGN.formatActions(actions, options).map((action) => {
    const sourceAction = actions[action.index]
    return {
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
