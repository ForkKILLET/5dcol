import { describe, expect, it } from 'vitest'
import { Board, GameState, Multiverse, Piece, Pieces, Player, type Board as BoardState } from './index'
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

const createBoardRangeMultiverse = (
  lMin: number,
  lMax: number,
  turns: readonly number[],
  player = Player.W,
) => {
  const lOffset = -lMin
  const lines = []
  for (let l = lMin; l <= lMax; l += 1) {
    const boards: BoardState[] = []
    for (const t of turns) {
      boards[t * 2 + player] = createEmptyBoard(8, 8)
    }
    lines[l + lOffset] = {
      boards,
      mStart: Math.min(...turns.map(t => t * 2 + player)),
    }
  }

  return {
    lines,
    lOffset,
    lFurthestB: 0,
    lFurthestW: lMax - lMin,
    lastMove: null,
  }
}

const getBoard = (
  multiverse: ReturnType<typeof createBoardRangeMultiverse>,
  l: number,
  t: number,
  player = Player.W,
): BoardState => {
  const board = Multiverse.getBoard(multiverse, { l, t }, player)
  if (! board) throw new Error(`Missing test board (${l}T${t})`)
  return board
}

describe('Board.getMoveTargets2D', () => {
  it('normalizes legacy board sizes from the piece matrix', () => {
    const legacyBoard = {
      pieces: Array.from({ length: 5 }, () => Array.from({ length: 6 }, () => Piece.E)),
      canCastleQW: false,
      canCastleKW: false,
      canCastleQB: false,
      canCastleKB: false,
      createdBy: null,
      createdByPlayer: null,
      createdByRole: null,
      createdByOrder: null,
    } as BoardState

    const board = Board.clone(legacyBoard)

    expect(Board.getSize(board)).toEqual({ width: 5, height: 6 })
    expect(board.width).toBe(5)
    expect(board.height).toBe(6)
    expect(Board.getHomeRank(board, Player.W)).toBe(5)
    expect(Board.getKingSideRookFile(board)).toBe(4)
  })

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

describe('Pieces.promotePawn', () => {
  it('promotes pawnlike pieces using the actual board height', () => {
    const size = { width: 5, height: 5 }

    expect(Pieces.promotePawn(Piece.PW, { x: 0, y: 0 }, size)).toBe(Piece.QW)
    expect(Pieces.promotePawn(Piece.PB, { x: 0, y: 4 }, size)).toBe(Piece.QB)
    expect(Pieces.promotePawn(Piece.WW, { x: 0, y: 0 }, size)).toBe(Piece.QW)
    expect(Pieces.promotePawn(Piece.WB, { x: 0, y: 4 }, size)).toBe(Piece.QB)
  })
})

describe('Multiverse.getMoveTargets', () => {
  it('allows pure time-axis sliding moves longer than seven boards', () => {
    const multiverse = createBoardRangeMultiverse(0, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    Board.setPiece({ x: 3, y: 3 }, getBoard(multiverse, 0, 12), Piece.QW)

    const targets = Multiverse.getMoveTargets(multiverse, { l: 0, t: 12, x: 3, y: 3 }, Player.W)

    expect(targets).toContainEqual({ l: 0, t: 3, x: 3, y: 3 })
  })

  it('allows pure timeline-axis sliding moves longer than seven timelines', () => {
    const multiverse = createBoardRangeMultiverse(-9, 0, [5])
    Board.setPiece({ x: 3, y: 3 }, getBoard(multiverse, 0, 5), Piece.RW)

    const targets = Multiverse.getMoveTargets(multiverse, { l: 0, t: 5, x: 3, y: 3 }, Player.W)

    expect(targets).toContainEqual({ l: -9, t: 5, x: 3, y: 3 })
  })

  it('allows diagonal TL sliding moves longer than seven boards', () => {
    const multiverse = createBoardRangeMultiverse(-9, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    Board.setPiece({ x: 3, y: 3 }, getBoard(multiverse, 0, 10), Piece.BW)

    const targets = Multiverse.getMoveTargets(multiverse, { l: 0, t: 10, x: 3, y: 3 }, Player.W)

    expect(targets).toContainEqual({ l: -8, t: 2, x: 3, y: 3 })
  })

  it('uses long time-axis sliding moves in check detection', () => {
    const multiverse = createBoardRangeMultiverse(0, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    Board.setPiece({ x: 3, y: 3 }, getBoard(multiverse, 0, 12), Piece.QW)
    Board.setPiece({ x: 3, y: 3 }, getBoard(multiverse, 0, 2), Piece.KB)

    const checks = Multiverse.findChecks(multiverse, Player.W)

    expect(checks).toContainEqual({
      from: { l: 0, t: 12, x: 3, y: 3 },
      to: { l: 0, t: 2, x: 3, y: 3 },
    })
  })
})

describe('Multiverse timeline state', () => {
  it('identifies the present player from the present board index', () => {
    const multiverse = Multiverse.createInitial()
    const present = Multiverse.getPresent(multiverse, Player.W)

    expect(present).toMatchObject({ m: 2, lines: [0] })
    expect(present && Multiverse.getPresentPlayer(present)).toBe(Player.W)
    expect(Multiverse.hasSubmittedPresentMoves(multiverse, Player.W)).toBe(false)
    expect(Multiverse.hasSubmittedPresentMoves(multiverse, Player.B)).toBe(true)
  })

  it('does not treat opponent half-turn coordinates as playable boards', () => {
    const multiverse = Multiverse.createInitial()

    expect(Multiverse.isPlayableBoard(multiverse, Player.W, { l: 0, t: 1 })).toBe(true)
    expect(Multiverse.isPlayableBoard(multiverse, Player.B, { l: 0, t: 0.5 })).toBe(false)
  })

  it('promotes physical moves on non-standard board sizes', () => {
    const multiverse = createBoardRangeMultiverse(0, 0, [1])
    Board.setPiece({ x: 0, y: 1 }, getBoard(multiverse, 0, 1), Piece.PW)

    const next = Multiverse.applyMove({
      from: { l: 0, t: 1, x: 0, y: 1 },
      to: { l: 0, t: 1, x: 0, y: 0 },
    }, Player.W, multiverse)
    const board = Multiverse.getBoard(next, { l: 0, t: 1 }, Player.B)

    expect(board && Board.getPiece({ x: 0, y: 0 }, board)).toBe(Piece.QW)
  })
})

describe('GameState.findPassCheckWarnings', () => {
  it('warns when passing a mandatory board creates a new check', () => {
    const multiverse = createBoardRangeMultiverse(0, 0, [1])
    const board = getBoard(multiverse, 0, 1)
    Board.setPiece({ x: 4, y: 0 }, board, Piece.RB)
    Board.setPiece({ x: 4, y: 7 }, board, Piece.KW)

    const warnings = GameState.findPassCheckWarnings({ multiverse, player: Player.W })

    expect(warnings).toEqual([{ l: 0, m: 2 }])
  })
})

describe('GameState.findLegalAction', () => {
  it('can find legal moves while the player is currently in check', () => {
    const multiverse = createBoardRangeMultiverse(0, 0, [1])
    const board = getBoard(multiverse, 0, 1)
    Board.setPiece({ x: 4, y: 0 }, board, Piece.RB)
    Board.setPiece({ x: 4, y: 7 }, board, Piece.KW)

    const action = GameState.findLegalAction({ multiverse, player: Player.W })

    expect(action).not.toBeNull()
    expect(action?.moves.length).toBeGreaterThan(0)
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
