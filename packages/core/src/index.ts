import { create } from 'mutative'

// Constants

export const enum Player {
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

  createdBy: Move | null
  createdByPlayer: Player | null
  createdByRole: 'both' | 'source' | 'target' | null
  createdByOrder: number | null
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
  lastMove: Move | null
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
    multiverse: Multiverse,
    player: Player,
  ): number => {
    const ownCount = Multiverse.getCreatedTimelineCount(multiverse, player)
    const opponentCount = Multiverse.getCreatedTimelineCount(
      multiverse,
      player === Player.W ? Player.B : Player.W,
    )
    return Math.min(ownCount, opponentCount + 1) + 1
  }

  export const getCreatedTimelineCount = (
    { lOffset, lFurthestB, lFurthestW }: Multiverse,
    player: Player,
  ): number => {
    switch (player) {
      case Player.W:
        return lFurthestW - lOffset
      case Player.B:
        return lOffset - lFurthestB
    }
  }

  export const getLinePlayer = (l: number): Player | null => {
    if (l > 0) return Player.W
    if (l < 0) return Player.B
    return null
  }

  export const isInactiveLine = (
    multiverse: Multiverse,
    l: number,
  ): boolean => {
    const player = Multiverse.getLinePlayer(l)
    if (player === null) return false

    const ownCount = Multiverse.getCreatedTimelineCount(multiverse, player)
    const opponentCount = Multiverse.getCreatedTimelineCount(
      multiverse,
      player === Player.W ? Player.B : Player.W,
    )
    return Math.abs(l) > opponentCount + 1 && ownCount > opponentCount + 1
  }

  export const canCreateActiveTimeline = (
    multiverse: Multiverse,
    player: Player,
  ): boolean => {
    const ownCount = Multiverse.getCreatedTimelineCount(multiverse, player)
    const opponentCount = Multiverse.getCreatedTimelineCount(
      multiverse,
      player === Player.W ? Player.B : Player.W,
    )
    return ownCount <= opponentCount
  }

  export const getActiveLineEntries = function * (
    multiverse: Multiverse,
    _player: Player,
  ) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      if (Multiverse.isInactiveLine(multiverse, l)) continue
      if (Line.getLatestBoardIndex(line) === null) continue
      yield [l, line] as const
    }
  }

  export const getPresent = (
    multiverse: Multiverse,
    player: Player,
  ): Present | null => {
    let mMin: number | null = null
    const lines: number[] = []

    for (const [l, line] of Multiverse.getActiveLineEntries(multiverse, player)) {
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

  export const getPresentPlayer = (present: Present): Player => (
    present.m % 2
  )

  export const isPresentBoard = (
    multiverse: Multiverse,
    player: Player,
    { l, t }: CoordTimelike,
  ): boolean => {
    const present = Multiverse.getPresent(multiverse, player)
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
  export const time = (turn: number, player: Player): number => (
    turn * 2 + player
  )

  export const boardIndex = (coord: CoordTimelike, player: Player): number => (
    Coord.time(coord.t, player)
  )

  export const turn = (time: number, player: Player): number => (
    (time - player) / 2
  )

  export const isSameBoard = (p: CoordTimelike, q: CoordTimelike) => p.l === q.l && p.t === q.t

  export const isSameSpace = (p: CoordSpacelike, q: CoordSpacelike) => p.x === q.x && p.y === q.y

  export const isInBoard = ({ x, y }: CoordSpacelike): boolean => (
    x >= 0 && x < 8 && y >= 0 && y < 8
  )

  export const isFreshBoard = ({ l, t }: CoordTimelike, multiverse: Multiverse, player: Player) => {
    const line = Multiverse.getLine(multiverse, l)
    return Coord.time(t, player) + 1 === line.boards.length
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
  export const getPlayer = (piece: Piece): Player | null => {
    if (piece === Piece.E) return null
    return piece < 0x10 ? Player.W : Player.B
  }
}

export namespace Players {
  export const opponent = (player: Player): Player => (
    player === Player.W ? Player.B : Player.W
  )
}

interface Coord4Delta {
  x: number
  y: number
  t: number
  l: number
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
    createdBy: null,
    createdByPlayer: null,
    createdByRole: null,
    createdByOrder: null,
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
      lastMove: null,
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
    player: Player,
    target: CoordSpacelike,
  ): boolean => {
    if (! Coord.isInBoard(target)) return false

    const targetPiece = Board.getPiece(target, board)
    if (Pieces.getPlayer(targetPiece) === player) return false

    targets.push(target)
    return targetPiece === Piece.E
  }

  const addSlidingTargets = (
    targets: CoordSpacelike[],
    board: Board,
    player: Player,
    from: CoordSpacelike,
    directions: CoordSpacelike[],
  ): void => {
    for (const direction of directions) {
      for (
        let target = { x: from.x + direction.x, y: from.y + direction.y };
        Coord.isInBoard(target);
        target = { x: target.x + direction.x, y: target.y + direction.y }
      ) {
        if (! addTarget(targets, board, player, target)) break
      }
    }
  }

  export interface MoveTargetContext2D {
    previousBoard: Board | null
  }

  export const getMoveTargets2D = (
    board: Board,
    from: CoordSpacelike,
    context?: MoveTargetContext2D,
  ): CoordSpacelike[] => {
    if (! Coord.isInBoard(from)) return []

    const piece = Board.getPiece(from, board)
    const player = Pieces.getPlayer(piece)
    if (player === null) return []

    const targets: CoordSpacelike[] = []
    const addStep = (dx: number, dy: number) => {
      addTarget(targets, board, player, { x: from.x + dx, y: from.y + dy })
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
          if (Pieces.getPlayer(Board.getPiece(target, board)) === Player.B) targets.push(target)
        }
        addEnPassantTarget(targets, board, from, player, context)
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
          if (Pieces.getPlayer(Board.getPiece(target, board)) === Player.W) targets.push(target)
        }
        addEnPassantTarget(targets, board, from, player, context)
        break
      }
      case Piece.RW:
      case Piece.RB:
        addSlidingTargets(targets, board, player, from, [
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
        addSlidingTargets(targets, board, player, from, [
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: 1 },
          { x: -1, y: -1 },
        ])
        break
      case Piece.QW:
      case Piece.QB:
        addSlidingTargets(targets, board, player, from, [
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
        addCastlingTargets(targets, board, piece)
        break
    }

    return targets
  }

  const addEnPassantTarget = (
    targets: CoordSpacelike[],
    board: Board,
    from: CoordSpacelike,
    player: Player,
    context?: MoveTargetContext2D,
  ): void => {
    const previousBoard = context?.previousBoard
    if (! previousBoard) return

    for (const dx of [-1, 1]) {
      const capturedPos = { x: from.x + dx, y: from.y }
      if (! Coord.isInBoard(capturedPos)) continue

      const capturedPawn = Board.getPiece(capturedPos, board)
      if (player === Player.W && capturedPawn !== Piece.PB) continue
      if (player === Player.B && capturedPawn !== Piece.PW) continue

      const capturedFrom = {
        x: capturedPos.x,
        y: capturedPos.y - getPawnDirection(Pieces.getPlayer(capturedPawn)!) * 2,
      }
      const target = {
        x: capturedPos.x,
        y: from.y + getPawnDirection(player),
      }
      if (! Coord.isInBoard(capturedFrom) || ! Coord.isInBoard(target)) continue
      if (Board.getPiece(target, board) !== Piece.E) continue
      if (Board.getPiece(capturedPos, previousBoard) !== Piece.E) continue
      if (Board.getPiece(capturedFrom, previousBoard) !== capturedPawn) continue

      targets.push(target)
    }
  }

  const addCastlingTargets = (
    targets: CoordSpacelike[],
    board: Board,
    king: Piece,
  ): void => {
    if (king === Piece.KW) {
      if (canCastleKingSide(board, Player.W)) targets.push({ x: 6, y: 7 })
      if (canCastleQueenSide(board, Player.W)) targets.push({ x: 2, y: 7 })
    }
    else {
      if (canCastleKingSide(board, Player.B)) targets.push({ x: 6, y: 0 })
      if (canCastleQueenSide(board, Player.B)) targets.push({ x: 2, y: 0 })
    }
  }

  const canCastleKingSide = (board: Board, player: Player): boolean => {
    const y = player === Player.W ? 7 : 0
    const king = player === Player.W ? Piece.KW : Piece.KB
    const rook = player === Player.W ? Piece.RW : Piece.RB
    const canCastle = player === Player.W ? board.canCastleKW : board.canCastleKB
    return canCastle
      && Board.getPiece({ x: 4, y }, board) === king
      && Board.getPiece({ x: 7, y }, board) === rook
      && Board.getPiece({ x: 5, y }, board) === Piece.E
      && Board.getPiece({ x: 6, y }, board) === Piece.E
  }

  const canCastleQueenSide = (board: Board, player: Player): boolean => {
    const y = player === Player.W ? 7 : 0
    const king = player === Player.W ? Piece.KW : Piece.KB
    const rook = player === Player.W ? Piece.RW : Piece.RB
    const canCastle = player === Player.W ? board.canCastleQW : board.canCastleQB
    return canCastle
      && Board.getPiece({ x: 4, y }, board) === king
      && Board.getPiece({ x: 0, y }, board) === rook
      && Board.getPiece({ x: 1, y }, board) === Piece.E
      && Board.getPiece({ x: 2, y }, board) === Piece.E
      && Board.getPiece({ x: 3, y }, board) === Piece.E
  }

  const getPawnDirection = (player: Player): number => (
    player === Player.W ? -1 : 1
  )

}

export namespace Multiverse {
  const TL_ORTHOGONAL_DIRECTIONS: Coord4Delta[] = [
    { x: 0, y: 0, t: 0, l: 1 },
    { x: 0, y: 0, t: 0, l: -1 },
    { x: 0, y: 0, t: -1, l: 0 },
  ]
  const TL_DIAGONAL_DIRECTIONS: Coord4Delta[] = [
    { x: 0, y: 0, t: 1, l: 1 },
    { x: 0, y: 0, t: 1, l: -1 },
    { x: 0, y: 0, t: -1, l: 1 },
    { x: 0, y: 0, t: -1, l: -1 },
  ]
  const TL_BOTH_DIRECTIONS = [...TL_ORTHOGONAL_DIRECTIONS, ...TL_DIAGONAL_DIRECTIONS]
  const XY_ORTHOGONAL_DIRECTIONS: CoordSpacelike[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]
  const XY_DIAGONAL_DIRECTIONS: CoordSpacelike[] = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ]
  const XY_BOTH_DIRECTIONS = [...XY_ORTHOGONAL_DIRECTIONS, ...XY_DIAGONAL_DIRECTIONS]

  export const getBoard = (
    multiverse: Multiverse,
    coord: CoordTimelike,
    player: Player,
  ): Board | null => {
    const line = Multiverse.getLine(multiverse, coord.l)
    return line?.boards[Coord.boardIndex(coord, player)] ?? null
  }

  export const isPlayableBoard = (
    multiverse: Multiverse,
    player: Player,
    coord: CoordTimelike,
  ): boolean => {
    const line = Multiverse.getLine(multiverse, coord.l)
    if (! line) return false

    const m = Coord.boardIndex(coord, player)
    return Line.getLatestBoardIndex(line) === m
  }

  export const getPreviousBoard = (
    multiverse: Multiverse,
    { l, t }: CoordTimelike,
    player: Player,
  ): Board | null => {
    const line = Multiverse.getLine(multiverse, l)
    return line?.boards[Coord.time(t, player) - 1] ?? null
  }

  export const getMoveTargets = (
    multiverse: Multiverse,
    from: Coord,
    player: Player,
  ): Coord[] => {
    const board = Multiverse.getBoard(multiverse, from, player)
    if (! board) return []

    const piece = Board.getPiece(from, board)
    if (Pieces.getPlayer(piece) !== player) return []

    const targets: Coord[] = []
    const addTarget = (target: Coord): boolean => {
      if (! Coord.isInBoard(target)) return false

      const targetBoard = Multiverse.getBoard(multiverse, target, player)
      if (! targetBoard) return false

      const targetPiece = Board.getPiece(target, targetBoard)
      if (Pieces.getPlayer(targetPiece) === player) return false

      if (! targets.some(existing => Coord.isSameBoard(existing, target) && Coord.isSameSpace(existing, target))) {
        targets.push(target)
      }
      return targetPiece === Piece.E
    }

    for (const target of Board.getMoveTargets2D(board, from, {
      previousBoard: Multiverse.getPreviousBoard(multiverse, from, player),
    })) {
      addTarget({ ...target, l: from.l, t: from.t })
    }

    switch (piece) {
      case Piece.KW:
      case Piece.KB:
        addKing5DTargets(targets, multiverse, from, player)
        break
      case Piece.RW:
      case Piece.RB:
        addPureTimelineSlidingTargets(targets, multiverse, from, player, TL_ORTHOGONAL_DIRECTIONS)
        break
      case Piece.BW:
      case Piece.BB:
        addPureTimelineSlidingTargets(targets, multiverse, from, player, TL_DIAGONAL_DIRECTIONS)
        addCompoundSlidingTargets(targets, multiverse, from, player, TL_ORTHOGONAL_DIRECTIONS, XY_ORTHOGONAL_DIRECTIONS)
        break
      case Piece.QW:
      case Piece.QB:
        addPureTimelineSlidingTargets(targets, multiverse, from, player, TL_ORTHOGONAL_DIRECTIONS)
        addPureTimelineSlidingTargets(targets, multiverse, from, player, TL_DIAGONAL_DIRECTIONS)
        addCompoundSlidingTargets(targets, multiverse, from, player, TL_BOTH_DIRECTIONS, XY_BOTH_DIRECTIONS)
        break
      case Piece.NW:
      case Piece.NB:
        addKnight5DTargets(targets, multiverse, from, player)
        break
      case Piece.PW:
      case Piece.PB:
        addPawn5DTargets(targets, multiverse, from, player)
        break
    }

    return targets
  }

  export const getMoveArrivalBoardIndex = (
    { from, to }: Move,
    player: Player,
    multiverse: Multiverse,
  ): { l: number, m: number } => {
    const toM = Coord.boardIndex(to, player)
    if (Coord.isSameBoard(from, to)) return { l: from.l, m: Coord.boardIndex(from, player) + 1 }
    if (Coord.isFreshBoard(to, multiverse, player)) return { l: to.l, m: toM + 1 }
    return {
      l: player === Player.W
        ? multiverse.lFurthestW - multiverse.lOffset + 1
        : multiverse.lFurthestB - multiverse.lOffset - 1,
      m: toM + 1,
    }
  }

  const addKing5DTargets = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
  ): void => {
    for (const tl of TL_BOTH_DIRECTIONS) {
      for (const xy of [{ x: 0, y: 0 }, ...XY_BOTH_DIRECTIONS]) {
        addStepTarget(targets, multiverse, from, player, {
          x: xy.x,
          y: xy.y,
          t: tl.t,
          l: tl.l,
        })
      }
    }
  }

  const addKnight5DTargets = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
  ): void => {
    for (const tl of [
      { t: 2, l: 1 }, { t: 1, l: 2 }, { t: -2, l: 1 }, { t: 1, l: -2 },
      { t: 2, l: -1 }, { t: -1, l: 2 }, { t: -2, l: -1 }, { t: -1, l: -2 },
    ]) {
      addStepTarget(targets, multiverse, from, player, { x: 0, y: 0, t: tl.t, l: tl.l })
    }

    for (const tl of TL_ORTHOGONAL_DIRECTIONS) {
      for (const xy of [
        { x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 },
      ]) {
        addStepTarget(targets, multiverse, from, player, { x: xy.x, y: xy.y, t: tl.t, l: tl.l })
      }
    }

    for (const tl of [
      { t: 0, l: 2 }, { t: 0, l: -2 }, { t: -2, l: 0 },
    ]) {
      for (const xy of XY_ORTHOGONAL_DIRECTIONS) {
        addStepTarget(targets, multiverse, from, player, { x: xy.x, y: xy.y, t: tl.t, l: tl.l })
      }
    }
  }

  const addPawn5DTargets = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
  ): void => {
    const lForward = player === Player.W ? -1 : 1
    const captureDeltas = player === Player.W
      ? [{ t: 1, l: -1 }, { t: -1, l: -1 }]
      : [{ t: 1, l: 1 }, { t: -1, l: 1 }]

    for (const delta of captureDeltas) {
      const target = { ...from, t: from.t + delta.t, l: from.l + delta.l }
      const board = Multiverse.getBoard(multiverse, target, player)
      if (! board) continue
      if (Pieces.getPlayer(Board.getPiece(target, board)) === Players.opponent(player)) {
        addStepTarget(targets, multiverse, from, player, { x: 0, y: 0, t: delta.t, l: delta.l })
      }
    }

    const forward = { ...from, l: from.l + lForward }
    const forwardBoard = Multiverse.getBoard(multiverse, forward, player)
    if (! forwardBoard || Board.getPiece(forward, forwardBoard) !== Piece.E) return

    addStepTarget(targets, multiverse, from, player, { x: 0, y: 0, t: 0, l: lForward })

    const startRank = player === Player.W ? 6 : 1
    if (from.y !== startRank) return

    const doubleForward = { ...from, l: from.l + lForward * 2 }
    const doubleForwardBoard = Multiverse.getBoard(multiverse, doubleForward, player)
    if (doubleForwardBoard && Board.getPiece(doubleForward, doubleForwardBoard) === Piece.E) {
      addStepTarget(targets, multiverse, from, player, { x: 0, y: 0, t: 0, l: lForward * 2 })
    }
  }

  const addPureTimelineSlidingTargets = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
    directions: Coord4Delta[],
  ): void => {
    for (const direction of directions) {
      for (let n = 1; n < 8; n ++) {
        const canContinue = addStepTarget(targets, multiverse, from, player, {
          x: 0,
          y: 0,
          t: direction.t * n,
          l: direction.l * n,
        })
        if (! canContinue) break
      }
    }
  }

  const addCompoundSlidingTargets = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
    tlDirections: Coord4Delta[],
    xyDirections: CoordSpacelike[],
  ): void => {
    for (const tl of tlDirections) {
      for (const xy of xyDirections) {
        for (let n = 1; n < 8; n ++) {
          const canContinue = addStepTarget(targets, multiverse, from, player, {
            x: xy.x * n,
            y: xy.y * n,
            t: tl.t * n,
            l: tl.l * n,
          })
          if (! canContinue) break
        }
      }
    }
  }

  const addStepTarget = (
    targets: Coord[],
    multiverse: Multiverse,
    from: Coord,
    player: Player,
    delta: Coord4Delta,
  ): boolean => {
    const target = {
      x: from.x + delta.x,
      y: from.y + delta.y,
      t: from.t + delta.t,
      l: from.l + delta.l,
    }
    if (! Coord.isInBoard(target)) return false

    const board = Multiverse.getBoard(multiverse, target, player)
    if (! board) return false

    const piece = Board.getPiece(target, board)
    if (Pieces.getPlayer(piece) === player) return false

    if (! targets.some(existing => Coord.isSameBoard(existing, target) && Coord.isSameSpace(existing, target))) {
      targets.push(target)
    }
    return piece === Piece.E
  }

  const advance = (
    { l, t }: CoordTimelike,
    player: Player,
    multiverse: Multiverse,
  ): Board => {
    const line = Multiverse.getLine(multiverse, l)
    const m = Coord.time(t, player)
    const board = line.boards[m]
    const boardNew = Board.clone(board)
    line.boards[m + 1] = boardNew
    return boardNew
  }

  const fork = (
    { l, t }: CoordTimelike,
    player: Player,
    multiverse: Multiverse,
  ): Board => {
    const line = Multiverse.getLine(multiverse, l)
    const m = Coord.time(t, player)
    const mStart = m + 1
    const lineNew: Line = {
      boards: [],
      mStart,
    }

    let nNew: number
    if (player === Player.W) {
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

  const updateCastlingRightsForMove = (
    board: Board,
    piece: Piece,
    from: CoordSpacelike,
  ): void => {
    switch (piece) {
      case Piece.KW:
        board.canCastleQW = false
        board.canCastleKW = false
        break
      case Piece.KB:
        board.canCastleQB = false
        board.canCastleKB = false
        break
      case Piece.RW:
        if (from.x === 0 && from.y === 7) board.canCastleQW = false
        if (from.x === 7 && from.y === 7) board.canCastleKW = false
        break
      case Piece.RB:
        if (from.x === 0 && from.y === 0) board.canCastleQB = false
        if (from.x === 7 && from.y === 0) board.canCastleKB = false
        break
    }
  }

  const updateCastlingRightsForCapture = (
    board: Board,
    targetPiece: Piece,
    to: CoordSpacelike,
  ): void => {
    switch (targetPiece) {
      case Piece.RW:
        if (to.x === 0 && to.y === 7) board.canCastleQW = false
        if (to.x === 7 && to.y === 7) board.canCastleKW = false
        break
      case Piece.RB:
        if (to.x === 0 && to.y === 0) board.canCastleQB = false
        if (to.x === 7 && to.y === 0) board.canCastleKB = false
        break
    }
  }

  const applyCastlingRookMove = (
    board: Board,
    piece: Piece,
    from: CoordSpacelike,
    to: CoordSpacelike,
  ): void => {
    if (piece !== Piece.KW && piece !== Piece.KB) return
    if (from.x !== 4 || Math.abs(to.x - from.x) !== 2) return

    const rook = piece === Piece.KW ? Piece.RW : Piece.RB
    if (to.x === 6) {
      Board.setPiece({ x: 7, y: from.y }, board, Piece.E)
      Board.setPiece({ x: 5, y: from.y }, board, rook)
    }
    else if (to.x === 2) {
      Board.setPiece({ x: 0, y: from.y }, board, Piece.E)
      Board.setPiece({ x: 3, y: from.y }, board, rook)
    }
  }

  const applyEnPassantCapture = (
    board: Board,
    piece: Piece,
    from: CoordSpacelike,
    to: CoordSpacelike,
  ): void => {
    if (piece !== Piece.PW && piece !== Piece.PB) return
    if (Math.abs(to.x - from.x) !== 1) return
    if (Board.getPiece(to, board) !== Piece.E) return

    const capturedPos = { x: to.x, y: from.y }
    const capturedPiece = Board.getPiece(capturedPos, board)
    if (piece === Piece.PW && capturedPiece !== Piece.PB) return
    if (piece === Piece.PB && capturedPiece !== Piece.PW) return
    Board.setPiece(capturedPos, board, Piece.E)
  }

  const setBoardCreation = (
    board: Board,
    move: Move,
    player: Player,
    role: Board['createdByRole'],
    order: number | null,
  ): void => {
    board.createdBy = move
    board.createdByPlayer = player
    board.createdByRole = role
    board.createdByOrder = order
  }

  export const applyMove = ({ from, to }: Move, player: Player, multiverseOld: Multiverse, order: number | null = null) => create(multiverseOld, (multiverse) => {
    const move = { from, to }
    const boardFromNew = advance(from, player, multiverse)
    const piece = Board.getPiece(from, boardFromNew)
    const targetPiece = Coord.isSameBoard(from, to) ? Board.getPiece(to, boardFromNew) : Piece.E

    updateCastlingRightsForMove(boardFromNew, piece, from)
    updateCastlingRightsForCapture(boardFromNew, targetPiece, to)
    setBoardCreation(boardFromNew, move, player, Coord.isSameBoard(from, to) ? 'both' : 'source', order)

    Board.setPiece(from, boardFromNew, Piece.E)
    if (Coord.isSameBoard(from, to)) {
      applyEnPassantCapture(boardFromNew, piece, from, to)
      Board.setPiece(to, boardFromNew, piece)
      applyCastlingRookMove(boardFromNew, piece, from, to)
    }
    else if (Coord.isFreshBoard(to, multiverse, player)) {
      const boardToNew = advance(to, player, multiverse)
      updateCastlingRightsForCapture(boardToNew, Board.getPiece(to, boardToNew), to)
      setBoardCreation(boardToNew, move, player, 'target', order)
      Board.setPiece(to, boardToNew, piece)
    }
    else {
      const boardToNew = fork(to, player, multiverse)
      updateCastlingRightsForCapture(boardToNew, Board.getPiece(to, boardToNew), to)
      setBoardCreation(boardToNew, move, player, 'target', order)
      Board.setPiece(to, boardToNew, piece)
    }
    multiverse.lastMove = move
  })

  export const applyAction = (action: Action, player: Player, multiverseOld: Multiverse, orderBase = 0) => (
    action.moves.reduce((multiverse, move, index) => applyMove(move, player, multiverse, orderBase + index), multiverseOld)
  )
}

export interface GameState {
  actions: Action[]
  multiverseCommitted: Multiverse
  multiverse: Multiverse
  player: Player
  actionIndex: number
  pendingMoves: Move[]
}

export namespace GameState {
  export const MOVE_ORDER_STRIDE = 1000000

  export const create = (actions: Action[] = [], pendingMoves: Move[] = []): GameState => {
    let multiverseCommitted = Multiverse.createInitial()
    let player = Player.W

    actions.forEach((action, actionIndex) => {
      multiverseCommitted = applyMoves(
        action.moves,
        `action ${actionIndex + 1}`,
        player,
        multiverseCommitted,
        actionIndex * MOVE_ORDER_STRIDE,
      )
      if (! hasSubmittedPresentMoves(multiverseCommitted, player)) {
        throw new Error(`5dpgn action ${actionIndex + 1} does not submit the present`)
      }
      player = Players.opponent(player)
    })

    const multiverse = applyMoves(
      pendingMoves,
      'pending move',
      player,
      multiverseCommitted,
      actions.length * MOVE_ORDER_STRIDE,
    )

    return {
      actions,
      multiverseCommitted,
      multiverse,
      player,
      actionIndex: actions.length,
      pendingMoves,
    }
  }

  export const extractActions = (multiverse: Multiverse): Action[] => {
    const byAction = new Map<number, Map<number, Move>>()
    let fallbackOrder = 0

    for (const [, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [, board] of Line.getBoardEntries(line)) {
        if (! board?.createdBy) continue
        if (board.createdByRole !== 'both' && board.createdByRole !== 'target') continue

        const order = board.createdByOrder ?? fallbackOrder ++
        const actionIndex = Math.floor(order / MOVE_ORDER_STRIDE)
        const moveIndex = order % MOVE_ORDER_STRIDE
        const moves = byAction.get(actionIndex) ?? new Map<number, Move>()
        moves.set(moveIndex, board.createdBy)
        byAction.set(actionIndex, moves)
      }
    }

    return [...byAction.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, moves]) => ({
        moves: [...moves.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, move]) => move),
      }))
  }

  export const hasSubmittedPresentMoves = (multiverse: Multiverse, player: Player): boolean => {
    const present = Multiverse.getPresent(multiverse, player)
    return present !== null && Multiverse.getPresentPlayer(present) !== player
  }

  const applyMoves = (
    moves: Move[],
    label: string,
    player: Player,
    multiverseOld: Multiverse,
    orderBase: number,
  ): Multiverse => (
    moves.reduce((multiverse, move, index) => {
      assertLegalMove(multiverse, move, player, `${label}, move ${index + 1}`)
      return Multiverse.applyMove(move, player, multiverse, orderBase + index)
    }, multiverseOld)
  )

  const assertLegalMove = (
    multiverse: Multiverse,
    move: Move,
    player: Player,
    label: string,
  ): void => {
    const targets = Multiverse.getMoveTargets(multiverse, move.from, player)
    if (targets.some(target => Coord.isSameBoard(target, move.to) && Coord.isSameSpace(target, move.to))) return
    throw new Error(`Illegal 5dpgn move in ${label}: ${formatCoord(move.from)} to ${formatCoord(move.to)}`)
  }

  const formatCoord = ({ l, t, x, y }: Coord): string => `(${l}T${t})${String.fromCharCode(97 + x)}${8 - y}`
}

