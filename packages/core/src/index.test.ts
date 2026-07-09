import { describe, expect, it } from 'vitest'
import { Board, Multiverse, Piece, Player, type Board as BoardState } from './index'
import * as FiveDPGN from './fiveDPGN'

describe('Board.getMoveTargets2D', () => {
  it('allows pawn double moves when the board marks it as a first move', () => {
    const board: BoardState = {
      width: 5,
      height: 5,
      pieces: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => Piece.E)),
      unmoved: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false)),
      canCastleQW: false,
      canCastleKW: false,
      canCastleQB: false,
      canCastleKB: false,
      createdBy: null,
      createdByPlayer: null,
      createdByRole: null,
      createdByOrder: null,
    }
    Board.setPiece({ x: 4, y: 4 }, board, Piece.PW)
    Board.setUnmoved({ x: 4, y: 4 }, board, true)

    const targets = Board.getMoveTargets2D(board, { x: 4, y: 4 }, {
      canPawnDoubleMove: true,
      previousBoard: null,
    })

    expect(targets).toContainEqual({ x: 4, y: 3 })
    expect(targets).toContainEqual({ x: 4, y: 2 })
  })
})

describe('5DPGN import', () => {
  it('imports non-standard board sizes from the Size header', () => {
    const state = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard"]
[Size "5x5"]

[prnbk/3pp/5/PP3/KBNRP:+0:1:w]
*
`)

    const board = Multiverse.getBoard(state.initialMultiverse, { l: 0, t: 1 }, Player.W)

    expect(board).not.toBeNull()
    expect(board && Board.getSize(board)).toEqual({ width: 5, height: 5 })
  })
})
