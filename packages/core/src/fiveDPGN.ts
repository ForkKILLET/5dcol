import {
  Board,
  Coord,
  GameState,
  Line,
  Multiverse,
  Piece,
  Pieces,
  Player,
  Players,
  type Action,
  type CoordSpacelike,
  type CoordTimelike,
  type Move,
} from './index.js'

const FILES = 'abcdefgh'
const PIECE_NAMES = 'PWKCQYSNRBUD'
const EVALUATION_SYMBOLS = ['!!', '!?', '?!', '??', '!', '?']
const RESULT_SYMBOLS = ['1-0', '0-1', '1/2-1/2', '*']
const PIECE_SYMBOLS: Partial<Record<number, string>> = {
  [0x02]: 'R',
  [0x03]: 'N',
  [0x04]: 'B',
  [0x05]: 'Q',
  [0x06]: 'K',
  [0x12]: 'R',
  [0x13]: 'N',
  [0x14]: 'B',
  [0x15]: 'Q',
  [0x16]: 'K',
}

export interface ExportOptions {
  includePieceSymbols?: boolean
  includeTravelMarkers?: boolean
  includeCaptureMarkers?: boolean
  includeCheckMarkers?: boolean
  includePromotionMarkers?: boolean
  initialMultiverse?: Multiverse
  headers?: ExportHeaders
  result?: ExportResult
}

export type ExportResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export type ExportHeaders = Record<string, string | number | null | undefined> | ExportHeader[]

export interface ExportHeader {
  key: string
  value: string | number | null | undefined
}

export interface FormattedAction {
  index: number
  serial: string
  player: 'w' | 'b'
  moves: FormattedMove[]
}

export interface FormattedMove {
  text: string
  segments: FormattedMoveSegment[]
}

export interface FormattedMoveSegment {
  text: string
  board: CoordTimelike
}

export interface ActionTree {
  variations: ActionTreeVariation[]
}

export interface ActionTreeVariation {
  action: Action
  subtree?: ActionTree
}

interface ParsedGame {
  initialMultiverse: Multiverse
  tree: ActionTree
}

interface FENBoardBlock {
  board: Board
  l: number
  t: number
  player: Player
}

interface MoveFormatContext {
  piece: Piece
  capture: boolean
  branching: boolean
  promotion: boolean
  suffix: string
}

interface ActionFormatResult {
  action: FormattedAction
  multiverse: Multiverse
  player: Player
}

interface ResolvedExportOptions extends Required<Omit<ExportOptions, 'headers' | 'result' | 'initialMultiverse'>> {
  initialMultiverse?: Multiverse
  headers?: ExportHeaders
  result: ExportResult
}

interface BoardPattern {
  l?: number
  t?: number
}

interface MovePattern {
  sourceBoard?: BoardPattern
  targetBoard?: BoardPattern
  piece?: string
  fromFile?: number
  fromRankY?: number
  toFile: number
  toRankY: number
  jump?: '>' | '>>'
  physical?: boolean
}

interface TurnSerial {
  number?: number
  player?: Player
}

const DEFAULT_HEADER_VALUES: Record<string, string> = {
  Event: '5D Chess Online',
  Site: '?',
  Date: '????.??.??',
  Time: '??:??:??',
  Round: '?',
  White: 'White',
  Black: 'Black',
  Mode: '5D',
  Board: 'Standard',
}

const HEADER_ORDER = [
  'Event',
  'Site',
  'Date',
  'Time',
  'Round',
  'White',
  'Black',
  'Result',
  'Mode',
  'Board',
]

const DEFAULT_EXPORT_OPTIONS: ResolvedExportOptions = {
  includePieceSymbols: false,
  includeTravelMarkers: false,
  includeCaptureMarkers: false,
  includeCheckMarkers: false,
  includePromotionMarkers: false,
  result: '*',
}

export const exportGameState = (
  { actions, initialMultiverse }: Pick<GameState, 'actions'> & Partial<Pick<GameState, 'initialMultiverse'>>,
  options: ExportOptions = {},
): string => {
  return exportActionTree(actionsToTree(actions), {
    ...options,
    initialMultiverse: options.initialMultiverse ?? initialMultiverse,
  })
}

export const exportFEN = (
  multiverse: Multiverse = Multiverse.createInitial(),
): string => {
  const blocks: string[] = []
  for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
    if (! line) continue
    for (const [m, board] of Line.getBoardEntries(line)) {
      if (! board) continue
      const player = m % 2
      blocks.push(`[${formatBoardFEN(board)}:${l}:${Coord.turn(m, player)}:${player === Player.W ? 'w' : 'b'}]`)
    }
  }
  return `${blocks.join('\n')}\n`
}

const shouldExportInitialMultiverse = (multiverse: Multiverse): boolean => (
  exportFEN(multiverse) !== exportFEN(Multiverse.createInitial())
)

export const exportActionTree = (
  tree: ActionTree,
  options: ExportOptions = {},
): string => {
  const resolvedOptions = resolveExportOptions(options)
  const initialMultiverse = resolvedOptions.initialMultiverse ?? Multiverse.createInitial()
  const body = formatActionTree(tree, {
    actionIndex: 0,
    multiverse: initialMultiverse,
    options: resolvedOptions,
    player: Player.W,
  })
  const fenPrelude = shouldExportInitialMultiverse(initialMultiverse)
    ? [exportFEN(initialMultiverse).trim(), '']
    : []
  const lines = [
    ...formatHeaders(resolvedOptions),
    '',
    ...fenPrelude,
    ...(body.trim() ? [body] : []),
    resolvedOptions.result,
  ]
  return `${lines.join('\n')}\n`
}

