import { create } from 'mutative'

// Constants

export const enum Color {
  W = 0,
  B = 1,
}

export const enum Piece {
  E   = 0x00,

  PW  = 0x01,
  RW  = 0x02,
  NW  = 0x03,
  BW  = 0x04,
  QW  = 0x05,
  KW  = 0x06,
  
  PB  = 0x10,
  RB  = 0x12,
  NB  = 0x13,
  BB  = 0x14,
  QB  = 0x15,
  KB  = 0x16,
}

// Hierarchy

export interface Board {
  pieces: Piece[][]

  canCastleQW: boolean
  canCastleKW: boolean
  canCastleQB: boolean
  canCastleKB: boolean
}

export interface Line {
  boards: Board[]

  mStart: number
}


export interface Multiverse {
  lines: Line[]

  lOffset: number
  lFurthestB: number
  lFurthestW: number
}

export interface Present {
  m: number
  lines: number[]
}

export namespace Multiverse {
  export const expand = (multiverse: Multiverse) => {
    const { lOffset: l0 } = multiverse
    multiverse.lOffset += l0
    multiverse.lFurthestB += l0
    multiverse.lFurthestW += l0
    multiverse.lines.splice(0, 0, ...Array(l0))
  }

  export function * getLineEntries(multiverse: Multiverse) {
    for (let n = multiverse.lFurthestB; n <= multiverse.lFurthestW; n ++) {
      yield [n - multiverse.lOffset, multiverse.lines[n]] as const
    }
  }

  export const getLine = (multiverse: Multiverse, l: number): Line => {
    return multiverse.lines[l + multiverse.lOffset]
  }

  export const getLBoundaries = ({ lOffset, lFurthestB, lFurthestW }: Multiverse): [number, number] => [
    lFurthestB - lOffset, lFurthestW - lOffset
  ]

  export const getActiveTimelineCount = (
    { lOffset, lFurthestB, lFurthestW }: Multiverse,
    color: Color,
  ): number => {
    switch (color) {
      case Color.W:
        return lFurthestW - lOffset + 1
      case Color.B:
        return lOffset - lFurthestB + 1
    }
  }

  export const canCreateActiveTimeline = (
    multiverse: Multiverse,
    color: Color,
  ): boolean => {
    const ownCount = Multiverse.getActiveTimelineCount(multiverse, color)
    const opponentCount = Multiverse.getActiveTimelineCount(
      multiverse,
      color === Color.W ? Color.B : Color.W,
    )
    return ownCount <= opponentCount
  }

  export const getActiveLineEntries = function * (
    multiverse: Multiverse,
    _color: Color,
  ) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      if (Line.getLatestBoardIndex(line) === null) continue
      yield [l, line] as const
    }
  }

  export const getPresent = (
    multiverse: Multiverse,
    color: Color,
  ): Present | null => {
    let mMin: number | null = null
    const lines: number[] = []

    for (const [l, line] of Multiverse.getActiveLineEntries(multiverse, color)) {
      const m = Line.getLatestBoardIndex(line)
      if (m === null) continue

      if (mMin === null || m < mMin) {
        mMin = m
        lines.length = 0
        lines.push(l)
      }
      else if (m === mMin) {
        lines.push(l)
      }
    }

    if (mMin === null) return null
    return { m: mMin, lines }
  }

  export const isPresentBoard = (
    multiverse: Multiverse,
    color: Color,
    { l, t }: CoordTimelike,
  ): boolean => {
    const present = Multiverse.getPresent(multiverse, color)
    return present !== null && present.m === t && present.lines.includes(l)
  }
}

export namespace Line {
  export const getBoardEntries = function * (line: Line) {
    for (let m = line.mStart; m < line.boards.length; m ++) {
      yield [m, line.boards[m]] as const
    }
  }

  export const getLatestBoardIndex = (line: Line): number | null => {
    for (let m = line.boards.length - 1; m >= line.mStart; m --) {
      if (line.boards[m]) return m
    }
    return null
  }
}

export namespace Board {
  export const clone = ({ pieces, ...misc }: Board): Board => ({
    ...misc,
    pieces: pieces.map(row => row.slice()),
  })
}

// Coordinates

export interface CoordTimelike {
  t: number
  l: number
}

export interface CoordSpacelike {
  x: number
  y: number
}

