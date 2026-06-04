import { Coord, Player, type Action, type CoordSpacelike, type Move } from '@5dcol/core'

const FILES = 'abcdefgh'

export interface GameRecordAction {
  index: number
  serial: string
  player: 'w' | 'b'
  moves: GameRecordMove[]
}

export interface GameRecordMove {
  segments: GameRecordMoveSegment[]
}

export interface GameRecordMoveSegment {
  text: string
  l: number
  m: number
}

export const buildGameRecordActions = (actions: Action[]): GameRecordAction[] => (
  actions.map((action, index) => {
    const player = index % 2 === 0 ? Player.W : Player.B
    return {
      index,
      serial: getActionSerial(index),
      player: player === Player.W ? 'w' : 'b',
      moves: action.moves.map(move => toGameRecordMove(move, player)),
    }
  })
)

const toGameRecordMove = (move: Move, player: Player): GameRecordMove => {
  const fromTarget = {
    l: move.from.l,
    m: Coord.boardIndex(move.from, player),
  }
  const toTarget = {
    l: move.to.l,
    m: Coord.boardIndex(move.to, player),
  }

  if (Coord.isSameBoard(move.from, move.to)) {
    return {
      segments: [{
        ...fromTarget,
        text: `${formatBoard(move.from)}${formatSquare(move.from)}${formatSquare(move.to)}`,
      }],
    }
  }

  return {
    segments: [
      {
        ...fromTarget,
        text: `${formatBoard(move.from)}${formatSquare(move.from)}`,
      },
      {
        ...toTarget,
        text: `${formatBoard(move.to)}${formatSquare(move.to)}`,
      },
    ],
  }
}

const getActionSerial = (actionIndex: number): string => {
  const turn = Math.floor(actionIndex / 2) + 1
  const player = actionIndex % 2 === 0 ? 'w' : 'b'
  return `${turn}${player}.`
}

const formatBoard = ({ l, t }: Pick<Move['from'], 'l' | 't'>): string => (
  `(${l}T${t})`
)

const formatSquare = ({ x, y }: CoordSpacelike): string => (
  `${FILES[x]}${8 - y}`
)