export const formatActions = (
  actions: readonly Action[],
  options: ExportOptions = {},
): FormattedAction[] => {
  const resolvedOptions = resolveExportOptions(options)
  let multiverse = resolvedOptions.initialMultiverse ?? Multiverse.createInitial()
  let player = Player.W

  return actions.map((action, actionIndex) => {
    const result = formatActionInContext(action, {
      actionIndex,
      markTerminalCheckmate: actionIndex === actions.length - 1,
      multiverse,
      options: resolvedOptions,
      player,
    })
    multiverse = result.multiverse
    player = result.player
    return result.action
  })
}

export const importGameState = (input: string): GameState => {
  const { initialMultiverse, tree } = parseGame(input)
  return createGameState(initialMultiverse, actionTreeToMainline(tree))
}

export const parseActionTree = (input: string): ActionTree => {
  return parseGame(input).tree
}

const parseGame = (input: string): ParsedGame => new Parser(input).parse()

const actionsToTree = (actions: readonly Action[]): ActionTree => {
  const root: ActionTree = { variations: [] }
  let tree = root
  for (const action of actions) {
    const subtree: ActionTree = { variations: [] }
    tree.variations.push({ action, subtree })
    tree = subtree
  }
  return root
}

const actionTreeToMainline = (tree: ActionTree): Action[] => {
  const actions: Action[] = []
  let current: ActionTree | undefined = tree
  while (current && current.variations.length > 0) {
    const variation: ActionTreeVariation = current.variations[current.variations.length - 1]!
    actions.push(variation.action)
    current = variation.subtree
  }
  return actions
}

const createGameState = (initialMultiverse: Multiverse, actions: Action[]): GameState => {
  let multiverseCommitted = initialMultiverse
  let player = Player.W

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const action = actions[actionIndex]!
    for (let moveIndex = 0; moveIndex < action.moves.length; moveIndex += 1) {
      multiverseCommitted = Multiverse.applyMove(
        action.moves[moveIndex]!,
        player,
        multiverseCommitted,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moveIndex,
      )
    }
    if (! Multiverse.hasSubmittedPresentMoves(multiverseCommitted, player)) {
      throw new Error(`5dpgn action ${actionIndex + 1} does not submit the present`)
    }
    player = Players.opponent(player)
  }

  return {
    initialMultiverse,
    actions,
    multiverseCommitted,
    multiverse: multiverseCommitted,
    player,
    actionIndex: actions.length,
    pendingMoves: [],
  }
}

const formatActionTree = (
  tree: ActionTree,
  {
    actionIndex,
    multiverse,
    options,
    player,
  }: {
    actionIndex: number
    multiverse: Multiverse
    options: ResolvedExportOptions
    player: Player
  },
): string => {
  const parts: string[] = []

  for (let index = 0; index < tree.variations.length; index += 1) {
    const variation = tree.variations[index]!
    const hasSubtree = Boolean(variation.subtree?.variations.length)
    const result = formatActionInContext(variation.action, {
      actionIndex,
      markTerminalCheckmate: ! hasSubtree,
      multiverse,
      options,
      player,
    })
    const actionLine = formatActionLine(result.action)
    const subtreeText = hasSubtree
      ? formatActionTree(variation.subtree!, {
          actionIndex: actionIndex + 1,
          multiverse: result.multiverse,
          options,
          player: result.player,
        })
      : ''
    const variationText = subtreeText ? `${actionLine}\n${subtreeText}` : actionLine
    const shouldParenthesize = tree.variations.length > 1 && index < tree.variations.length - 1
    parts.push(shouldParenthesize ? `(${variationText})` : variationText)
  }

  return parts.join('\n')
}

const formatActionInContext = (
  action: Action,
  {
    actionIndex,
    markTerminalCheckmate,
    multiverse,
    options,
    player,
  }: {
    actionIndex: number
    markTerminalCheckmate: boolean
    multiverse: Multiverse
    options: ResolvedExportOptions
    player: Player
  },
): ActionFormatResult => {
  const moves: FormattedMove[] = []
  let nextMultiverse = multiverse

  for (let moveIndex = 0; moveIndex < action.moves.length; moveIndex ++) {
    const move = action.moves[moveIndex]!
    const piece = getMovePiece(nextMultiverse, move, player)
    const context: MoveFormatContext = {
      piece,
      capture: isCaptureMove(nextMultiverse, move, player, piece),
      branching: isBranchingMove(nextMultiverse, move, player),
      promotion: isPromotionMove(piece, move.to),
      suffix: '',
    }
    const checksBefore = options.includeCheckMarkers
      ? new Set(getChecksGiven(nextMultiverse, player).map(getMoveKey))
      : null

    nextMultiverse = Multiverse.applyMove(
      move,
      player,
      nextMultiverse,
      actionIndex * GameState.MOVE_ORDER_STRIDE + moveIndex,
    )
    if (
      options.includeCheckMarkers
      && getChecksGiven(nextMultiverse, player).some(check => ! checksBefore?.has(getMoveKey(check)))
    ) {
      context.suffix = '+'
    }
    moves.push(formatMove(move, context, options))
  }

  if (options.includeCheckMarkers && moves.length > 0 && markTerminalCheckmate) {
    applyTerminalCheckmateMarker(moves, nextMultiverse, player)
  }

  return {
    action: {
      index: actionIndex,
      serial: getTurnSerial(actionIndex),
      player: player === Player.W ? 'w' as const : 'b' as const,
      moves,
    },
    multiverse: nextMultiverse,
    player: Players.opponent(player),
  }
}