export namespace FiveDPGN {
  const FILES = 'abcdefgh'
  const MOVE_RE = /\(([+-]?\d+)T([+-]?\d+)\)[A-Z]?([a-h])([1-8])x?(?:>{1,2})?(?:x?\(([+-]?\d+)T([+-]?\d+)\))?x?([a-h])([1-8])(?:=[A-Z])?(?:[+#*~]|!!|!\?|!\?|!|\?\?|\?)*\s*/y
  const ACTION_RE = /(?:\d+[wb]?\.|\/)\s*((?:(?!\d+[wb]?\.|\/\s).)+)/gs

  export const exportGameState = ({ actions }: Pick<GameState, 'actions'>): string => {
    const lines = [
      '[Board "Standard"]',
      '',
      ...actions.map((action, index) => `${getTurnSerial(index)} ${action.moves.map(formatMove).join(' ')}`),
    ]
    return `${lines.join('\n').trim()}\n`
  }

  export const importGameState = (input: string): GameState => {
    const actions = parseActions(input)
    return GameState.create(actions)
  }

  const parseActions = (input: string): Action[] => {
    const body = stripHeadersAndComments(input)
    assertSupportedBody(body)
    const actions: Action[] = []

    for (const match of body.matchAll(ACTION_RE)) {
      const moves = parseMoves(match[1])
      if (moves.length > 0) actions.push({ moves })
    }

    if (actions.length === 0 && body.trim() !== '') {
      const moves = parseMoves(body)
      if (moves.length > 0) actions.push({ moves })
    }

    return actions
  }

  const parseMoves = (input: string): Move[] => {
    const moves: Move[] = []
    let cursor = 0

    while (cursor < input.length) {
      if (/\s/.test(input[cursor])) {
        cursor += 1
        continue
      }

      MOVE_RE.lastIndex = cursor
      const match = MOVE_RE.exec(input)
      if (! match) {
        throw new Error(`Unsupported 5dpgn move near "${input.slice(cursor, cursor + 24).trim()}"`)
      }
      const from = {
        l: Number(match[1]),
        t: Number(match[2]),
        ...parseSquare(match[3], match[4]),
      }
      const to = {
        l: match[5] === undefined ? from.l : Number(match[5]),
        t: match[6] === undefined ? from.t : Number(match[6]),
        ...parseSquare(match[7], match[8]),
      }
      moves.push({ from, to })
      cursor = MOVE_RE.lastIndex
    }

    return moves
  }

  const assertSupportedBody = (body: string): void => {
    const withoutAbsoluteBoards = body.replace(/\([+-]?\d+T[+-]?\d+\)/g, '')
    if (! /[()$]/.test(withoutAbsoluteBoards)) return
    throw new Error('Unsupported 5dpgn syntax: variations, relative boards, and timeline comments are not supported yet')
  }

  const stripHeadersAndComments = (input: string): string => (
    input
      .replace(/^\s*\[[^\]\n]*]\s*$/gm, '')
      .replace(/\{[^{}]*}/g, ' ')
  )

  const parseSquare = (file: string, rank: string): CoordSpacelike => ({
    x: FILES.indexOf(file),
    y: 8 - Number(rank),
  })

  const formatMove = ({ from, to }: Move): string => {
    const fromBoard = formatBoard(from)
    const fromSquare = formatSquare(from)
    const toSquare = formatSquare(to)
    return Coord.isSameBoard(from, to)
      ? `${fromBoard}${fromSquare}${toSquare}`
      : `${fromBoard}${fromSquare}${formatBoard(to)}${toSquare}`
  }

  const formatBoard = ({ l, t }: CoordTimelike): string => `(${l}T${t})`

  const formatSquare = ({ x, y }: CoordSpacelike): string => `${FILES[x]}${8 - y}`

  const getTurnSerial = (actionIndex: number): string => {
    const turn = Math.floor(actionIndex / 2) + 1
    const player = actionIndex % 2 === 0 ? 'w' : 'b'
    return `${turn}${player}.`
  }
}
