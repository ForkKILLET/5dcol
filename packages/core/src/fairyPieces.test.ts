import { describe, expect, it } from 'vitest'
import {
  Board,
  Multiverse,
  Piece,
  Pieces,
  Player,
  type Board as BoardState,
  type Multiverse as MultiverseState,
} from './index'
import * as FiveDPGN from './fiveDPGN'

const createEmptyBoard = (width = 8, height = 8): BoardState => ({
  width,
  height,
  pieces: Array.from({ length: width }, () => Array.from({ length: height }, () => Piece.E)),
  unmoved: Array.from({ length: width }, () => Array.from({ length: height }, () => false)),
  canCastleQW: false,
  canCastleKW: false,
  canCastleQB: false,
  canCastleKB: false,
  createdBy: null,
  createdByPlayer: null,
  createdByRole: null,
  createdByOrder: null,
})

const createCompoundMoveMultiverse = (): MultiverseState => {
  const lOffset = 4
  const lines: MultiverseState['lines'] = []
  for (const displayLine of [-1, 0]) {
    const l = Multiverse.parseLine(String(displayLine))
    const boards: BoardState[] = []
    for (const t of [1, 2, 3]) boards[t * 2 + Player.W] = createEmptyBoard()
    lines[lOffset + l] = { boards, mStart: 2 }
  }
  return {
    lines,
    lOffset,
    lFurthestB: lOffset + Multiverse.parseLine('-1'),
    lFurthestW: lOffset,
    lastMove: null,
  }
}

describe('fairy piece physical movement', () => {
  it('moves princesses as physical queens', () => {
    const board = createEmptyBoard()
    Board.setPiece({ x: 3, y: 3 }, board, Piece.SW)
    Board.setPiece({ x: 3, y: 0 }, board, Piece.PB)
    Board.setPiece({ x: 6, y: 6 }, board, Piece.PW)

    const targets = Board.getMoveTargets2D(board, { x: 3, y: 3 })

    expect(targets).toContainEqual({ x: 3, y: 0 })
    expect(targets).toContainEqual({ x: 0, y: 3 })
    expect(targets).toContainEqual({ x: 0, y: 0 })
    expect(targets).not.toContainEqual({ x: 6, y: 6 })
    expect(targets).not.toContainEqual({ x: 7, y: 7 })
  })

  it('lets brawns move as pawns and capture on every physical diagonal', () => {
    const board = createEmptyBoard(5, 5)
    Board.setPiece({ x: 2, y: 2 }, board, Piece.WW)
    Board.setPiece({ x: 1, y: 1 }, board, Piece.PB)
    Board.setPiece({ x: 3, y: 3 }, board, Piece.NB)
    Board.setPiece({ x: 1, y: 3 }, board, Piece.PW)

    const targets = Board.getMoveTargets2D(board, { x: 2, y: 2 })

    expect(targets).toContainEqual({ x: 2, y: 1 })
    expect(targets).toContainEqual({ x: 1, y: 1 })
    expect(targets).toContainEqual({ x: 3, y: 3 })
    expect(targets).not.toContainEqual({ x: 1, y: 3 })
  })

  it('treats royal queens as royal and common kings as non-royal', () => {
    const board = createEmptyBoard()
    Board.setPiece({ x: 3, y: 3 }, board, Piece.YW)
    Board.setPiece({ x: 6, y: 6 }, board, Piece.CW)

    const royalQueenTargets = Board.getMoveTargets2D(board, { x: 3, y: 3 })
    const commonKingTargets = Board.getMoveTargets2D(board, { x: 6, y: 6 })

    expect(Pieces.isRoyal(Piece.YW)).toBe(true)
    expect(Pieces.isRoyal(Piece.CW)).toBe(false)
    expect(royalQueenTargets).toContainEqual({ x: 3, y: 0 })
    expect(royalQueenTargets).toContainEqual({ x: 0, y: 0 })
    expect(commonKingTargets).toContainEqual({ x: 5, y: 5 })
    expect(commonKingTargets).not.toContainEqual({ x: 4, y: 4 })
  })

  it('does not give unicorns or dragons physical-only moves', () => {
    const board = createEmptyBoard()
    Board.setPiece({ x: 2, y: 2 }, board, Piece.UW)
    Board.setPiece({ x: 5, y: 5 }, board, Piece.DW)

    expect(Board.getMoveTargets2D(board, { x: 2, y: 2 })).toEqual([])
    expect(Board.getMoveTargets2D(board, { x: 5, y: 5 })).toEqual([])
  })
})

describe('fairy piece multiverse movement', () => {
  it('moves unicorns along exactly three dimensions', () => {
    const multiverse = createCompoundMoveMultiverse()
    const from = { l: 0, t: 3, x: 3, y: 3 }
    const board = Multiverse.getBoard(multiverse, from, Player.W)
    if (! board) throw new Error('Missing source board')
    Board.setPiece(from, board, Piece.UW)

    const targets = Multiverse.getMoveTargets(multiverse, from, Player.W)

    expect(targets).toContainEqual({
      l: Multiverse.parseLine('-1'),
      t: 2,
      x: 4,
      y: 3,
    })
    expect(targets).not.toContainEqual({
      l: Multiverse.parseLine('-1'),
      t: 2,
      x: 4,
      y: 4,
    })
  })

  it('moves dragons along all four dimensions', () => {
    const multiverse = createCompoundMoveMultiverse()
    const from = { l: 0, t: 3, x: 3, y: 3 }
    const board = Multiverse.getBoard(multiverse, from, Player.W)
    if (! board) throw new Error('Missing source board')
    Board.setPiece(from, board, Piece.DW)

    const targets = Multiverse.getMoveTargets(multiverse, from, Player.W)

    expect(targets).toContainEqual({
      l: Multiverse.parseLine('-1'),
      t: 2,
      x: 4,
      y: 4,
    })
    expect(targets).not.toContainEqual({
      l: Multiverse.parseLine('-1'),
      t: 2,
      x: 4,
      y: 3,
    })
  })
})

describe('fairy piece 5DFEN', () => {
  it('round-trips every fairy piece symbol', () => {
    const state = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "custom"]
[Size "6x2"]

[UDSWCY/udswcy:+0:1:w]
*
`)
    const board = Multiverse.getBoard(state.initialMultiverse, { l: 0, t: 1 }, Player.W)

    expect(board?.pieces.map(file => file[0])).toEqual([
      Piece.UW,
      Piece.DW,
      Piece.SW,
      Piece.WW,
      Piece.CW,
      Piece.YW,
    ])
    expect(board?.pieces.map(file => file[1])).toEqual([
      Piece.UB,
      Piece.DB,
      Piece.SB,
      Piece.WB,
      Piece.CB,
      Piece.YB,
    ])
    const exported = FiveDPGN.exportFEN(state.initialMultiverse)
    expect(exported).toContain('[UDSW*CY/udsw*cy:0:1:w]')

    const roundTripped = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "custom"]
[Size "6x2"]

${exported}
*
`)
    const roundTrippedBoard = Multiverse.getBoard(roundTripped.initialMultiverse, { l: 0, t: 1 }, Player.W)
    expect(roundTrippedBoard?.pieces).toEqual(board?.pieces)
    expect(roundTrippedBoard && Board.isUnmoved({ x: 3, y: 0 }, roundTrippedBoard)).toBe(true)
    expect(roundTrippedBoard && Board.isUnmoved({ x: 3, y: 1 }, roundTrippedBoard)).toBe(true)
  })
})