const applyTerminalCheckmateMarker = (
  moves: FormattedMove[],
  multiverse: Multiverse,
  player: Player,
): void => {
  const checkmateStatus = GameState.getCheckmateStatus({
    multiverse,
    player: Players.opponent(player),
  })
  if (checkmateStatus !== 'checkmate') return

  const lastMove = moves[moves.length - 1]!
  const withoutCheck = lastMove.text.endsWith('+') ? lastMove.text.slice(0, -1) : lastMove.text
  lastMove.text = `${withoutCheck}#`
  const lastSegment = lastMove.segments[lastMove.segments.length - 1]
  if (lastSegment) {
    lastSegment.text = lastSegment.text.endsWith('+')
      ? `${lastSegment.text.slice(0, -1)}#`
      : `${lastSegment.text}#`
  }
}

const formatActionLine = (action: FormattedAction): string => (
  `${action.serial} ${action.moves.map(move => move.text).join(' ')}`
)

class Parser {
  private cursor = 0
  private readonly fenBlocks: FENBoardBlock[] = []

  constructor(private readonly input: string) {}

  parse(): ParsedGame {
    this.skipPrelude()
    const initialMultiverse = this.fenBlocks.length > 0
      ? createMultiverseFromFENBlocks(this.fenBlocks)
      : Multiverse.createInitial()
    const tree = this.parseGameTree(initialMultiverse, Player.W, 0)
    this.skipSpaceComments()
    if (this.consumeResult()) {
      this.skipSpaceComments()
    }
    if (! this.isDone()) {
      throw this.error(`Unexpected 5dpgn syntax near "${this.input.slice(this.cursor, this.cursor + 32).trim()}"`)
    }
    return { initialMultiverse, tree }
  }

  private parseGameTree(multiverse: Multiverse, player: Player, actionIndex: number): ActionTree {
    const variations: ActionTreeVariation[] = []

    while (true) {
      this.skipSpaceComments()
      if (this.isDone() || this.peek() === ')' || this.isResultStart()) break

      if (this.isVariationStart()) {
        this.consume('(')
        this.skipSpaceComments()
        variations.push(this.parseVariation(multiverse, player, actionIndex))
        this.skipSpaceComments()
        this.consume(')')
        continue
      }

      if (! this.isActionStart()) {
        throw this.error(`Expected 5dpgn action near "${this.input.slice(this.cursor, this.cursor + 32).trim()}"`)
      }

      variations.push(this.parseVariation(multiverse, player, actionIndex))
      break
    }

    return { variations }
  }

  private parseVariation(multiverse: Multiverse, player: Player, actionIndex: number): ActionTreeVariation {
    const { action, multiverse: nextMultiverse } = this.parseAction(multiverse, player, actionIndex)
    const subtree = this.parseGameTree(nextMultiverse, Players.opponent(player), actionIndex + 1)
    return subtree.variations.length > 0
      ? { action, subtree }
      : { action }
  }

  private parseAction(
    multiverse: Multiverse,
    player: Player,
    actionIndex: number,
  ): { action: Action, multiverse: Multiverse } {
    const serial = this.parseTurnSerial()
    this.assertTurnSerial(serial, player, actionIndex)

    const moves: Move[] = []
    let nextMultiverse = multiverse

    while (true) {
      this.skipSpaceComments()
      if (
        this.isDone()
        || this.peek() === ')'
        || this.isResultStart()
        || this.isActionStart()
        || this.isVariationStart()
      ) {
        break
      }

      const token = this.readMoveToken()
      const move = resolveMoveToken(
        token,
        nextMultiverse,
        player,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moves.length,
      )
      moves.push(move)
      nextMultiverse = Multiverse.applyMove(
        move,
        player,
        nextMultiverse,
        actionIndex * GameState.MOVE_ORDER_STRIDE + moves.length - 1,
      )
    }

    if (moves.length === 0) throw this.error('Expected at least one 5dpgn move in action')
    return {
      action: { moves },
      multiverse: nextMultiverse,
    }
  }

  private parseTurnSerial(): TurnSerial {
    this.skipSpaceComments()
    if (this.peek() === '/') {
      this.cursor += 1
      return {}
    }

    const start = this.cursor
    const number = this.readNaturalNumber()
    if (number === null) throw this.error('Expected 5dpgn turn serial')

    let player: Player | undefined
    if (this.peek() === 'w' || this.peek() === 'b') {
      player = this.peek() === 'w' ? Player.W : Player.B
      this.cursor += 1
    }
    if (this.peek() !== '.') {
      this.cursor = start
      throw this.error('Expected "." after 5dpgn turn serial')
    }
    this.cursor += 1
    return { number, player: player ?? Player.W }
  }

