import { describe, expect, it } from 'vitest'
import { Board, Multiverse, Piece, Player, type Board as BoardState } from './index'
import * as FiveDPGN from './fiveDPGN'

const createEmptyBoard = (width: number, height: number, withUnmoved = true): BoardState => ({
  width,
  height,
  pieces: Array.from({ length: width }, () => Array.from({ length: height }, () => Piece.E)),
  ...(withUnmoved
    ? { unmoved: Array.from({ length: width }, () => Array.from({ length: height }, () => false)) }
    : {}),
  canCastleQW: false,
  canCastleKW: false,
  canCastleQB: false,
  canCastleKB: false,
  createdBy: null,
  createdByPlayer: null,
  createdByRole: null,
  createdByOrder: null,
})

describe('Board.getMoveTargets2D', () => {
  it('allows pawn double moves when the board marks it as a first move', () => {
    const board = createEmptyBoard(5, 5)
    Board.setPiece({ x: 4, y: 4 }, board, Piece.PW)
    Board.setUnmoved({ x: 4, y: 4 }, board, true)

    const targets = Board.getMoveTargets2D(board, { x: 4, y: 4 }, {
      canPawnDoubleMove: true,
      previousBoard: null,
    })

    expect(targets).toContainEqual({ x: 4, y: 3 })
    expect(targets).toContainEqual({ x: 4, y: 2 })
  })

  it('infers pawn first-move state when cloning legacy boards without unmoved masks', () => {
    const legacyBoard = createEmptyBoard(5, 5, false)
    legacyBoard.pieces[4]![4] = Piece.PW

    const board = Board.clone(legacyBoard)
    const from = { x: 4, y: 4 }

    expect(Board.isUnmoved(from, board)).toBe(true)

    const targets = Board.getMoveTargets2D(board, from, {
      canPawnDoubleMove: Board.isUnmoved(from, board),
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

  it('requires an initial FEN position for non-standard board sizes', () => {
    expect(() => FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard"]
[Size "5x5"]

*
`)).toThrow(/requires an initial 5DFEN position/)
  })

  it('reports malformed headers instead of silently ignoring them', () => {
    expect(() => FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard"]
[Size 5x5]

*
`)).toThrow(/header values must be quoted/)
  })

  it('imports full-coordinate recovery moves', () => {
    const state = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard"]
[Size "8x8"]

1w. (0T1)e2(0T1)e3
*
`)

    expect(state.actions).toEqual([{
      moves: [{
        from: { l: 0, t: 1, x: 4, y: 6 },
        to: { l: 0, t: 1, x: 4, y: 5 },
      }],
    }])
  })

  it('imports a 5dchess-engine very-small time-travel sample', () => {
    const state = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard - Turn Zero"]
[Size "8x8"]

1. Nf3 / (0T1)Ng8>>(0T0)g6
2. (-1T1)Nf3
*
`)

    expect(state.actions).toHaveLength(3)
    expect(state.actions[1]?.moves[0]?.from).toMatchObject({ l: 0, t: 1, x: 6, y: 0 })
    expect(state.actions[1]?.moves[0]?.to).toMatchObject({ l: 0, t: 0, x: 6, y: 2 })
    expect(state.actions[2]?.moves[0]?.from.l).toBe(-1)
  })
})

describe('5DPGN export', () => {
  it('omits unnecessary pawn source squares without duplicating the target file', () => {
    const text = FiveDPGN.exportGameState({
      actions: [{
        moves: [{
          from: { l: 0, t: 1, x: 4, y: 6 },
          to: { l: 0, t: 1, x: 4, y: 5 },
        }],
      }],
    }, {
      omitUnnecessarySourceSquares: true,
      omitSingleMoveSourceBoards: true,
    })

    expect(text).toContain('1w. e3')
    expect(text).not.toContain('ee3')
  })
})
