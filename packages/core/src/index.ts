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

export interface TimelineStatus {
  mandatory: number[]
  optional: number[]
  unplayable: number[]
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

  export const getInitialLBoundaries = (): [number, number] => [0, 0]

  export const getActiveLBoundaries = (
    multiverse: Multiverse,
  ): [number, number] => {
    const whiteCount = Multiverse.getCreatedTimelineCount(multiverse, Player.W)
    const blackCount = Multiverse.getCreatedTimelineCount(multiverse, Player.B)
    return [
      blackCount > whiteCount + 1 ? -whiteCount - 1 : -blackCount,
      whiteCount > blackCount + 1 ? blackCount + 1 : whiteCount,
    ]
  }

  export const getNewLineIndex = (
    multiverse: Multiverse,
    player: Player,
  ): number => {
    const [lMin, lMax] = Multiverse.getLBoundaries(multiverse)
    return player === Player.W ? lMax + 1 : lMin - 1
  }

  export const getTimelineEnd = (
    multiverse: Multiverse,
    l: number,
  ): { m: number, t: number, player: Player } | null => {
    const line = Multiverse.getLine(multiverse, l)
    if (! line) return null

    const m = Line.getLatestBoardIndex(line)
    if (m === null) return null

    const player = m % 2
    return { m, t: Coord.turn(m, player), player }
  }

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

  export const hasSubmittedPresentMoves = (multiverse: Multiverse, player: Player): boolean => {
    const present = Multiverse.getPresent(multiverse, player)
    return present !== null && Multiverse.getPresentPlayer(present) !== player
  }

  export const isPresentBoard = (
    multiverse: Multiverse,
    player: Player,
    { l, t }: CoordTimelike,
  ): boolean => {
    const present = Multiverse.getPresent(multiverse, player)
    return present !== null && present.m === t && present.lines.includes(l)
  }

  export const getTimelineStatus = (
    multiverse: Multiverse,
    player: Player,
    presentM = Multiverse.getPresent(multiverse, player)?.m ?? null,
  ): TimelineStatus => {
    const status: TimelineStatus = {
      mandatory: [],
      optional: [],
      unplayable: [],
    }

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      const m = Line.getLatestBoardIndex(line)
      if (m === null || Multiverse.isInactiveLine(multiverse, l)) {
        status.unplayable.push(l)
        continue
      }

      const endPlayer = m % 2
      if (m === presentM && endPlayer === player) {
        status.mandatory.push(l)
      }
      else if (endPlayer === player) {
        status.optional.push(l)
      }
      else {
        status.unplayable.push(l)
      }
    }

    return status
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

  export const isRoyal = (piece: Piece): boolean => (
    piece === Piece.KW || piece === Piece.KB
  )
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

  export const isSquareUnderAttack = (
    board: Board,
    square: CoordSpacelike,
    attacker: Player,
  ): boolean => {
    const attackerPawn = attacker === Player.W ? Piece.PW : Piece.PB
    const attackerKnight = attacker === Player.W ? Piece.NW : Piece.NB
    const attackerBishop = attacker === Player.W ? Piece.BW : Piece.BB
    const attackerRook = attacker === Player.W ? Piece.RW : Piece.RB
    const attackerQueen = attacker === Player.W ? Piece.QW : Piece.QB
    const attackerKing = attacker === Player.W ? Piece.KW : Piece.KB

    const pawnY = square.y - getPawnDirection(attacker)
    for (const dx of [-1, 1]) {
      const pawn = { x: square.x + dx, y: pawnY }
      if (Coord.isInBoard(pawn) && Board.getPiece(pawn, board) === attackerPawn) return true
    }

    for (const [dx, dy] of [
      [1, 2], [2, 1], [-1, 2], [-2, 1],
      [1, -2], [2, -1], [-1, -2], [-2, -1],
    ] as const) {
      const knight = { x: square.x + dx, y: square.y + dy }
      if (Coord.isInBoard(knight) && Board.getPiece(knight, board) === attackerKnight) return true
    }

    for (const [dx, dy] of [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ] as const) {
      const king = { x: square.x + dx, y: square.y + dy }
      if (Coord.isInBoard(king) && Board.getPiece(king, board) === attackerKing) return true
    }

    if (hasPhysicalSlidingAttack(board, square, [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ], attackerRook, attackerQueen)) {
      return true
    }

    return hasPhysicalSlidingAttack(board, square, [
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ], attackerBishop, attackerQueen)
  }

  export const hasPhysicalCheck = (
    board: Board,
    player: Player,
  ): boolean => {
    const king = player === Player.W ? Piece.KW : Piece.KB
    const attacker = Players.opponent(player)

    for (const [x, y] of Coord.spacelikes()) {
      if (Board.getPiece({ x, y }, board) !== king) continue
      if (Board.isSquareUnderAttack(board, { x, y }, attacker)) return true
    }

    return false
  }