  private assertTurnSerial(serial: TurnSerial, player: Player, actionIndex: number): void {
    const expectedTurn = Math.floor(actionIndex / 2) + 1
    if (serial.number !== undefined && serial.number !== expectedTurn) {
      throw this.error(`Unexpected 5dpgn turn number ${serial.number}; expected ${expectedTurn}`)
    }
    if (serial.player !== undefined && serial.player !== player) {
      throw this.error(`Unexpected 5dpgn player ${serial.player === Player.W ? 'w' : 'b'}`)
    }
  }

  private readMoveToken(): string {
    const start = this.cursor
    let boardDepth = 0
    while (! this.isDone()) {
      const char = this.peek()
      if (boardDepth === 0 && (/\s/.test(char) || char === '{' || char === '}')) break
      if (boardDepth === 0 && char === ')' && start !== this.cursor) break
      if (char === '(') boardDepth += 1
      else if (char === ')') boardDepth -= 1
      if (boardDepth < 0) break
      this.cursor += 1
    }

    if (start === this.cursor) throw this.error('Expected 5dpgn move')
    return this.input.slice(start, this.cursor)
  }

  private skipPrelude(): void {
    while (true) {
      this.skipSpaceComments()
      if (this.peek() !== '[') return
      const content = this.readBracketBlock()
      if (isBoardFenBlock(content)) {
        this.fenBlocks.push(parseFENBlock(content))
      }
    }
  }

  private readBracketBlock(): string {
    this.consume('[')
    const start = this.cursor
    while (! this.isDone() && this.peek() !== ']') {
      this.cursor += 1
    }
    if (this.isDone()) throw this.error('Unterminated 5dpgn bracket block')
    const content = this.input.slice(start, this.cursor)
    this.cursor += 1
    return content
  }

  private isVariationStart(): boolean {
    if (this.peek() !== '(') return false
    let cursor = this.cursor + 1
    cursor = this.skipSpaceCommentsFrom(cursor)
    return this.isActionStartAt(cursor)
  }

  private isActionStart(): boolean {
    return this.isActionStartAt(this.cursor)
  }

  private isActionStartAt(cursor: number): boolean {
    if (this.input[cursor] === '/') return true
    let index = cursor
    if (! isDigit(this.input[index])) return false
    while (isDigit(this.input[index])) index += 1
    if (this.input[index] === 'w' || this.input[index] === 'b') index += 1
    return this.input[index] === '.'
  }

  private isResultStart(): boolean {
    return RESULT_SYMBOLS.some(result => this.input.startsWith(result, this.cursor))
  }

  private consumeResult(): boolean {
    for (const result of RESULT_SYMBOLS) {
      if (this.input.startsWith(result, this.cursor)) {
        this.cursor += result.length
        return true
      }
    }
    return false
  }

  private skipSpaceComments(): void {
    this.cursor = this.skipSpaceCommentsFrom(this.cursor)
  }

  private skipSpaceCommentsFrom(start: number): number {
    let cursor = start
    while (cursor < this.input.length) {
      if (/\s/.test(this.input[cursor]!)) {
        cursor += 1
        continue
      }
      if (this.input[cursor] !== '{') break
      cursor += 1
      let depth = 1
      while (cursor < this.input.length && depth > 0) {
        if (this.input[cursor] === '{') depth += 1
        else if (this.input[cursor] === '}') depth -= 1
        cursor += 1
      }
      if (depth > 0) throw this.error('Unterminated 5dpgn comment')
    }
    return cursor
  }

  private readNaturalNumber(): number | null {
    const start = this.cursor
    while (isDigit(this.peek())) this.cursor += 1
    if (start === this.cursor) return null
    return Number(this.input.slice(start, this.cursor))
  }

  private consume(expected: string): void {
    if (this.peek() !== expected) throw this.error(`Expected "${expected}"`)
    this.cursor += 1
  }

  private peek(): string {
    return this.input[this.cursor] ?? ''
  }

  private isDone(): boolean {
    return this.cursor >= this.input.length
  }

  private error(message: string): Error {
    return new Error(message)
  }
}

const resolveMoveToken = (
  token: string,
  multiverse: Multiverse,
  player: Player,
  order: number,
): Move => {
  const pattern = parseMovePattern(token, player)
  const candidates = getLegalMoveCandidates(multiverse, player, order).filter(candidate => (
    matchesMovePattern(candidate, pattern, multiverse, player)
  ))

  if (pattern.piece === undefined) {
    const pawnCandidates = candidates.filter(candidate => isPawnPiece(candidate.piece))
    if (pawnCandidates.length === 1) return pawnCandidates[0]!.move
  }

  if (candidates.length === 1) return candidates[0]!.move
  if (candidates.length > 1) throw new Error(`Ambiguous 5dpgn move "${token}"`)
  throw new Error(`Illegal 5dpgn move "${token}"`)
}