export interface Coord extends CoordTimelike, CoordSpacelike {}

export namespace Coord {
  export const time = (turn: number, color: Color): number => (
    turn * 2 + color
  )

  export const isSameBoard = (p: CoordTimelike, q: CoordTimelike) => p.l === q.l && p.t === q.t

  export const isInBoard = ({ x, y }: CoordSpacelike): boolean => (
    x >= 0 && x < 8 && y >= 0 && y < 8
  )

  export const isFreshBoard = ({ l, t }: CoordTimelike, multiverse: Multiverse) => {
    const line = Multiverse.getLine(multiverse, l)
    return t + 1 === line.boards.length
  }

  export function * spacelikes() {
    for (let x = 0; x < 8; x ++) {
      for (let y = 0; y < 8; y ++) {
        yield [x, y] as const
      }
    }
  }
}

export namespace Pieces {
  export const getColor = (piece: Piece): Color | null => {
    if (piece === Piece.E) return null
    return piece < 0x10 ? Color.W : Color.B
  }
}

// Initialization

export namespace Board {
  export const createInitial = (): Board => ({
    pieces: [
      [Piece.RB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.RW],
      [Piece.NB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.NW],
      [Piece.BB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.BW],
      [Piece.QB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.QW],
      [Piece.KB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.KW],
      [Piece.BB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.BW],
      [Piece.NB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.NW],
      [Piece.RB, Piece.PB, Piece.E, Piece.E, Piece.E, Piece.E, Piece.PW, Piece.RW],
    ],
    canCastleQW: true,
    canCastleKW: true,
    canCastleQB: true,
    canCastleKB: true,
  })
}

export namespace Line {
  export const createInitial = (): Line => {
    const boards: Board[] = []
    boards[1] = Board.createInitial()
    boards[2] = Board.createInitial()
    return {
      boards,
      mStart: 1,
    }
  }
}

export namespace Multiverse {
  export const LINE_OFFSET_INITIAL = 128

  export const createInitial = (): Multiverse => {
    const lines: Line[] = []
    const lOffset = LINE_OFFSET_INITIAL
    lines[lOffset] = Line.createInitial()
    return {
      lines,
      lOffset,
      lFurthestB: lOffset,
      lFurthestW: lOffset,
    }
  }
}

// Action

export interface Move {
  from: Coord
  to: Coord
}

export interface Action {
  moves: Move[]
}

export namespace Board {
  export const getPiece = ({ x, y }: CoordSpacelike, board: Board): Piece => (
    board.pieces[x][y]
  )

  export const setPiece = ({ x, y }: CoordSpacelike, board: Board, piece: Piece): void => {
    board.pieces[x][y] = piece
  }

  const addTarget = (
    targets: CoordSpacelike[],
    board: Board,
    color: Color,
    target: CoordSpacelike,
  ): boolean => {
    if (! Coord.isInBoard(target)) return false

    const targetPiece = Board.getPiece(target, board)
    if (Pieces.getColor(targetPiece) === color) return false

    targets.push(target)
    return targetPiece === Piece.E
  }

  const addSlidingTargets = (
    targets: CoordSpacelike[],
    board: Board,
    color: Color,
    from: CoordSpacelike,
    directions: CoordSpacelike[],
  ): void => {
    for (const direction of directions) {
      for (
        let target = { x: from.x + direction.x, y: from.y + direction.y };
        Coord.isInBoard(target);
        target = { x: target.x + direction.x, y: target.y + direction.y }
      ) {
        if (! addTarget(targets, board, color, target)) break
      }
    }
  }