  const hasPhysicalSlidingAttack = (
    board: Board,
    square: CoordSpacelike,
    directions: CoordSpacelike[],
    slider: Piece,
    queen: Piece,
  ): boolean => {
    for (const direction of directions) {
      for (
        let current = { x: square.x + direction.x, y: square.y + direction.y };
        Coord.isInBoard(current);
        current = { x: current.x + direction.x, y: current.y + direction.y }
      ) {
        const piece = Board.getPiece(current, board)
        if (piece === Piece.E) continue
        if (piece === slider || piece === queen) return true
        break
      }
    }

    return false
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

  export const getMovablePieces = (
    multiverse: Multiverse,
    player: Player,
    presentM?: number,
  ): Coord[] => {
    const { mandatory, optional } = Multiverse.getTimelineStatus(multiverse, player, presentM)
    const movablePieces: Coord[] = []

    for (const l of [...mandatory, ...optional].sort((a, b) => a - b)) {
      const line = Multiverse.getLine(multiverse, l)
      const m = Line.getLatestBoardIndex(line)
      if (m === null) continue

      const board = line.boards[m]
      const t = Coord.turn(m, player)
      for (const [x, y] of Coord.spacelikes()) {
        const piece = Board.getPiece({ x, y }, board)
        if (Pieces.getPlayer(piece) !== player) continue

        const from = { x, y, l, t }
        if (Multiverse.getMoveTargets(multiverse, from, player).length > 0) {
          movablePieces.push(from)
        }
      }
    }

    return movablePieces
  }

  export const findChecks = (
    multiverse: Multiverse,
    attackingPlayer: Player,
  ): Move[] => {
    const defendingPlayer = Players.opponent(attackingPlayer)
    const checks: Move[] = []

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      if (Multiverse.isInactiveLine(multiverse, l)) continue

      const m = Line.getLatestBoardIndex(line)
      if (m === null || m % 2 !== attackingPlayer) continue

      const board = line.boards[m]
      const t = Coord.turn(m, attackingPlayer)
      for (const [x, y] of Coord.spacelikes()) {
        const piece = Board.getPiece({ x, y }, board)
        if (Pieces.getPlayer(piece) !== attackingPlayer) continue

        const from = { x, y, l, t }
        for (const to of Multiverse.getMoveTargets(multiverse, from, attackingPlayer)) {
          const targetBoard = Multiverse.getBoard(multiverse, to, attackingPlayer)
          if (! targetBoard) continue

          const targetPiece = Board.getPiece(to, targetBoard)
          if (Pieces.getPlayer(targetPiece) === defendingPlayer && Pieces.isRoyal(targetPiece)) {
            checks.push({ from, to })
          }
        }
      }
    }

    return checks
  }

  export const isInCheck = (
    multiverse: Multiverse,
    player: Player,
  ): boolean => (
    Multiverse.findChecks(multiverse, Players.opponent(player)).length > 0
  )