const parseMovePattern = (rawToken: string, player: Player): MovePattern => {
  const token = stripMoveAnnotations(rawToken)
  let cursor = 0
  const sourceBoardResult = readBoardAt(token, cursor)
  const sourceBoard = sourceBoardResult?.board
  if (sourceBoardResult) cursor = sourceBoardResult.next

  if (token.startsWith('O-O-O', cursor) || token.startsWith('0-0-0', cursor)) {
    return parseCastlingPattern(sourceBoard, player, false)
  }
  if (token.startsWith('O-O', cursor) || token.startsWith('0-0', cursor)) {
    return parseCastlingPattern(sourceBoard, player, true)
  }

  let piece: string | undefined
  if (PIECE_NAMES.includes(token[cursor] ?? '')) {
    piece = token[cursor]
    cursor += 1
  }

  const body = token.slice(cursor)
  const jumpIndex = body.indexOf('>')
  const targetBoardIndex = findBoardStart(body, 0)
  const isSuperPhysical = jumpIndex >= 0 || targetBoardIndex !== null
  return isSuperPhysical
    ? parseSuperPhysicalPattern(body, sourceBoard, piece)
    : parsePhysicalPattern(body, sourceBoard, piece)
}

const parseCastlingPattern = (
  sourceBoard: BoardPattern | undefined,
  player: Player,
  kingSide: boolean,
): MovePattern => {
  const y = player === Player.W ? 7 : 0
  return {
    sourceBoard,
    piece: 'K',
    fromFile: 4,
    fromRankY: y,
    toFile: kingSide ? 6 : 2,
    toRankY: y,
    physical: true,
  }
}

const parsePhysicalPattern = (
  body: string,
  sourceBoard: BoardPattern | undefined,
  piece: string | undefined,
): MovePattern => {
  const { square, prefix } = splitTargetSquare(body)
  const source = parseSourceHint(stripTrailingCapture(prefix))
  return {
    sourceBoard,
    piece,
    ...source,
    toFile: square.x,
    toRankY: square.y,
    physical: true,
  }
}

const parseSuperPhysicalPattern = (
  body: string,
  sourceBoard: BoardPattern | undefined,
  piece: string | undefined,
): MovePattern => {
  const jumpIndex = body.indexOf('>')
  const targetBoardIndex = findBoardStart(body, 0)
  const splitIndex = jumpIndex >= 0
    ? jumpIndex
    : targetBoardIndex
  if (splitIndex === null || splitIndex < 0) {
    throw new Error(`Invalid 5dpgn jump "${body}"`)
  }

  const source = parseSourceHint(body.slice(0, splitIndex))
  let cursor = splitIndex
  let jump: '>' | '>>' | undefined
  if (body.startsWith('>>', cursor)) {
    jump = '>>'
    cursor += 2
  }
  else if (body.startsWith('>', cursor)) {
    jump = '>'
    cursor += 1
  }
  if (body[cursor] === 'x') cursor += 1

  const targetBoardResult = readBoardAt(body, cursor)
  const targetBoard = targetBoardResult?.board
  if (targetBoardResult) cursor = targetBoardResult.next

  const { square, prefix } = splitTargetSquare(body.slice(cursor))
  if (stripTrailingCapture(prefix).length > 0) {
    throw new Error(`Invalid 5dpgn jump target "${body}"`)
  }

  return {
    sourceBoard,
    targetBoard,
    piece,
    ...source,
    toFile: square.x,
    toRankY: square.y,
    jump,
    physical: false,
  }
}

const stripMoveAnnotations = (token: string): string => {
  let result = token
  let changed = true
  while (changed) {
    changed = false
    for (const symbol of EVALUATION_SYMBOLS) {
      if (result.endsWith(symbol)) {
        result = result.slice(0, -symbol.length)
        changed = true
        break
      }
    }
    if (changed) continue
    if (/[+#*~]$/.test(result)) {
      result = result.slice(0, -1)
      changed = true
    }
  }
  return result.replace(/=[A-Z]$/, '')
}

const splitTargetSquare = (body: string): { prefix: string, square: CoordSpacelike } => {
  if (body.length < 2) throw new Error(`Invalid 5dpgn move body "${body}"`)
  const file = body[body.length - 2]!
  const rank = body[body.length - 1]!
  if (! isFile(file) || ! isRank(rank)) {
    throw new Error(`Invalid 5dpgn target square "${body}"`)
  }
  return {
    prefix: body.slice(0, -2),
    square: parseSquare(file, rank),
  }
}

const parseSourceHint = (hint: string): Pick<MovePattern, 'fromFile' | 'fromRankY'> => {
  const source: Pick<MovePattern, 'fromFile' | 'fromRankY'> = {}
  for (const char of hint) {
    if (isFile(char) && source.fromFile === undefined) {
      source.fromFile = FILES.indexOf(char)
      continue
    }
    if (isRank(char) && source.fromRankY === undefined) {
      source.fromRankY = 8 - Number(char)
      continue
    }
    throw new Error(`Invalid 5dpgn source hint "${hint}"`)
  }
  return source
}

const stripTrailingCapture = (text: string): string => (
  text.endsWith('x') ? text.slice(0, -1) : text
)

const readBoardAt = (text: string, cursor: number): { board: BoardPattern, next: number } | null => {
  if (text[cursor] !== '(') return null
  const end = text.indexOf(')', cursor + 1)
  if (end < 0) throw new Error(`Unterminated 5dpgn board in "${text}"`)
  const content = text.slice(cursor + 1, end)
  return {
    board: parseBoardPattern(content),
    next: end + 1,
  }
}

const parseBoardPattern = (content: string): BoardPattern => {
  const normalized = content.startsWith('L') ? content.slice(1) : content
  if (normalized.includes('T')) {
    const [linePart, timePart] = normalized.split('T')
    if (timePart === undefined || timePart === '') throw new Error(`Invalid 5dpgn board "(${content})"`)
    return {
      ...(linePart ? { l: parseSignedInteger(linePart, content) } : {}),
      t: parseSignedInteger(timePart, content),
    }
  }
  if (normalized === '') throw new Error(`Invalid 5dpgn board "(${content})"`)
  return { l: parseSignedInteger(normalized, content) }
}

const parseSignedInteger = (value: string, context: string): number => {
  if (! /^[+-]?\d+$/.test(value)) throw new Error(`Invalid 5dpgn integer "${context}"`)
  return Number(value)
}

const findBoardStart = (text: string, start: number): number | null => {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] !== '(') continue
    readBoardAt(text, index)
    return index
  }
  return null
}

