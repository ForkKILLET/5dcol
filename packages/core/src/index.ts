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
    { lOffset, lFurthestB, lFurthestW }: Multiverse,
    player: Player,
  ): number => {
    switch (player) {
      case Player.W:
        return lFurthestW - lOffset + 1
      case Player.B:
        return lOffset - lFurthestB + 1
    }
  }

  export const canCreateActiveTimeline = (
    multiverse: Multiverse,
    player: Player,
  ): boolean => {
    const ownCount = Multiverse.getActiveTimelineCount(multiverse, player)
    const opponentCount = Multiverse.getActiveTimelineCount(
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

  export const turn = (time: number, player: Player): number => (
    (time - player) / 2
  )

  export const isSameBoard = (p: CoordTimelike, q: CoordTimelike) => p.l === q.l && p.t === q.t

  export const isSameSpace = (p: CoordSpacelike, q: CoordSpacelike) => p.x === q.x && p.y === q.y

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

  export const applyMove = ({ from, to }: Move, player: Player, multiverseOld: Multiverse) => create(multiverseOld, (multiverse) => {
    const move = { from, to }
    const boardFromNew = advance(from, player, multiverse)
    const piece = Board.getPiece(from, boardFromNew)
    const targetPiece = Coord.isSameBoard(from, to) ? Board.getPiece(to, boardFromNew) : Piece.E

    updateCastlingRightsForMove(boardFromNew, piece, from)
    updateCastlingRightsForCapture(boardFromNew, targetPiece, to)

    Board.setPiece(from, boardFromNew, Piece.E)
    if (Coord.isSameBoard(from, to)) {
      applyEnPassantCapture(boardFromNew, piece, from, to)
      Board.setPiece(to, boardFromNew, piece)
      applyCastlingRookMove(boardFromNew, piece, from, to)
    }
    else if (Coord.isFreshBoard(to, multiverse)) {
      const boardToNew = advance(to, player, multiverse)
      Board.setPiece(to, boardToNew, piece)
    }
    else {
      const boardToNew = fork(to, player, multiverse)
      Board.setPiece(to, boardToNew, piece)
    }
    multiverse.lastMove = move
  })

  export const applyAction = (action: Action, player: Player, multiverseOld: Multiverse) => (
    action.moves.reduce((multiverse, move) => applyMove(move, player, multiverse), multiverseOld)
  )
}