  export const createPhantom = (
    multiverseOld: Multiverse,
    player: Player,
  ): Multiverse => create(multiverseOld, (multiverse) => {
    for (const [, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      const m = Line.getLatestBoardIndex(line)
      if (m === null || m % 2 !== player) continue

      const board = Board.clone(line.boards[m])
      board.createdBy = null
      board.createdByPlayer = null
      board.createdByRole = null
      board.createdByOrder = null
      line.boards[m + 1] = board
    }
  })

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

export type CheckmateStatus = 'not-checkmate' | 'checkmate' | 'stalemate'

export interface CheckmateResult {
  status: CheckmateStatus
  legalAction: Action | null
  checks: Move[]
}

type Semimove =
  | { kind: 'physical', move: Move, board: Board }
  | { kind: 'arriving', move: Move, board: Board, departingIndex: number }
  | { kind: 'departing', from: Coord, board: Board }
  | { kind: 'null', tl: CoordTimelike }

interface Hypercuboid {
  axes: Set<number>[]
}

interface HypercuboidSlice {
  fixedAxes: Map<number, Set<number>>
}

interface HypercuboidSearchSpace {
  hcs: Hypercuboid[]
}

interface HypercuboidInfo {
  multiverse: Multiverse
  player: Player
  presentT: number
  lineToAxis: Map<number, number>
  axisCoords: Semimove[][]
  newAxis: number
  dimension: number
  mandatoryLines: number[]
}

const findLegalActionHypercuboid = (
  multiverse: Multiverse,
  player: Player,
): Action | null => {
  if (Multiverse.isInCheck(multiverse, player)) return null
  if (Multiverse.hasSubmittedPresentMoves(multiverse, player)) return { moves: [] }

  const built = buildHypercuboid(multiverse, player)
  if (built === null) return null

  const { info, searchSpace } = built
  while (searchSpace.hcs.length > 0) {
    const hc = searchSpace.hcs.pop()!
    const point = takeHypercuboidPoint(info, hc)
    if (point === null) continue

    const problem = findHypercuboidProblem(info, point, hc)
    if (problem !== null) {
      searchSpace.hcs.push(...removeHypercuboidSlice(hc, problem).hcs)
      continue
    }

    return { moves: hypercuboidPointToAction(info, point) }
  }

  return null
}

const buildHypercuboid = (
  multiverse: Multiverse,
  player: Player,
): { info: HypercuboidInfo, searchSpace: HypercuboidSearchSpace } | null => {
  const present = Multiverse.getPresent(multiverse, player)
  if (present === null) return null

  const presentT = Coord.turn(present.m, player)
  const { mandatory, optional } = Multiverse.getTimelineStatus(multiverse, player, present.m)
  const playableLines = [...mandatory, ...optional]

  const lineToAxis = new Map<number, number>()
  const axisCoords: Semimove[][] = []
  const arrivesTo = new Map<number, Move[]>()
  const staysOn = new Map<number, Move[]>()
  const departsFrom = new Map<number, Coord[]>()
  const jumpIndices = new Map<string, number>()

  for (const from of Multiverse.getMovablePieces(multiverse, player, present.m)) {
    let hasDepart = false
    for (const to of Multiverse.getMoveTargets(multiverse, from, player)) {
      const move = { from, to }
      if (! Coord.isSameBoard(from, to)) {
        if (! hasDepart) {
          getOrCreate(departsFrom, from.l).push(from)
          hasDepart = true
        }
        getOrCreate(arrivesTo, to.l).push(move)
      }
      else {
        getOrCreate(staysOn, from.l).push(move)
      }
    }
  }

  for (const l of playableLines.sort((a, b) => a - b)) {
    const locs: Semimove[] = [{ kind: 'null', tl: { t: presentT, l } }]

    for (const move of staysOn.get(l) ?? []) {
      const board = createPhysicalSemimoveBoard(multiverse, move, player)
      if (! Board.hasPhysicalCheck(board, player)) {
        locs.push({ kind: 'physical', move, board })
      }
    }

    for (const from of departsFrom.get(l) ?? []) {
      const board = createDepartingSemimoveBoard(multiverse, from, player)
      if (! Board.hasPhysicalCheck(board, player)) {
        jumpIndices.set(coordKey(from), locs.length)
        locs.push({ kind: 'departing', from, board })
      }
    }

    for (const move of arrivesTo.get(l) ?? []) {
      const timelineEnd = Multiverse.getTimelineEnd(multiverse, move.to.l)
      const targetM = Coord.boardIndex(move.to, player)
      if (timelineEnd?.m !== targetM) continue

      const board = createArrivingSemimoveBoard(multiverse, move, player)
      if (! Board.hasPhysicalCheck(board, player)) {
        locs.push({ kind: 'arriving', move, board, departingIndex: -1 })
      }
    }

    lineToAxis.set(l, axisCoords.length)
    axisCoords.push(locs)
  }

  const newAxis = axisCoords.length
  let maxBranch = 0
  for (const froms of departsFrom.values()) {
    if (froms.length > 0) maxBranch += 1
  }

  const newLine = Multiverse.getNewLineIndex(multiverse, player)
  const newLineSign = player === Player.W ? 1 : -1
  const branchLocs: Semimove[] = [{ kind: 'null', tl: { t: presentT, l: newLine } }]
  for (const arrives of arrivesTo.values()) {
    for (const move of arrives) {
      if (! jumpIndices.has(coordKey(move.from))) continue

      const board = createArrivingSemimoveBoard(multiverse, move, player)
      if (! Board.hasPhysicalCheck(board, player)) {
        branchLocs.push({
          kind: 'arriving',
          move,
          board,
          departingIndex: jumpIndices.get(coordKey(move.from))!,
        })
      }
    }
  }

  for (let i = 0; i < maxBranch; i += 1) {
    const l = newLine + newLineSign * i
    lineToAxis.set(l, newAxis + i)
    axisCoords.push(branchLocs.map(cloneSemimove))
  }

  const dimension = axisCoords.length
  const universe: Hypercuboid = {
    axes: axisCoords.map(axis => new Set(axis.map((_, index) => index))),
  }

  for (let n = 0; n < axisCoords.length; n += 1) {
    for (let i = 0; i < axisCoords[n].length; i += 1) {
      const loc = axisCoords[n][i]
      if (loc.kind !== 'arriving') continue

      const departingIndex = jumpIndices.get(coordKey(loc.move.from))
      if (departingIndex === undefined) {
        universe.axes[n].delete(i)
      }
      else {
        loc.departingIndex = departingIndex
      }
    }
  }

  const hcByBranchCount = cloneHypercuboid(universe)
  const branchNull = new Set([0])
  const branchNonNull = new Set<number>()
  if (newAxis < dimension) {
    for (let i = 1; i < axisCoords[newAxis].length; i += 1) {
      branchNonNull.add(i)
    }
    for (let n = newAxis; n < dimension; n += 1) {
      hcByBranchCount.axes[n] = new Set(branchNull)
    }
  }

  const searchSpace: HypercuboidSearchSpace = { hcs: [hcByBranchCount] }
  for (let n = newAxis; n < dimension; n += 1) {
    hcByBranchCount.axes[n] = new Set(branchNonNull)
    searchSpace.hcs.unshift(cloneHypercuboid(hcByBranchCount))
  }

  return {
    info: {
      multiverse,
      player,
      presentT,
      lineToAxis,
      axisCoords,
      newAxis,
      dimension,
      mandatoryLines: mandatory,
    },
    searchSpace,
  }
}

const takeHypercuboidPoint = (
  info: HypercuboidInfo,
  hc: Hypercuboid,
): number[] | null => {
  const edges = new Map<number, Set<number>>()
  const edgeRefs = new Map<string, number>()
  const mustInclude: number[] = []
  const result = Array.from({ length: info.dimension }, () => -1)

  for (let n = 0; n < info.dimension; n += 1) {
    let hasNonJump = false
    const ghostArrivals: number[] = []

    for (const i of [...hc.axes[n]].sort((a, b) => a - b)) {
      const loc = info.axisCoords[n][i]
      if (loc.kind === 'physical' || loc.kind === 'null') {
        if (! hasNonJump) {
          hasNonJump = true
          result[n] = i
        }
      }
      else if (loc.kind === 'arriving') {
        const fromAxis = info.lineToAxis.get(loc.move.from.l)
        if (fromAxis === undefined || ! hc.axes[fromAxis].has(loc.departingIndex)) {
          ghostArrivals.push(i)
          continue
        }

        const key = edgeKey(fromAxis, n)
        if (! edgeRefs.has(key)) {
          addGraphEdge(edges, fromAxis, n)
          edgeRefs.set(key, loc.departingIndex)
          edgeRefs.set(edgeKey(n, fromAxis), i)
        }
      }
    }

    for (const i of ghostArrivals) {
      hc.axes[n].delete(i)
    }
    if (hc.axes[n].size === 0) return null
    if (! hasNonJump) mustInclude.push(n)
  }

  const matching = findMatching(info.dimension, edges, mustInclude)
  if (matching === null) return null

  for (const [u, v] of matching) {
    result[u] = edgeRefs.get(edgeKey(u, v))!
    result[v] = edgeRefs.get(edgeKey(v, u))!
  }

  return result.some(index => index < 0) ? null : result
}

const findHypercuboidProblem = (
  info: HypercuboidInfo,
  point: number[],
  hc: Hypercuboid,
): HypercuboidSlice | null => {
  const problem = jumpOrderConsistent(info, point, hc)
    ?? testHypercuboidPresent(info, point, hc)
    ?? findHypercuboidChecks(info, point, hc)
  if (problem === null) return null
  return hypercuboidSliceContains(problem, point) ? problem : removeSelectedPointSlice(point)
}

const jumpOrderConsistent = (
  info: HypercuboidInfo,
  point: number[],
  hc: Hypercuboid,
): HypercuboidSlice | null => {
  const jumpMap = new Map<string, number>()

  for (let n = info.newAxis; n < info.dimension; n += 1) {
    const loc = info.axisCoords[n][point[n]]
    if (loc.kind === 'null') break
    if (loc.kind !== 'arriving') continue

    const { from, to } = loc.move
    const toAxis = info.lineToAxis.get(to.l)
    const targetEnd = Multiverse.getTimelineEnd(info.multiverse, to.l)
    if (toAxis !== undefined && targetEnd?.t === to.t && targetEnd.player === info.player) {
      const toLoc = info.axisCoords[toAxis][point[toAxis]]
      if (toLoc.kind === 'null') {
        const arrivalsToSameBoard = new Set<number>()
        for (const i of hc.axes[n]) {
          const candidate = info.axisCoords[n][i]
          if (candidate.kind === 'arriving' && coordTimelikeKey(candidate.move.to) === coordTimelikeKey(to)) {
            arrivalsToSameBoard.add(i)
          }
        }
        return createSlice([
          [n, arrivalsToSameBoard],
          [toAxis, new Set([point[toAxis]])],
        ])
      }
    }

    const sourceKey = coordTimelikeKey(from)
    const previousBranchAxis = jumpMap.get(sourceKey)
    if (previousBranchAxis !== undefined) {
      const laterBranchArrivals = new Set<number>()
      const earlierBranchArrivals = new Set<number>()

      for (const i of hc.axes[n]) {
        const candidate = info.axisCoords[n][i]
        if (candidate.kind === 'arriving' && coordTimelikeKey(candidate.move.from) === sourceKey) {
          laterBranchArrivals.add(i)
        }
      }
      for (const i of hc.axes[previousBranchAxis]) {
        const candidate = info.axisCoords[previousBranchAxis][i]
        if (candidate.kind === 'arriving' && coordTimelikeKey(candidate.move.to) === sourceKey) {
          earlierBranchArrivals.add(i)
        }
      }

      return createSlice([
        [n, laterBranchArrivals],
        [previousBranchAxis, earlierBranchArrivals],
      ])
    }

    jumpMap.set(coordTimelikeKey(to), n)
  }

  return null
}

const testHypercuboidPresent = (
  info: HypercuboidInfo,
  point: number[],
  hc: Hypercuboid,
): HypercuboidSlice | null => {
  const [l0Min, l0Max] = Multiverse.getInitialLBoundaries()
  const [lMin, lMax] = Multiverse.getLBoundaries(info.multiverse)
  let [l1Min, l1Max] = Multiverse.getLBoundaries(info.multiverse)
  let [activeMin, activeMax] = Multiverse.getActiveLBoundaries(info.multiverse)
  let minT = info.presentT
  let passCoord: [number, number] | null = null
  let reactivateMoveAxis: number | null = null

  for (const l of info.mandatoryLines) {
    const axis = info.lineToAxis.get(l)
    if (axis === undefined) continue
    if (info.axisCoords[axis][point[axis]].kind === 'null') {
      passCoord = [axis, point[axis]]
    }
  }

  for (let n = info.newAxis; n < info.dimension; n += 1) {
    const loc = info.axisCoords[n][point[n]]
    if (loc.kind === 'null') break

    let reactivated: number | null = null
    let newLine: number
    if (info.player === Player.W) {
      l1Max += 1
      newLine = l1Max
    }
    else {
      l1Min -= 1
      newLine = l1Min
    }

    const whiteLines = l1Max - l0Max
    const blackLines = l0Min - l1Min
    if (newLine > l0Max && whiteLines <= blackLines + 1 && newLine > activeMax) {
      activeMax += 1
      if (l1Min < activeMin) {
        activeMin -= 1
        reactivated = activeMin
      }
    }
    else if (newLine < l0Min && blackLines <= whiteLines + 1 && newLine < activeMin) {
      activeMin -= 1
      if (l1Max > activeMax) {
        activeMax += 1
        reactivated = activeMax
      }
    }

    const tl = extractSemimoveTimelike(loc)
    if (tl.t < minT && activeMin <= newLine && newLine <= activeMax) {
      minT = tl.t
      passCoord = null
      reactivateMoveAxis = null
    }

    if (reactivated !== null) {
      const timelineEnd = Multiverse.getTimelineEnd(info.multiverse, reactivated)
      if (timelineEnd && timelineEnd.t <= minT && timelineEnd.player === info.player) {
        minT = timelineEnd.t
        const axis = info.lineToAxis.get(reactivated)
        if (axis !== undefined && info.axisCoords[axis][point[axis]].kind === 'null') {
          passCoord = [axis, point[axis]]
          reactivateMoveAxis = n
        }
      }
    }
  }

  if (passCoord === null) return null

  const fixedAxes: Array<[number, Set<number>]> = [
    [passCoord[0], new Set([passCoord[1]])],
  ]
  const whiteLines = lMax - l0Max
  const blackLines = l0Min - lMin
  const timelineAdvantage = info.player === Player.B
    ? whiteLines - blackLines
    : blackLines - whiteLines
  const lastBranchAxis = Math.min(timelineAdvantage + info.newAxis, info.dimension - 1)

  for (let n = info.newAxis; n <= lastBranchAxis; n += 1) {
    if (reactivateMoveAxis === n) continue

    const banned = new Set<number>()
    for (const i of hc.axes[n]) {
      const loc = info.axisCoords[n][i]
      if (loc.kind === 'null') {
        banned.add(i)
      }
      else if (loc.kind === 'arriving' && loc.move.to.t >= minT) {
        banned.add(i)
      }
    }
    fixedAxes.push([n, banned])
  }

  return createSlice(fixedAxes)
}

const findHypercuboidChecks = (
  info: HypercuboidInfo,
  point: number[],
  hc: Hypercuboid,
): HypercuboidSlice | null => {
  const action = { moves: hypercuboidPointToAction(info, point) }
  const multiverseNext = Multiverse.applyAction(action, info.player, info.multiverse)
  if (! Multiverse.hasSubmittedPresentMoves(multiverseNext, info.player)) {
    return removeSelectedPointSlice(point)
  }

  const attackingPlayer = Players.opponent(info.player)
  const check = Multiverse.findChecks(multiverseNext, attackingPlayer)[0]
  if (! check) return null

  if (Coord.isSameBoard(check.from, check.to)) {
    return removeSelectedPointSlice(point)
  }

  const { path, slidingType } = getMovePath(multiverseNext, check, attackingPlayer)
  const isNext = info.player === Player.B
    ? (t1: number, t2: number) => t1 + 1 === t2
    : (t1: number, t2: number) => t1 === t2
  const problem = createSlice([])
  const checkingPiece = Multiverse.getBoard(multiverseNext, check.from, attackingPlayer)
    ? Board.getPiece(check.from, Multiverse.getBoard(multiverseNext, check.from, attackingPlayer)!)
    : Piece.E

  const sourceAxis = info.lineToAxis.get(check.from.l)
  if (sourceAxis !== undefined) {
    const notTaking = new Set<number>()
    for (const i of hc.axes[sourceAxis]) {
      const loc = info.axisCoords[sourceAxis][i]
      if (! semimoveCreatesBoardAt(loc, check.from.t, isNext)) continue

      const board = extractSemimoveBoard(loc)
      if (! board) continue

      if (slidingType > 0) {
        if (hasSlidingPieceWithType(board, check.from, attackingPlayer, slidingType)) {
          notTaking.add(i)
        }
      }
      else if (Board.getPiece(check.from, board) === checkingPiece) {
        notTaking.add(i)
      }
    }
    problem.fixedAxes.set(sourceAxis, notTaking)
  }

  const targetAxis = info.lineToAxis.get(check.to.l)
  if (targetAxis !== undefined) {
    const selected = info.axisCoords[targetAxis][point[targetAxis]]
    if (semimoveCreatesBoardAt(selected, check.to.t, isNext)) {
      const exposeRoyal = new Set<number>()
      for (const i of hc.axes[targetAxis]) {
        const loc = info.axisCoords[targetAxis][i]
        if (! semimoveCreatesBoardAt(loc, check.to.t, isNext)) continue

        const board = extractSemimoveBoard(loc)
        if (board && isRoyalAt(board, check.to, info.player)) {
          exposeRoyal.add(i)
        }
      }
      problem.fixedAxes.set(targetAxis, exposeRoyal)
    }
  }

  for (const crossed of path) {
    const axis = info.lineToAxis.get(crossed.l)
    if (axis === undefined) continue

    const selected = info.axisCoords[axis][point[axis]]
    if (! semimoveCreatesBoardAt(selected, crossed.t, isNext)) continue

    const notBlocking = new Set<number>()
    for (const i of hc.axes[axis]) {
      const loc = info.axisCoords[axis][i]
      if (! semimoveCreatesBoardAt(loc, crossed.t, isNext)) continue

      const board = extractSemimoveBoard(loc)
      if (! board) continue

      const piece = Board.getPiece(crossed, board)
      if (piece === Piece.E) {
        notBlocking.add(i)
        continue
      }
      if (slidingType > 0 && hasSlidingPieceWithType(board, crossed, attackingPlayer, slidingType)) {
        notBlocking.add(i)
        continue
      }
      if (isRoyalAt(board, crossed, info.player)) {
        notBlocking.add(i)
      }
    }
    problem.fixedAxes.set(axis, notBlocking)
  }

  return problem
}

const hypercuboidPointToAction = (
  info: HypercuboidInfo,
  point: number[],
): Move[] => {
  const moves: Move[] = []
  for (const [, axis] of [...info.lineToAxis.entries()].sort(([a], [b]) => a - b)) {
    const loc = info.axisCoords[axis][point[axis]]
    if (loc.kind === 'physical' || loc.kind === 'arriving') {
      moves.push(loc.move)
    }
  }
  return info.player === Player.B ? moves.reverse() : moves
}

const createPhysicalSemimoveBoard = (
  multiverse: Multiverse,
  { from, to }: Move,
  player: Player,
): Board => {
  const source = Multiverse.getBoard(multiverse, from, player)
  if (! source) throw new Error('Cannot create physical semimove from missing board')

  const board = Board.clone(source)
  const piece = Board.getPiece(from, board)
  Board.setPiece(from, board, Piece.E)
  applyPhysicalEnPassantCapture(board, piece, from, to)
  Board.setPiece(to, board, piece)
  applyPhysicalCastlingRookMove(board, piece, from, to)
  return board
}

const createDepartingSemimoveBoard = (
  multiverse: Multiverse,
  from: Coord,
  player: Player,
): Board => {
  const source = Multiverse.getBoard(multiverse, from, player)
  if (! source) throw new Error('Cannot create departing semimove from missing board')

  const board = Board.clone(source)
  Board.setPiece(from, board, Piece.E)
  return board
}

const createArrivingSemimoveBoard = (
  multiverse: Multiverse,
  { from, to }: Move,
  player: Player,
): Board => {
  const source = Multiverse.getBoard(multiverse, from, player)
  const target = Multiverse.getBoard(multiverse, to, player)
  if (! source || ! target) throw new Error('Cannot create arriving semimove from missing board')

  const board = Board.clone(target)
  Board.setPiece(to, board, Board.getPiece(from, source))
  return board
}

const applyPhysicalEnPassantCapture = (
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

const applyPhysicalCastlingRookMove = (
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

const getMovePath = (
  multiverse: Multiverse,
  move: Move,
  player: Player,
): { path: Coord[], slidingType: number } => {
  const board = Multiverse.getBoard(multiverse, move.from, player)
  if (! board) return { path: [], slidingType: 0 }

  const piece = Board.getPiece(move.from, board)
  if (! isSlidingPiece(piece)) return { path: [], slidingType: 0 }

  const delta = {
    x: move.to.x - move.from.x,
    y: move.to.y - move.from.y,
    t: move.to.t - move.from.t,
    l: move.to.l - move.from.l,
  }
  const step = {
    x: Math.sign(delta.x),
    y: Math.sign(delta.y),
    t: Math.sign(delta.t),
    l: Math.sign(delta.l),
  }
  const slidingType = [step.x, step.y, step.t, step.l].filter(Boolean).length
  if (slidingType === 0) return { path: [], slidingType: 0 }

  const path: Coord[] = []
  for (
    let current = addCoordDelta(move.from, step);
    ! Coord.isSameBoard(current, move.to) || ! Coord.isSameSpace(current, move.to);
    current = addCoordDelta(current, step)
  ) {
    path.push(current)
  }

  return { path, slidingType }
}

const isSlidingPiece = (piece: Piece): boolean => (
  piece === Piece.RW || piece === Piece.RB
  || piece === Piece.BW || piece === Piece.BB
  || piece === Piece.QW || piece === Piece.QB
)

const hasSlidingPieceWithType = (
  board: Board,
  square: CoordSpacelike,
  player: Player,
  slidingType: number,
): boolean => {
  const piece = Board.getPiece(square, board)
  if (Pieces.getPlayer(piece) !== player) return false
  if (piece === Piece.QW || piece === Piece.QB) return slidingType >= 1 && slidingType <= 4
  if (piece === Piece.RW || piece === Piece.RB) return slidingType === 1
  if (piece === Piece.BW || piece === Piece.BB) return slidingType === 2
  return false
}

const isRoyalAt = (
  board: Board,
  square: CoordSpacelike,
  player: Player,
): boolean => {
  const piece = Board.getPiece(square, board)
  return Pieces.getPlayer(piece) === player && Pieces.isRoyal(piece)
}

const semimoveCreatesBoardAt = (
  loc: Semimove,
  t: number,
  isNext: (sourceT: number, targetT: number) => boolean,
): boolean => {
  if (loc.kind === 'null') return false
  return isNext(extractSemimoveTimelike(loc).t, t)
}

const extractSemimoveBoard = (loc: Semimove): Board | null => {
  if (loc.kind === 'null') return null
  return loc.board
}

const extractSemimoveTimelike = (loc: Semimove): CoordTimelike => {
  switch (loc.kind) {
    case 'physical':
      return loc.move.from
    case 'arriving':
      return loc.move.to
    case 'departing':
      return loc.from
    case 'null':
      return loc.tl
  }
}

const cloneSemimove = (loc: Semimove): Semimove => {
  switch (loc.kind) {
    case 'physical':
      return { ...loc }
    case 'arriving':
      return { ...loc }
    case 'departing':
      return { ...loc }
    case 'null':
      return { kind: 'null', tl: { ...loc.tl } }
  }
}

const cloneHypercuboid = ({ axes }: Hypercuboid): Hypercuboid => ({
  axes: axes.map(axis => new Set(axis)),
})

const removeHypercuboidSlice = (
  hc: Hypercuboid,
  slice: HypercuboidSlice,
): HypercuboidSearchSpace => {
  const result: HypercuboidSearchSpace = { hcs: [] }
  const remaining = cloneHypercuboid(hc)

  for (const [axis, fixedCoords] of slice.fixedAxes) {
    const split = cloneHypercuboid(remaining)
    split.axes[axis] = setMinus(split.axes[axis], fixedCoords)
    remaining.axes[axis] = new Set(fixedCoords)
    if (split.axes[axis].size > 0) result.hcs.push(split)
  }

  return result
}

const removeSelectedPointSlice = (point: number[]): HypercuboidSlice => {
  return createSlice(point.map((coord, axis) => [axis, new Set([coord])]))
}

const hypercuboidSliceContains = (
  slice: HypercuboidSlice,
  point: number[],
): boolean => {
  for (const [axis, coords] of slice.fixedAxes) {
    if (! coords.has(point[axis])) return false
  }
  return true
}

const createSlice = (
  fixedAxes: Array<[number, Set<number>]>,
): HypercuboidSlice => ({
  fixedAxes: new Map(fixedAxes),
})

const setMinus = <T>(a: Set<T>, b: Set<T>): Set<T> => {
  const result = new Set(a)
  for (const item of b) result.delete(item)
  return result
}

const getOrCreate = <K, V>(map: Map<K, V[]>, key: K): V[] => {
  const existing = map.get(key)
  if (existing) return existing

  const created: V[] = []
  map.set(key, created)
  return created
}

const addCoordDelta = (
  coord: Coord,
  delta: { x: number, y: number, t: number, l: number },
): Coord => ({
  x: coord.x + delta.x,
  y: coord.y + delta.y,
  t: coord.t + delta.t,
  l: coord.l + delta.l,
})

const coordKey = ({ x, y, t, l }: Coord): string => `${l},${t},${x},${y}`

const coordTimelikeKey = ({ t, l }: CoordTimelike): string => `${l},${t}`

const edgeKey = (u: number, v: number): string => `${u},${v}`

const addGraphEdge = (
  edges: Map<number, Set<number>>,
  u: number,
  v: number,
): void => {
  getOrCreateSet(edges, u).add(v)
  getOrCreateSet(edges, v).add(u)
}

const getOrCreateSet = <K, V>(map: Map<K, Set<V>>, key: K): Set<V> => {
  const existing = map.get(key)
  if (existing) return existing

  const created = new Set<V>()
  map.set(key, created)
  return created
}

const findMatching = (
  dimension: number,
  edges: Map<number, Set<number>>,
  mustInclude: number[],
): Array<[number, number]> | null => {
  const matched = new Set<number>()
  const pairs: Array<[number, number]> = []

  const search = (): boolean => {
    const u = mustInclude.find(axis => ! matched.has(axis))
    if (u === undefined) return true

    for (const v of [...(edges.get(u) ?? [])].sort((a, b) => a - b)) {
      if (v < 0 || v >= dimension || matched.has(v)) continue

      matched.add(u)
      matched.add(v)
      pairs.push([u, v])
      if (search()) return true
      pairs.pop()
      matched.delete(u)
      matched.delete(v)
    }

    return false
  }

  return search() ? pairs.slice() : null
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
    return Multiverse.hasSubmittedPresentMoves(multiverse, player)
  }

  export const findLegalAction = ({
    multiverse,
    player,
  }: Pick<GameState, 'multiverse' | 'player'>): Action | null => {
    return findLegalActionHypercuboid(multiverse, player)
  }

  export const findLegalActionNaive = ({
    multiverse,
    player,
  }: Pick<GameState, 'multiverse' | 'player'>): Action | null => {
    const present = Multiverse.getPresent(multiverse, player)
    if (present === null) return null

    const [lMin, lMax] = Multiverse.getLBoundaries(multiverse)
    const initialLineLimit = player === Player.B ? lMax + 1 : lMin - 1
    return findLegalActionImpl(multiverse, player, present.m, [], initialLineLimit, false)
  }

  export const getCheckmateResult = (
    state: Pick<GameState, 'multiverse' | 'player'>,
  ): CheckmateResult => {
    const legalAction = GameState.findLegalAction(state)
    if (legalAction !== null) {
      return {
        status: 'not-checkmate',
        legalAction,
        checks: [],
      }
    }

    const attackingPlayer = Players.opponent(state.player)
    const checks = Multiverse.findChecks(
      Multiverse.createPhantom(state.multiverse, state.player),
      attackingPlayer,
    )

    return {
      status: checks.length > 0 ? 'checkmate' : 'stalemate',
      legalAction: null,
      checks,
    }
  }

  export const getCheckmateStatus = (
    state: Pick<GameState, 'multiverse' | 'player'>,
  ): CheckmateStatus => (
    GameState.getCheckmateResult(state).status
  )

  export const isCheckmate = (
    state: Pick<GameState, 'multiverse' | 'player'>,
  ): boolean => (
    GameState.getCheckmateStatus(state) === 'checkmate'
  )

  export const isStalemate = (
    state: Pick<GameState, 'multiverse' | 'player'>,
  ): boolean => (
    GameState.getCheckmateStatus(state) === 'stalemate'
  )

  const findLegalActionImpl = (
    multiverse: Multiverse,
    player: Player,
    presentM: number,
    moves: Move[],
    lineLimit: number,
    hasBranched: boolean,
  ): Action | null => {
    if (Multiverse.isInCheck(multiverse, player)) return null
    if (Multiverse.hasSubmittedPresentMoves(multiverse, player)) return { moves }

    for (const from of Multiverse.getMovablePieces(multiverse, player, presentM)) {
      for (const to of Multiverse.getMoveTargets(multiverse, from, player)) {
        const move = { from, to }
        const branching = isBranchingMove(multiverse, move, player)
        if (! branching && (hasBranched || isLineOutOfSearchOrder(player, to.l, lineLimit))) {
          continue
        }

        const multiverseNext = Multiverse.applyMove(move, player, multiverse)
        const legalAction = findLegalActionImpl(
          multiverseNext,
          player,
          presentM,
          [...moves, move],
          branching ? lineLimit : to.l,
          hasBranched || branching,
        )
        if (legalAction !== null) return legalAction
      }
    }

    return null
  }

  const isBranchingMove = (
    multiverse: Multiverse,
    { to }: Move,
    player: Player,
  ): boolean => {
    const line = Multiverse.getLine(multiverse, to.l)
    const latestM = Line.getLatestBoardIndex(line)
    if (latestM === null) return false
    return Coord.boardIndex(to, player) < latestM
  }

  const isLineOutOfSearchOrder = (
    player: Player,
    l: number,
    lineLimit: number,
  ): boolean => {
    return player === Player.B ? l > lineLimit : l < lineLimit
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