const getLegalMoveCandidates = (
  multiverse: Multiverse,
  player: Player,
  order: number,
): Array<{ move: Move, piece: Piece }> => {
  const candidates: Array<{ move: Move, piece: Piece }> = []
  for (const from of Multiverse.getMovablePieces(multiverse, player)) {
    const board = Multiverse.getBoard(multiverse, from, player)
    if (isBoardCreatedInSameAction(board, player, order)) continue
    const piece = board ? Board.getPiece(from, board) : Piece.E
    for (const to of Multiverse.getMoveTargets(multiverse, from, player)) {
      candidates.push({ move: { from, to }, piece })
    }
  }
  return candidates
}

const matchesMovePattern = (
  { move, piece }: { move: Move, piece: Piece },
  pattern: MovePattern,
  multiverse: Multiverse,
  player: Player,
): boolean => {
  if (! matchesBoardPattern(move.from, pattern.sourceBoard)) return false
  if (! matchesBoardPattern(move.to, pattern.targetBoard)) return false
  if (pattern.fromFile !== undefined && move.from.x !== pattern.fromFile) return false
  if (pattern.fromRankY !== undefined && move.from.y !== pattern.fromRankY) return false
  if (move.to.x !== pattern.toFile || move.to.y !== pattern.toRankY) return false
  if (! matchesPieceName(piece, pattern.piece)) return false

  const physical = Coord.isSameBoard(move.from, move.to)
  if (pattern.physical !== undefined && physical !== pattern.physical) return false
  if (pattern.jump !== undefined) {
    const branching = isBranchingMove(multiverse, move, player)
    if ((pattern.jump === '>>') !== branching) return false
  }
  return true
}

const matchesBoardPattern = (coord: CoordTimelike, pattern: BoardPattern | undefined): boolean => (
  ! pattern
  || (pattern.l === undefined || coord.l === pattern.l)
  && (pattern.t === undefined || coord.t === pattern.t)
)

const matchesPieceName = (piece: Piece, name: string | undefined): boolean => (
  name === undefined || getPieceName(piece) === name
)

const getPieceName = (piece: Piece): string | null => {
  switch (piece) {
    case Piece.PW:
    case Piece.PB:
      return 'P'
    case Piece.RW:
    case Piece.RB:
      return 'R'
    case Piece.NW:
    case Piece.NB:
      return 'N'
    case Piece.BW:
    case Piece.BB:
      return 'B'
    case Piece.QW:
    case Piece.QB:
      return 'Q'
    case Piece.KW:
    case Piece.KB:
      return 'K'
    default:
      return null
  }
}

const isPawnPiece = (piece: Piece): boolean => (
  piece === Piece.PW || piece === Piece.PB
)

const isBoardCreatedInSameAction = (
  board: Board | null,
  player: Player,
  order: number,
): boolean => {
  if (! board) return false
  if (board.createdByPlayer !== player) return false
  if (board.createdByOrder === null) return false
  return Math.floor(board.createdByOrder / GameState.MOVE_ORDER_STRIDE) === Math.floor(order / GameState.MOVE_ORDER_STRIDE)
}

const isBoardFenBlock = (content: string): boolean => (
  /^.+:[+-]?\d+:\d+:[wb]$/.test(content)
)

const isDigit = (char: string | undefined): boolean => (
  char !== undefined && char >= '0' && char <= '9'
)

const isFile = (char: string): boolean => FILES.includes(char)

const isRank = (char: string): boolean => char >= '1' && char <= '8'

const parseFENBlock = (content: string): FENBoardBlock => {
  const match = /^(.*):([+-]?\d+):(\d+):([wb])$/.exec(content)
  if (! match) throw new Error(`Invalid 5DFEN block "[${content}]"`)
  return {
    board: parseBoardFEN(match[1]!),
    l: Number(match[2]),
    t: Number(match[3]),
    player: match[4] === 'w' ? Player.W : Player.B,
  }
}

const createMultiverseFromFENBlocks = (blocks: FENBoardBlock[]): Multiverse => {
  if (blocks.length === 0) return Multiverse.createInitial()

  const lMin = Math.min(...blocks.map(block => block.l))
  const lMax = Math.max(...blocks.map(block => block.l))
  const lOffset = Math.max(Multiverse.LINE_OFFSET_INITIAL, -lMin)
  const lines: Line[] = []
  const blocksByLine = new Map<number, Array<{ m: number, board: Board }>>()

  for (const block of blocks) {
    const m = Coord.time(block.t, block.player)
    const lineBlocks = blocksByLine.get(block.l) ?? []
    lineBlocks.push({ m, board: block.board })
    blocksByLine.set(block.l, lineBlocks)
  }

  for (const [l, lineBlocks] of blocksByLine) {
    const boards: Board[] = []
    for (const { m, board } of lineBlocks) {
      boards[m] = board
    }
    lines[l + lOffset] = {
      boards,
      mStart: Math.min(...lineBlocks.map(block => block.m)),
    }
  }

  return {
    lines,
    lOffset,
    lFurthestB: lMin + lOffset,
    lFurthestW: lMax + lOffset,
    lastMove: null,
  }
}