  export const getMoveTargets2D = (board: Board, from: CoordSpacelike): CoordSpacelike[] => {
    if (! Coord.isInBoard(from)) return []

    const piece = Board.getPiece(from, board)
    const color = Pieces.getColor(piece)
    if (color === null) return []

    const targets: CoordSpacelike[] = []
    const addStep = (dx: number, dy: number) => {
      addTarget(targets, board, color, { x: from.x + dx, y: from.y + dy })
    }

    switch (piece) {
      case Piece.PW: {
        const forward = { x: from.x, y: from.y - 1 }
        if (Coord.isInBoard(forward) && Board.getPiece(forward, board) === Piece.E) {
          targets.push(forward)
          const doubleForward = { x: from.x, y: from.y - 2 }
          if (
            from.y === 6
            && Coord.isInBoard(doubleForward)
            && Board.getPiece(doubleForward, board) === Piece.E
          ) {
            targets.push(doubleForward)
          }
        }
        for (const dx of [-1, 1]) {
          const target = { x: from.x + dx, y: from.y - 1 }
          if (! Coord.isInBoard(target)) continue
          if (Pieces.getColor(Board.getPiece(target, board)) === Color.B) targets.push(target)
        }
        break
      }
      case Piece.PB: {
        const forward = { x: from.x, y: from.y + 1 }
        if (Coord.isInBoard(forward) && Board.getPiece(forward, board) === Piece.E) {
          targets.push(forward)
          const doubleForward = { x: from.x, y: from.y + 2 }
          if (
            from.y === 1
            && Coord.isInBoard(doubleForward)
            && Board.getPiece(doubleForward, board) === Piece.E
          ) {
            targets.push(doubleForward)
          }
        }
        for (const dx of [-1, 1]) {
          const target = { x: from.x + dx, y: from.y + 1 }
          if (! Coord.isInBoard(target)) continue
          if (Pieces.getColor(Board.getPiece(target, board)) === Color.W) targets.push(target)
        }
        break
      }
      case Piece.RW:
      case Piece.RB:
        addSlidingTargets(targets, board, color, from, [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ])
        break
      case Piece.NW:
      case Piece.NB:
        for (const [dx, dy] of [
          [1, 2], [2, 1], [-1, 2], [-2, 1],
          [1, -2], [2, -1], [-1, -2], [-2, -1],
        ] as const) addStep(dx, dy)
        break
      case Piece.BW:
      case Piece.BB:
        addSlidingTargets(targets, board, color, from, [
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: 1 },
          { x: -1, y: -1 },
        ])
        break
      case Piece.QW:
      case Piece.QB:
        addSlidingTargets(targets, board, color, from, [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: 1 },
          { x: -1, y: -1 },
        ])
        break
      case Piece.KW:
      case Piece.KB:
        for (const [dx, dy] of [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], [-1, 1], [-1, -1],
        ] as const) addStep(dx, dy)
        break
    }

    return targets
  }
}

export namespace Multiverse {
  const advance = (
    { l, t }: CoordTimelike,
    color: Color,
    multiverse: Multiverse,
  ): Board => {
    const line = Multiverse.getLine(multiverse, l)
    const m = Coord.time(t, color)
    const board = line.boards[m]
    const boardNew = Board.clone(board)
    line.boards[m + 1] = boardNew
    return boardNew
  }

  const fork = (
    { l, t }: CoordTimelike,
    color: Color,
    multiverse: Multiverse,
  ): Board => {
    const line = Multiverse.getLine(multiverse, l)
    const m = Coord.time(t, color)
    const mStart = m + 1
    const lineNew: Line = {
      boards: [],
      mStart,
    }

    let nNew: number
    if (color === Color.W) {
      nNew = ++ multiverse.lFurthestW
    }
    else {
      nNew = -- multiverse.lFurthestB
      if (nNew < 0) {
        nNew += multiverse.lOffset
        Multiverse.expand(multiverse)
      }
    }
    multiverse.lines[nNew] = lineNew

    const boardNew = Board.clone(line.boards[m])
    lineNew.boards[mStart] = boardNew
    return boardNew
  }

  export const applyMove = ({ from, to }: Move, color: Color, multiverseOld: Multiverse) => create(multiverseOld, (multiverse) => {
    const boardFromNew = advance(from, color, multiverse)
    const piece = Board.getPiece(from, boardFromNew)
    Board.setPiece(from, boardFromNew, Piece.E)
    if (Coord.isSameBoard(from, to)) {
      Board.setPiece(to, boardFromNew, piece)
    }
    else if (Coord.isFreshBoard(to, multiverse)) {
      const boardToNew = advance(to, color, multiverse)
      Board.setPiece(to, boardToNew, piece)
    }
    else {
      const boardToNew = fork(to, color, multiverse)
      Board.setPiece(to, boardToNew, piece)
    }
  })

  export const applyAction = (action: Action, color: Color, multiverseOld: Multiverse) => (
    action.moves.reduce((multiverse, move) => applyMove(move, color, multiverse), multiverseOld)
  )
}