const parseBoardFEN = (fen: string): Board => {
  const rows = fen.split('/')
  if (rows.length !== 8) throw new Error(`Invalid 5DFEN board "${fen}"`)

  const pieces = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => Piece.E))
  const unmoved = new Set<string>()

  for (let y = 0; y < rows.length; y += 1) {
    let x = 0
    for (let index = 0; index < rows[y]!.length; index += 1) {
      const char = rows[y]![index]!
      if (/[1-8]/.test(char)) {
        x += Number(char)
        continue
      }

      const piece = fenCharToPiece(char)
      if (piece === null) throw new Error(`Unsupported 5DFEN piece "${char}"`)
      if (x >= 8) throw new Error(`Invalid 5DFEN row "${rows[y]}"`)
      pieces[x]![y] = piece
      if (rows[y]![index + 1] === '*') {
        unmoved.add(`${x},${y}`)
        index += 1
      }
      x += 1
    }
    if (x !== 8) throw new Error(`Invalid 5DFEN row "${rows[y]}"`)
  }

  return {
    pieces,
    canCastleQW: hasUnmovedPiece(pieces, unmoved, 4, 7, Piece.KW) && hasUnmovedPiece(pieces, unmoved, 0, 7, Piece.RW),
    canCastleKW: hasUnmovedPiece(pieces, unmoved, 4, 7, Piece.KW) && hasUnmovedPiece(pieces, unmoved, 7, 7, Piece.RW),
    canCastleQB: hasUnmovedPiece(pieces, unmoved, 4, 0, Piece.KB) && hasUnmovedPiece(pieces, unmoved, 0, 0, Piece.RB),
    canCastleKB: hasUnmovedPiece(pieces, unmoved, 4, 0, Piece.KB) && hasUnmovedPiece(pieces, unmoved, 7, 0, Piece.RB),
    createdBy: null,
    createdByPlayer: null,
    createdByRole: null,
    createdByOrder: null,
  }
}

const hasUnmovedPiece = (
  pieces: Piece[][],
  unmoved: Set<string>,
  x: number,
  y: number,
  piece: Piece,
): boolean => (
  pieces[x]?.[y] === piece && unmoved.has(`${x},${y}`)
)

const formatBoardFEN = (board: Board): string => {
  const rows: string[] = []
  for (let y = 0; y < 8; y += 1) {
    let row = ''
    let empty = 0
    for (let x = 0; x < 8; x += 1) {
      const piece = Board.getPiece({ x, y }, board)
      if (piece === Piece.E) {
        empty += 1
        continue
      }

      if (empty > 0) {
        row += String(empty)
        empty = 0
      }
      row += pieceToFenChar(piece)
      if (shouldMarkUnmoved(board, piece, x, y)) row += '*'
    }
    if (empty > 0) row += String(empty)
    rows.push(row)
  }
  return rows.join('/')
}

const shouldMarkUnmoved = (board: Board, piece: Piece, x: number, y: number): boolean => {
  if (piece === Piece.KW && x === 4 && y === 7) return board.canCastleQW || board.canCastleKW
  if (piece === Piece.RW && x === 0 && y === 7) return board.canCastleQW
  if (piece === Piece.RW && x === 7 && y === 7) return board.canCastleKW
  if (piece === Piece.KB && x === 4 && y === 0) return board.canCastleQB || board.canCastleKB
  if (piece === Piece.RB && x === 0 && y === 0) return board.canCastleQB
  if (piece === Piece.RB && x === 7 && y === 0) return board.canCastleKB
  return false
}

const fenCharToPiece = (char: string): Piece | null => {
  switch (char) {
    case 'P': return Piece.PW
    case 'R': return Piece.RW
    case 'N': return Piece.NW
    case 'B': return Piece.BW
    case 'Q': return Piece.QW
    case 'K': return Piece.KW
    case 'p': return Piece.PB
    case 'r': return Piece.RB
    case 'n': return Piece.NB
    case 'b': return Piece.BB
    case 'q': return Piece.QB
    case 'k': return Piece.KB
    default: return null
  }
}

const pieceToFenChar = (piece: Piece): string => {
  switch (piece) {
    case Piece.PW: return 'P'
    case Piece.RW: return 'R'
    case Piece.NW: return 'N'
    case Piece.BW: return 'B'
    case Piece.QW: return 'Q'
    case Piece.KW: return 'K'
    case Piece.PB: return 'p'
    case Piece.RB: return 'r'
    case Piece.NB: return 'n'
    case Piece.BB: return 'b'
    case Piece.QB: return 'q'
    case Piece.KB: return 'k'
    default:
      throw new Error(`Unsupported 5DFEN piece ${piece}`)
  }
}

const formatHeaders = (options: ResolvedExportOptions): string[] => {
  const headers = new Map<string, string>()
  for (const [key, value] of Object.entries(DEFAULT_HEADER_VALUES)) {
    headers.set(key, value)
  }
  applyExportHeaders(headers, options.headers)
  headers.set('Result', options.result)

  const ordered: Array<{ key: string, value: string }> = []
  for (const key of HEADER_ORDER) {
    const value = headers.get(key)
    if (value !== undefined) ordered.push({ key, value })
    headers.delete(key)
  }
  for (const [key, value] of headers) {
    ordered.push({ key, value })
  }

  return ordered
    .filter(({ key }) => /^[A-Za-z0-9_]+$/.test(key))
    .map(({ key, value }) => `[${key} "${escapeHeaderValue(value)}"]`)
}

const applyExportHeaders = (
  output: Map<string, string>,
  headers: ExportHeaders | undefined,
): void => {
  if (! headers) return

  const entries = Array.isArray(headers)
    ? headers.map(({ key, value }) => [key, value] as const)
    : Object.entries(headers)

  for (const [key, value] of entries) {
    if (! key) continue
    if (value === null || value === undefined) {
      output.delete(key)
      continue
    }
    output.set(key, String(value))
  }
}

const escapeHeaderValue = (value: string | number): string => (
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
)

const parseSquare = (file: string, rank: string): CoordSpacelike => ({
  x: FILES.indexOf(file),
  y: 8 - Number(rank),
})

const formatMove = (
  { from, to }: Move,
  context: MoveFormatContext,
  options: ResolvedExportOptions,
): FormattedMove => {
  const fromBoard = formatBoard(from)
  const fromSquare = formatSquare(from)
  const fromText = `${fromBoard}${formatPieceSymbol(context.piece, options)}${fromSquare}`
  const promotion = options.includePromotionMarkers && context.promotion ? '=Q' : ''
  const suffix = options.includeCheckMarkers ? context.suffix : ''
  const capture = options.includeCaptureMarkers && context.capture ? 'x' : ''
  const toSquare = formatSquare(to)
  if (Coord.isSameBoard(from, to)) {
    const text = `${fromText}${capture}${toSquare}${promotion}${suffix}`
    return {
      text,
      segments: [{
        text,
        board: from,
      }],
    }
  }

  const travel = options.includeTravelMarkers
    ? context.branching ? '>>' : '>'
    : ''
  const sourceText = fromText
  const targetText = `${travel}${capture}${formatBoard(to)}${toSquare}${promotion}${suffix}`
  return {
    text: `${sourceText}${targetText}`,
    segments: [
      {
        text: sourceText,
        board: from,
      },
      {
        text: targetText,
        board: to,
      },
    ],
  }
}

const formatBoard = ({ l, t }: CoordTimelike): string => `(${l}T${t})`

const formatSquare = ({ x, y }: CoordSpacelike): string => `${FILES[x]}${8 - y}`

const formatPieceSymbol = (piece: Piece, options: ResolvedExportOptions): string => (
  options.includePieceSymbols ? PIECE_SYMBOLS[piece] ?? '' : ''
)

const resolveExportOptions = (options: ExportOptions): ResolvedExportOptions => ({
  ...DEFAULT_EXPORT_OPTIONS,
  ...options,
})

const getMovePiece = (multiverse: Multiverse, { from }: Move, player: Player): Piece => {
  const board = Multiverse.getBoard(multiverse, from, player)
  return board ? Board.getPiece(from, board) : Piece.E
}

const isCaptureMove = (
  multiverse: Multiverse,
  { from, to }: Move,
  player: Player,
  piece: Piece,
): boolean => {
  const targetBoard = Multiverse.getBoard(multiverse, to, player)
  const targetPiece = targetBoard ? Board.getPiece(to, targetBoard) : Piece.E
  if (Pieces.getPlayer(targetPiece) === Players.opponent(player)) return true

  if (! Coord.isSameBoard(from, to)) return false
  if (piece !== Piece.PW && piece !== Piece.PB) return false
  if (Math.abs(to.x - from.x) !== 1) return false

  const sourceBoard = Multiverse.getBoard(multiverse, from, player)
  if (! sourceBoard) return false
  return Pieces.getPlayer(Board.getPiece({ x: to.x, y: from.y }, sourceBoard)) === Players.opponent(player)
}

const isBranchingMove = (multiverse: Multiverse, { from, to }: Move, player: Player): boolean => {
  if (Coord.isSameBoard(from, to)) return false

  const line = Multiverse.getLine(multiverse, to.l)
  const latestM = line ? Line.getLatestBoardIndex(line) : null
  if (latestM === null) return false
  return Coord.boardIndex(to, player) < latestM
}

const isPromotionMove = (piece: Piece, to: CoordSpacelike): boolean => (
  Pieces.promotePawn(piece, to) !== piece
)

const getChecksGiven = (multiverse: Multiverse, attackingPlayer: Player): Move[] => (
  Multiverse.findChecks(
    Multiverse.createPhantom(multiverse, Players.opponent(attackingPlayer)),
    attackingPlayer,
  )
)

const getMoveKey = ({ from, to }: Move): string => (
  `${from.l}:${from.t}:${from.x}:${from.y}->${to.l}:${to.t}:${to.x}:${to.y}`
)

const getTurnSerial = (actionIndex: number): string => {
  const turn = Math.floor(actionIndex / 2) + 1
  const player = actionIndex % 2 === 0 ? 'w' : 'b'
  return `${turn}${player}.`
}
