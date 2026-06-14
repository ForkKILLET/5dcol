import { Action, Board, Player, Players as CorePlayers, Coord, FiveDPGN, GameState as CoreGameState, Line, Move, Multiverse, Piece, Pieces, type CheckmateStatus, type CoordSpacelike } from '@5dcol/core'
import { Disposable, Effect, Empty } from '@/utils'
import { Color4, CubicBezier, Mat3, Rect, Scalar, Vec2, type Camera } from '@engine/basic'
import { getBoardRenderLayers } from '@engine/board'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, LabelVisibility, RenderLayer, Sizes, Animations } from '@engine/constant'
import { Easing } from '@engine/easing'
import { isModifierKeyEvent, isSameLocatedSquare, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState, type PendingMove, type StoredGameState, type StoredRecordLine } from '@engine/gameState'
import { GameLayout, type ViewportInsets } from '@engine/layout'
import { LinePainter } from '@engine/painters/linePainter'
import { type Logger } from '@engine/logger'
import { getMoveArrowMaskFill, getMoveArrowPolygon, getStraightMoveArrowPolygon } from '@engine/moveArrow'
import { PresentPainter } from '@engine/painters/presentPainter'
import { buildGameRecordActions, type GameRecordCursor, type GameRecordRow } from '@engine/record'
import { type Renderer, RenderItemType } from '@engine/renderer'
import { PIECE_TO_TEXTURE_ID } from '@engine/texture'
import { TimelineTilesPainter } from '@engine/painters/timelineTilesPainter'
import { getMoveTravelTargetScale, getScaleToContainRects } from '@engine/viewport'
import { type LoopingSound, type SoundManager } from '@engine/sound'
import {
  getPlayerButtonColor,
  getUndoMoveButtonColor,
  isPrimaryGameToolbarButton,
  toToolbarButtonView,
  type ButtonConfig,
  type GameToolbarButton,
} from '@engine/toolbar'

export type { GameToolbarButton } from '@engine/toolbar'
export type { GameRecordAction, GameRecordCursor, GameRecordMoveSegment, GameRecordRow } from '@engine/record'

export interface GameContext {
  debug: boolean
  logger: Logger
  renderer: Renderer
  soundManager: SoundManager
  initialActions?: Action[]
  localPlayer?: Player | null
  viewPlayer?: Player
  autoSwitchViewPlayer?: boolean
  showMoveTravelAnimation?: boolean
  fiveDPGNOptions?: FiveDPGN.ExportOptions
  getFiveDPGNExportMetadata?: () => Pick<FiveDPGN.ExportOptions, 'headers' | 'result'>
  getUISoundVolume?: () => number
  getBellSoundVolume?: () => number
  canControlOnlineGame?: () => boolean
  isExternallyFinished?: () => boolean
  onToolbarChange?: (buttons: GameToolbarButton[]) => void
  onRecordChange?: (request: GameExportRequest) => void
  onStatusChange?: (status: GameStatusView) => void
  onImportRequest?: () => void
  onExportRequest?: (request: GameExportRequest) => void
  onReturnToMainMenuRequest?: (request?: GameReturnToMainMenuRequest) => void
  onActionSubmitted?: (action: Action, actions: Action[]) => void
  onPendingActionChange?: (action: Action | null) => void
  onViewPlayerChange?: (player: Player) => void
}

export interface GameReturnToMainMenuRequest {
  forfeit?: boolean
}

export type GameExportFormat = 'pgn' | 'fen'
export type GameExportMode = 'linear' | 'tree'

export interface GameExportRequest {
  text: string
  format: GameExportFormat
  mode: GameExportMode
  hasPendingMoves: boolean
  currentActionIndex: number
  actions: GameRecordRow[]
}

export interface GameStatusView {
  kind: 'turn' | 'checkmate' | 'stalemate'
  player: Player | null
  color: string
  shadowColor: string
  ended: boolean
}

interface PointerState {
  screen: Vec2
  activePointerId: number | null
  dragStartScreen: Vec2 | null
  dragLastScreen: Vec2 | null
  dragExceeded: boolean
  touchPointers: Map<number, Vec2>
  pinchLastDistance: number | null
  pinchLastScreen: Vec2 | null
}

interface BoardFrame {
  pos: Vec2
  size: Vec2
  radius: number
}
interface CameraMotion {
  id: number
  targetCenter: Vec2
  targetScale: number
  anchorScreen: Vec2
  viewportWorldCenter?: Vec2
  viewport?: Rect | null
}
interface ViewportMoveOptions {
  smooth?: boolean
  viewport?: Rect | null
  anchorScreen?: Vec2
  cancelMotion?: boolean
}
interface ViewportFocusOptions {
  smooth?: boolean
}
interface PieceSelection {
  l: number
  m: number
  player: Player
  from: Coord
  targets: Coord[]
  piece: Piece
}
interface SquareHover {
  l: number
  m: number
  coord: CoordSpacelike
}
interface BoardSquareHit {
  l: number
  m: number
  board: Board
  coord: CoordSpacelike
}
interface MoveAnimation {
  startedAt: number
  cameraCenter: Vec2
  cameraScale: number
  viewportFollowDisabled: boolean
  travelLoop: LoopingSound | null
  travelHitPlayed: boolean
}
interface BoardFocusPulse {
  l: number
  m: number
  startedAt: number
  motionId: number | null
  heldForMotion: boolean
  releaseStartedAt: number | null
}
interface BoardActivationAnimation {
  boardKeys: Set<string>
  startedAt: number
}
interface BoardRenderOptions {
  activeProgress?: number
  temporaryProgress?: number
  temporaryPreset?: ButtonColorPreset
  alpha?: number
  pos?: Vec2
  animatedLayer?: boolean
  basePlayer?: Player
}
interface MoveArrowGeometry {
  from: Vec2
  control1: Vec2
  control2: Vec2
  to: Vec2
  straight?: boolean
}
interface PendingCheck {
  move: Move
  attackingPlayer: Player
  fromBoard: { l: number, m: number }
  toBoard: { l: number, m: number }
}
interface RecordCursorTarget {
  recordLineId: number
  recordActionIndex: number
}
interface RecordLine {
  id: number
  parent: {
    lineId: number
    beforeActionIndex: number
  } | null
  actions: Action[]
  branchLineIdsBeforeAction: Map<number, number[]>
  depth: number
}
interface GameEndBackgroundAnimation {
  from: number
  to: number
  startedAt: number
}
interface ViewFlipTransition {
  from: Player
  to: Player
  startedAt: number
  applied: boolean
}
const POINTER_CLICK_THRESHOLD = 3
const PIECE_GHOST_ALPHA = 0.45

export class Game extends Disposable(Empty) {
  constructor(public readonly ctx: GameContext) {
    super()
    this.logger = ctx.logger
    this.renderer = ctx.renderer
    this.soundManager = ctx.soundManager
    this.layout = new GameLayout(ctx.renderer)
    this.presentPainter = new PresentPainter(ctx.renderer, this.layout)
    this.timelineTilesPainter = new TimelineTilesPainter(ctx.renderer, this.layout)
    this.linePainter = new LinePainter(ctx.renderer, this.layout)
    this.viewPlayer = ctx.viewPlayer ?? Player.W
    this.autoSwitchViewPlayer = ctx.autoSwitchViewPlayer ?? true
    this.showMoveTravelAnimation = ctx.showMoveTravelAnimation ?? true
    this.fiveDPGNOptions = ctx.fiveDPGNOptions ?? {}
    this.layout.setViewPlayer(this.viewPlayer)
    this.resetRecordTree([])
  }

  public readonly logger: Logger
  public readonly renderer: Renderer
  public readonly soundManager: SoundManager
  public readonly layout: GameLayout
  public readonly presentPainter: PresentPainter
  public readonly timelineTilesPainter: TimelineTilesPainter
  public readonly linePainter: LinePainter

  private initialMultiverse = Multiverse.createInitial()
  private multiverseCommitted = this.initialMultiverse
  private multiverse = this.multiverseCommitted
  private player: Player = Player.W
  private viewPlayer: Player = Player.W
  private actionIndex = 0
  private actions: Action[] = []
  private recordLines = new Map<number, RecordLine>()
  private activeRecordLineId = 0
  private nextRecordLineId = 1
  private readonly pointer: PointerState = {
    screen: [0, 0],
    activePointerId: null,
    dragStartScreen: null,
    dragLastScreen: null,
    dragExceeded: false,
    touchPointers: new Map(),
    pinchLastDistance: null,
    pinchLastScreen: null,
  }
  private cameraMotion: CameraMotion | null = null
  private selectedPiece: PieceSelection | null = null
  private hoverSquare: SquareHover | null = null
  private hoverPiece: PieceSelection | null = null
  private hoverCheckWarning: { l: number, m: number } | null = null
  private pendingMove: PendingMove | null = null
  private pendingMoves: PendingMove[] = []
  private checkWarningBoards: Array<{ l: number, m: number }> = []
  private checkWarningBoardKeys = new Set<string>()
  private pendingChecks: PendingCheck[] = []
  private pendingCheckBoardKeys = new Set<string>()
  private moveAnimation: MoveAnimation | null = null
  private remoteActionQueue: Action[] = []
  private remoteActionMoves: Move[] | null = null
  private remoteActionTargetSignature = ''
  private boardFocusPulse: BoardFocusPulse | null = null
  private boardActivationAnimation: BoardActivationAnimation | null = null
  private gameEndStatus: Exclude<CheckmateStatus, 'not-checkmate'> | null = null
  private gameEndTrial = false
  private gameEndTrialStatus: Exclude<CheckmateStatus, 'not-checkmate'> | null = null
  private gameEndBackgroundTarget = false
  private gameEndBackgroundStatus: Exclude<CheckmateStatus, 'not-checkmate'> = 'checkmate'
  private gameEndBackgroundAnimation: GameEndBackgroundAnimation | null = null
  private viewFlipTransition: ViewFlipTransition | null = null
  private submitRequestedDuringMoveAnimation = false
  private toolbarSignature = ''
  private recordSignature = ''
  private statusSignature = ''
  private gameInputDisabled = false
  private cameraMotionId = 0
  private autoSwitchViewPlayer = true
  private showMoveTravelAnimation = true
  private fiveDPGNOptions: FiveDPGN.ExportOptions = {}

  private animationFrame: number | null = null
  private resizeDirty = false
  private gameDisposed = false
  private canvasCursor = ''

  public start() {
    const restored = this.ctx.initialActions
      ? this.restoreInitialActions(this.ctx.initialActions)
      : this.restoreGameState()
    this.renderer.start()
    if (restored) this.focusCurrentPresent({ smooth: false })
    else this.focusInitialTurn({ smooth: false })
    this.bindEvents()
    this.updateGameEndState()
    this.syncAutomaticViewPlayer()
    this.syncCheckState()
    this.syncToolbarButtons()
    this.syncRecord()
    this.syncStatus()
    this.animationFrame = requestAnimationFrame(this.loop)
    this.collect(() => {
      if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    })
    this.logger.info('Game started')
  }

  public dispose() {
    this.gameDisposed = true
    this.clearMoveAnimation()
    this.setCanvasCursor('')
    super.dispose()
  }

  public setGameInputDisabled(disabled: boolean) {
    if (this.gameInputDisabled === disabled) return

    this.gameInputDisabled = disabled
    if (! disabled) return

    this.hoverSquare = null
    this.hoverPiece = null
    this.hoverCheckWarning = null
    this.finishPointerGesture()
    this.syncCanvasCursor()
  }

  public setViewPlayer(
    player: Player,
    { playSound = false, transition = true }: { playSound?: boolean, transition?: boolean } = {},
  ) {
    if (this.viewPlayer === player) {
      if (this.viewFlipTransition?.to !== player) this.viewFlipTransition = null
      return
    }

    if (playSound) this.playUISound()

    if (! transition) {
      this.applyViewPlayer(player)
      this.viewFlipTransition = null
      return
    }

    this.viewFlipTransition = {
      from: this.viewPlayer,
      to: player,
      startedAt: performance.now(),
      applied: false,
    }
    if (this.viewFlipTransition.from === player) {
      this.viewFlipTransition = null
    }
  }

  public toggleViewPlayer() {
    this.setViewPlayer(CorePlayers.opponent(this.viewPlayer), { playSound: true })
  }

  public setAutoSwitchViewPlayer(enabled: boolean) {
    this.autoSwitchViewPlayer = enabled
    this.syncAutomaticViewPlayer()
  }

  public setShowMoveTravelAnimation(enabled: boolean) {
    this.showMoveTravelAnimation = enabled
    if (! enabled && this.moveAnimation) this.stopMoveTravelLoop(this.moveAnimation)
  }

  public setFiveDPGNOptions(options: FiveDPGN.ExportOptions) {
    this.fiveDPGNOptions = { ...options }
    this.recordSignature = ''
    this.syncRecord()
  }

  public deleteRecordFutureAtCursor(cursor: GameRecordCursor): boolean {
    if (this.isOnlineGame()) return false
    if (this.isMoveAnimating() || this.pendingMoves.length > 0) return false
    const target = this.resolveRecordCursorTarget(cursor)
    if (! target) return false
    if (! this.hasRecordFutureAt(target.recordLineId, target.recordActionIndex)) return false

    this.deleteActiveEmptyRecordLineIfLeaving(target.recordLineId)
    this.deleteRecordFuture(target.recordLineId, target.recordActionIndex)
    const actions = this.getRecordLineFullActions(target.recordLineId)
    const targetActionIndex = this.getRecordLinePrefixActions(target.recordLineId).length
      + target.recordActionIndex
    this.activeRecordLineId = target.recordLineId
    this.applyRecordActionPath(actions, targetActionIndex)
    return true
  }

  public rollbackToRecordCursor(cursor: GameRecordCursor): boolean {
    const target = this.resolveRecordCursorTarget(cursor)
    if (! target) return false

    return this.rollbackToRecordCursorTarget(target)
  }

  public cycleRecordCursorVariation(): boolean {
    if (this.isOnlineGame()) return false
    if (this.pendingMoves.length > 0) return false

    const target = this.getNextRecordVariationCursorTarget()
    if (! target) return false

    return this.rollbackToRecordCursorTarget(target)
  }

  private rollbackToRecordCursorTarget(target: RecordCursorTarget): boolean {
    this.deleteActiveEmptyRecordLineIfLeaving(target.recordLineId)

    const actions = this.getRecordLineFullActions(target.recordLineId)
    const targetActionIndex = this.getRecordLinePrefixActions(target.recordLineId).length
      + target.recordActionIndex
    this.activeRecordLineId = target.recordLineId
    this.applyRecordActionPath(actions, targetActionIndex)
    return true
  }

  public setRemotePendingMoves(moves: Move[], { animate = true }: { animate?: boolean } = {}) {
    if (this.canControlTurn()) return
    if (Move.isSameList(moves, this.getPendingMoves())) return

    if (
      animate
      && moves.length === this.pendingMoves.length + 1
      && Move.isSameList(moves.slice(0, -1), this.getPendingMoves())
    ) {
      this.createAnimatedPendingMove(moves.at(-1)!, { playSound: true, persist: false, notify: false })
      return
    }

    const { pendingMoves, multiverse } = this.createPendingMoves(moves)
    this.pendingMoves = pendingMoves
    this.pendingMove = pendingMoves.at(-1) ?? null
    this.multiverse = multiverse
    this.gameEndStatus = null
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.syncCheckState()
    this.syncToolbarButtons()
  }

  public isCurrentPendingActionCommitted(actions: Action[]): boolean {
    if (actions.length !== this.actions.length + 1) return false
    const pendingMoves = this.getPendingMoves()
    if (pendingMoves.length === 0) return false
    return Move.isSameList(actions.at(-1)?.moves ?? [], pendingMoves)
  }

  public hasActionPrefix(actions: Action[]): boolean {
    return isActionPrefix(actions, this.actions)
  }

  public clearRemotePendingMoves() {
    if (this.canControlTurn()) return
    if (this.pendingMoves.length === 0) return
    this.pendingMoves = []
    this.pendingMove = null
    this.multiverse = this.multiverseCommitted
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.syncCheckState()
    this.syncToolbarButtons()
  }

  private applyViewPlayer(player: Player) {
    if (this.viewPlayer === player) return

    const shouldMirrorCameraY = this.layout.getDisplayLine(1) !== (
      player === Player.W ? 1 : -1
    )
    if (shouldMirrorCameraY) {
      const camera = this.renderer.getCamera()
      this.renderer.setCamera({
        center: [camera.center[0], -camera.center[1]],
      })
    }
    this.viewPlayer = player
    this.layout.setViewPlayer(player)
    this.ctx.onViewPlayerChange?.(player)
    this.cameraMotion = null
    this.updateCameraBounds()
  }

  public setViewportInsets(insets: Partial<ViewportInsets>) {
    const camera = this.renderer.getCamera()
    const viewportWorldCenter = this.layout.getViewportWorldCenter(camera.center, camera.scale)
    this.layout.setViewportInsets(insets)
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(viewportWorldCenter, camera.scale),
    }, {
      anchorScreen: this.getViewportCenterScreen(),
    })
  }

  public loadActions(
    actions: Action[],
    { focus = true, force = false, animate = false }: { focus?: boolean, force?: boolean, animate?: boolean } = {},
  ) {
    if (! force && this.pendingMoves.length > 0 && actions.length <= this.actions.length) return
    if (JSON.stringify(actions) === JSON.stringify(this.actions)) {
      this.syncToolbarButtons()
      this.syncStatus()
      return
    }
    if (animate && ! force && this.tryStartRemoteActionPlayback(actions)) return

    const previousPlayer = this.player
    const previousActionIndex = this.actionIndex
    this.loadCoreGameState(CoreGameState.create(actions, [], this.initialMultiverse), { focus })
    this.playLocalTurnStartSoundAfterLoadedAction(previousPlayer, previousActionIndex)
    this.syncToolbarButtons()
    this.syncRecord()
    this.syncStatus()
  }

  private restoreInitialActions(actions: Action[]): boolean {
    this.loadCoreGameState(CoreGameState.create(actions), { focus: false })
    return actions.length > 0
  }

  private restoreGameState(): boolean {
    const storage = getLocalStorage()
    if (! storage) return false

    try {
      const raw = storage.getItem(GAME_STORAGE_KEY)
      if (! raw) return false

      const state = JSON.parse(raw) as Partial<StoredGameState>
      if (! isStoredGameState(state)) {
        this.clearStoredGameState()
        return false
      }

      const actions = state.actions ?? CoreGameState.extractActions(state.multiverseCommitted)
      const initialMultiverse = state.initialMultiverse
        ?? (actions.length === 0 ? state.multiverseCommitted : Multiverse.createInitial())
      const actionIndex = Scalar.clamp(Math.floor(state.actionIndex), 0, actions.length)
      const pendingMoveMoves = state.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move)
      const coreState = CoreGameState.create(actions.slice(0, actionIndex), pendingMoveMoves, initialMultiverse)

      this.initialMultiverse = coreState.initialMultiverse
      this.multiverseCommitted = coreState.multiverseCommitted
      this.player = coreState.player
      this.actionIndex = coreState.actionIndex
      this.actions = actions
      if (! this.restoreRecordTree(state, actions)) this.resetRecordTree(actions)
      this.fillMissingMoveOrders(this.multiverseCommitted, this.getCommittedMoveOrderBase())
      const preview = this.createPendingMoves(pendingMoveMoves)
      this.pendingMoves = preview.pendingMoves
      this.multiverse = preview.multiverse
      this.pendingMove = this.pendingMoves.at(-1) ?? null
      this.clearMoveAnimation()
      this.submitRequestedDuringMoveAnimation = false
      this.deselectPiece()
      this.syncAutomaticViewPlayer()
      this.syncCheckState()
      return true
    }
    catch {
      this.clearStoredGameState()
      return false
    }
  }

  private persistGameState() {
    if (this.isOnlineGame()) {
      this.syncRecord()
      this.syncStatus()
      return
    }

    const storage = getLocalStorage()

    const state: StoredGameState = {
      version: 1,
      initialMultiverse: this.initialMultiverse,
      actions: this.actions,
      recordLines: this.serializeRecordLines(),
      activeRecordLineId: this.activeRecordLineId,
      nextRecordLineId: this.nextRecordLineId,
      multiverseCommitted: this.multiverseCommitted,
      multiverse: this.multiverse,
      player: this.player,
      actionIndex: this.actionIndex,
      pendingMoves: this.pendingMoves.filter(pendingMove => ! pendingMove.isPass),
    }

    if (storage) {
      try {
        storage.setItem(GAME_STORAGE_KEY, JSON.stringify(state))
      }
      catch {
        this.logger.error('Failed to save game state')
      }
    }
    this.syncRecord()
    this.syncStatus()
  }

  private resetRecordTree(actions: Action[]) {
    this.recordLines.clear()
    this.nextRecordLineId = 1
    this.activeRecordLineId = 0
    this.recordLines.set(0, {
      id: 0,
      parent: null,
      actions: [...actions],
      branchLineIdsBeforeAction: new Map(),
      depth: 0,
    })
  }

  private restoreRecordTree(state: Partial<StoredGameState>, fallbackActions: Action[]): boolean {
    if (! state.recordLines || state.recordLines.length === 0) return false

    const lines = new Map<number, RecordLine>()
    for (const stored of state.recordLines) {
      if (! this.isStoredRecordLine(stored)) return false
      lines.set(stored.id, {
        id: stored.id,
        parent: stored.parent,
        actions: [...stored.actions],
        branchLineIdsBeforeAction: new Map(stored.branchLineIdsBeforeAction),
        depth: stored.depth,
      })
    }
    if (! lines.has(0)) return false

    const activeRecordLineId = state.activeRecordLineId ?? 0
    if (! lines.has(activeRecordLineId)) return false

    this.recordLines = lines
    this.activeRecordLineId = activeRecordLineId
    this.nextRecordLineId = Math.max(
      state.nextRecordLineId ?? 1,
      ...[...lines.keys()].map(id => id + 1),
    )

    if (! isActionPrefix(fallbackActions, this.getRecordLineFullActions(this.activeRecordLineId))) {
      this.resetRecordTree(fallbackActions)
      return false
    }
    return true
  }

  private isStoredRecordLine(line: unknown): line is StoredRecordLine {
    if (! line || typeof line !== 'object') return false
    const value = line as Partial<StoredRecordLine>
    return typeof value.id === 'number'
      && (value.parent === null || (
        typeof value.parent === 'object'
        && typeof value.parent.lineId === 'number'
        && typeof value.parent.beforeActionIndex === 'number'
      ))
      && Array.isArray(value.actions)
      && Array.isArray(value.branchLineIdsBeforeAction)
      && value.branchLineIdsBeforeAction.every(entry => (
        Array.isArray(entry)
        && typeof entry[0] === 'number'
        && Array.isArray(entry[1])
        && entry[1].every(id => typeof id === 'number')
      ))
      && typeof value.depth === 'number'
  }

  private serializeRecordLines(): StoredRecordLine[] {
    return [...this.recordLines.values()].map(line => ({
      id: line.id,
      parent: line.parent,
      actions: line.actions,
      branchLineIdsBeforeAction: [...line.branchLineIdsBeforeAction.entries()],
      depth: line.depth,
    }))
  }

  private createRecordLine({
    parent,
    actions,
    depth,
  }: {
    parent: RecordLine['parent']
    actions: Action[]
    depth: number
  }): RecordLine {
    const line: RecordLine = {
      id: this.nextRecordLineId++,
      parent,
      actions: [...actions],
      branchLineIdsBeforeAction: new Map(),
      depth,
    }
    this.recordLines.set(line.id, line)
    return line
  }

  private getActiveRecordLine(): RecordLine {
    return this.recordLines.get(this.activeRecordLineId) ?? this.recordLines.get(0)!
  }

  private getRecordLinePrefixActions(lineId: number): Action[] {
    const line = this.recordLines.get(lineId)
    if (! line?.parent) return []

    const parent = this.recordLines.get(line.parent.lineId)
    if (! parent) return []

    return [
      ...this.getRecordLinePrefixActions(parent.id),
      ...parent.actions.slice(0, line.parent.beforeActionIndex),
    ]
  }

  private getRecordLineFullActions(lineId: number): Action[] {
    const line = this.recordLines.get(lineId)
    if (! line) return []

    return [
      ...this.getRecordLinePrefixActions(lineId),
      ...line.actions,
    ]
  }

  private getActiveRecordLineLocalActionIndex(): number {
    const prefixLength = this.getRecordLinePrefixActions(this.activeRecordLineId).length
    return Scalar.clamp(
      this.actionIndex - prefixLength,
      0,
      this.getActiveRecordLine().actions.length,
    )
  }

  private resolveRecordCursorTarget(cursor: GameRecordCursor): RecordCursorTarget | null {
    const line = this.recordLines.get(cursor.recordLineId)
    if (! line) return null

    if (line.parent && this.isEmptyRecordLineTree(line.id)) {
      return {
        recordLineId: line.parent.lineId,
        recordActionIndex: line.parent.beforeActionIndex,
      }
    }

    return {
      recordLineId: line.id,
      recordActionIndex: Scalar.clamp(
        Math.floor(cursor.recordActionIndex),
        0,
        line.actions.length,
      ),
    }
  }

  private getNextRecordVariationCursorTarget(): RecordCursorTarget | null {
    const line = this.getActiveRecordLine()
    const actionIndex = this.getActiveRecordLineLocalActionIndex()
    const current = {
      recordLineId: line.id,
      recordActionIndex: actionIndex,
    }

    if (line.parent && actionIndex === 0) {
      return this.getNextRecordVariationTarget(
        this.getRecordVariationTargets(line.parent.lineId, line.parent.beforeActionIndex),
        current,
      )
    }

    return this.getNextRecordVariationTarget(
      this.getRecordVariationTargets(line.id, actionIndex),
      current,
    )
  }

  private getRecordVariationTargets(lineId: number, actionIndex: number): RecordCursorTarget[] {
    const line = this.recordLines.get(lineId)
    if (! line) return []

    const localActionIndex = Scalar.clamp(
      Math.floor(actionIndex),
      0,
      line.actions.length,
    )
    const targets = (line.branchLineIdsBeforeAction.get(localActionIndex) ?? [])
      .filter(branchId => this.recordLines.has(branchId))
      .map(branchId => ({
        recordLineId: branchId,
        recordActionIndex: 0,
      }))

    if (localActionIndex < line.actions.length) {
      targets.push({
        recordLineId: line.id,
        recordActionIndex: localActionIndex,
      })
    }

    return targets
  }

  private getNextRecordVariationTarget(
    targets: RecordCursorTarget[],
    current: RecordCursorTarget,
  ): RecordCursorTarget | null {
    if (targets.length === 0) return null

    const currentIndex = targets.findIndex(target => this.isSameRecordCursorTarget(target, current))
    const target = targets[currentIndex >= 0 ? (currentIndex + 1) % targets.length : 0]!
    return this.isSameRecordCursorTarget(target, current) ? null : target
  }

  private isSameRecordCursorTarget(a: RecordCursorTarget, b: RecordCursorTarget): boolean {
    return a.recordLineId === b.recordLineId
      && a.recordActionIndex === b.recordActionIndex
  }

  private deleteActiveEmptyRecordLineIfLeaving(nextRecordLineId: number) {
    if (this.activeRecordLineId === nextRecordLineId) return
    this.deleteEmptyRecordLineTree(this.activeRecordLineId)
  }

  private deleteEmptyRecordLineTree(lineId: number): boolean {
    if (lineId === 0 || ! this.isEmptyRecordLineTree(lineId)) return false
    this.deleteRecordLineTree(lineId)
    if (this.activeRecordLineId === lineId) this.activeRecordLineId = 0
    return true
  }

  private isEmptyRecordLineTree(lineId: number): boolean {
    const line = this.recordLines.get(lineId)
    if (! line || line.actions.length > 0) return false
    return this.getRecordLineChildIds(line).every(childId => this.isEmptyRecordLineTree(childId))
  }

  private deleteRecordLineTree(lineId: number) {
    const line = this.recordLines.get(lineId)
    if (! line) return

    for (const childId of this.getRecordLineChildIds(line)) {
      this.deleteRecordLineTree(childId)
    }

    if (line.parent) {
      const parent = this.recordLines.get(line.parent.lineId)
      const branchIds = parent?.branchLineIdsBeforeAction.get(line.parent.beforeActionIndex)
      if (branchIds) {
        const nextBranchIds = branchIds.filter(id => id !== line.id)
        if (nextBranchIds.length > 0) {
          parent!.branchLineIdsBeforeAction.set(line.parent.beforeActionIndex, nextBranchIds)
        }
        else {
          parent!.branchLineIdsBeforeAction.delete(line.parent.beforeActionIndex)
        }
      }
    }

    this.recordLines.delete(lineId)
  }

  private getRecordLineChildIds(line: RecordLine): number[] {
    return [...line.branchLineIdsBeforeAction.values()].flat()
  }

  private appendActionToActiveRecordLine(action: Action) {
    const line = this.getActiveRecordLine()
    const localActionIndex = this.getActiveRecordLineLocalActionIndex()
    const nextAction = line.actions[localActionIndex]
    if (nextAction && Action.isSame(nextAction, action)) {
      this.actions = this.getRecordLineFullActions(line.id)
      return
    }

    const branchIds = line.branchLineIdsBeforeAction.get(localActionIndex) ?? []
    const matchingBranchId = branchIds.find((branchId) => {
      const branchLine = this.recordLines.get(branchId)
      const branchAction = branchLine?.actions[0]
      return branchAction ? Action.isSame(branchAction, action) : false
    })
    if (matchingBranchId !== undefined) {
      this.activeRecordLineId = matchingBranchId
      this.actions = this.getRecordLineFullActions(matchingBranchId)
      return
    }

    if (localActionIndex < line.actions.length || branchIds.length > 0) {
      const branchLine = this.createRecordLine({
        parent: {
          lineId: line.id,
          beforeActionIndex: localActionIndex,
        },
        actions: [action],
        depth: line.depth + 1,
      })
      branchIds.push(branchLine.id)
      line.branchLineIdsBeforeAction.set(localActionIndex, branchIds)
      this.activeRecordLineId = branchLine.id
      this.actions = this.getRecordLineFullActions(branchLine.id)
      return
    }

    line.actions.push(action)
    this.actions = this.getRecordLineFullActions(line.id)
  }

  private hasRecordFutureAt(lineId: number, actionIndex: number): boolean {
    const line = this.recordLines.get(lineId)
    if (! line) return false
    return actionIndex < line.actions.length
      || [...line.branchLineIdsBeforeAction.keys()].some(key => key >= actionIndex)
  }

  private deleteRecordFuture(lineId: number, actionIndex: number) {
    const line = this.recordLines.get(lineId)
    if (! line) return

    line.actions = line.actions.slice(0, actionIndex)
    for (const key of [...line.branchLineIdsBeforeAction.keys()]) {
      if (key < actionIndex) continue
      const branchIds = line.branchLineIdsBeforeAction.get(key) ?? []
      for (const branchId of branchIds) {
        this.deleteRecordLineTree(branchId)
      }
      line.branchLineIdsBeforeAction.delete(key)
    }
  }

  private applyRecordActionPath(actions: Action[], actionIndex: number) {
    const targetActionIndex = Scalar.clamp(Math.floor(actionIndex), 0, actions.length)
    const state = CoreGameState.create(actions.slice(0, targetActionIndex), [], this.initialMultiverse)
    this.initialMultiverse = state.initialMultiverse
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.actions = actions
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    this.persistGameState()
    this.focusCurrentPresent()
    this.syncToolbarButtons()
  }

  private isOnlineGame(): boolean {
    return this.ctx.localPlayer !== undefined
  }

  private canControlTurn(): boolean {
    if (this.isExternallyFinished()) return true

    return (this.ctx.canControlOnlineGame?.() ?? true)
      && (
        this.ctx.localPlayer === undefined
        || this.ctx.localPlayer === null
        || this.ctx.localPlayer === this.player
      )
  }

  private clearStoredGameState() {
    const storage = getLocalStorage()
    if (! storage) return

    try {
      storage.removeItem(GAME_STORAGE_KEY)
    }
    catch {} // Ignore storage cleanup failures; gameplay state should still reset in memory.
  }

  private bindEvents() {
    this.collect(Effect.useListener(window, 'resize', () => {
      this.resizeDirty = true
    }))
    const visualViewport = window.visualViewport
    if (visualViewport) {
      const handleVisualViewportResize = () => {
        this.resizeDirty = true
      }
      visualViewport.addEventListener('resize', handleVisualViewportResize)
      this.collect(() => visualViewport.removeEventListener('resize', handleVisualViewportResize))
    }

    this.collect(Effect.useListener(window, 'pointermove', e => {
      this.handlePointerMove(e)
    }, { passive: false }))

    this.collect(Effect.useListener(window, 'pointerdown', e => {
      this.handlePointerDown(e)
    }, { passive: false }))

    this.collect(Effect.useListener(window, 'pointerup', e => {
      this.handlePointerUp(e)
    }, { passive: false }))

    this.collect(Effect.useListener(window, 'pointercancel', e => {
      this.handlePointerCancel(e)
    }))

    this.collect(Effect.useListener(window, 'mouseleave', () => {
      this.finishPointerGesture()
    }))

    this.collect(Effect.useListener(window, 'blur', () => {
      this.finishPointerGesture()
    }))

    this.collect(Effect.useListener(window, 'contextmenu', e => {
      if (this.gameInputDisabled) return
      e.preventDefault()
      if (! this.isMoveAnimating()) this.cancelPieceSelection()
      this.finishPointerGesture()
    }))

    this.collect(Effect.useListener(window, 'keydown', e => {
      this.handleKeyDown(e)
    }))

    this.collect(Effect.useListener(window, 'wheel', e => {
      if (this.gameInputDisabled) return
      e.preventDefault()
      this.zoomCameraByStep(- Math.sign(e.deltaY) * CameraControl.WheelZoomStep)
    }, { passive: false }))
  }

  private getPointerScreen(e: PointerEvent): Vec2 {
    return [e.clientX, e.clientY]
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.gameInputDisabled) return
    if (! e.isPrimary && e.pointerType !== 'touch') return
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen

    if (e.pointerType === 'touch') {
      e.preventDefault()
      this.pointer.touchPointers.set(e.pointerId, screen)
      if (this.pointer.touchPointers.size >= 2) {
        this.startPinchGesture()
        return
      }
    }
    else if (this.pointer.activePointerId !== null) {
      return
    }

    this.pointer.activePointerId = e.pointerId
    this.pointer.dragStartScreen = screen
    this.pointer.dragLastScreen = screen
    this.pointer.dragExceeded = false
  }

  private handlePointerMove(e: PointerEvent) {
    if (this.gameInputDisabled) return

    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen

    if (e.pointerType === 'touch') {
      e.preventDefault()
      if (! this.pointer.touchPointers.has(e.pointerId)) return
      this.pointer.touchPointers.set(e.pointerId, screen)
      if (this.pointer.touchPointers.size >= 2) {
        this.updatePinchGesture()
        return
      }
    }

    if (this.pointer.activePointerId !== null && this.pointer.activePointerId !== e.pointerId) return
    this.updatePointerDragExceeded(screen)
    this.panByPointerDrag(screen)
  }

  private handlePointerUp(e: PointerEvent) {
    if (this.gameInputDisabled) {
      this.finishPointerGesture()
      return
    }

    if (e.pointerType === 'touch') {
      e.preventDefault()
      this.pointer.touchPointers.delete(e.pointerId)
      if (this.pointer.pinchLastDistance !== null) {
        this.restartDragAfterPinch()
        return
      }
    }

    if (this.pointer.activePointerId !== e.pointerId) return
    const screen = this.getPointerScreen(e)
    this.pointer.screen = screen
    if (! this.pointer.dragExceeded) this.handleBoardClick(screen)
    this.finishPointerGesture()
  }

  private handlePointerCancel(e: PointerEvent) {
    if (e.pointerType === 'touch') this.pointer.touchPointers.delete(e.pointerId)
    if (this.pointer.activePointerId === e.pointerId || this.pointer.pinchLastDistance !== null) {
      this.finishPointerGesture()
    }
  }

  private startPinchGesture() {
    const points = [...this.pointer.touchPointers.values()]
    if (points.length < 2) return

    this.pointer.pinchLastDistance = Math.max(1, Vec2.length(Vec2.sub(points[0]!, points[1]!)))
    this.pointer.pinchLastScreen = Vec2.scale(Vec2.add(points[0]!, points[1]!), 0.5)
    this.pointer.dragStartScreen = null
    this.pointer.dragLastScreen = null
    this.pointer.dragExceeded = true
    this.cameraMotion = null
  }

  private updatePinchGesture() {
    const points = [...this.pointer.touchPointers.values()]
    if (points.length < 2 || this.pointer.pinchLastDistance === null || ! this.pointer.pinchLastScreen) return

    const distance = Math.max(1, Vec2.length(Vec2.sub(points[0]!, points[1]!)))
    const screen = Vec2.scale(Vec2.add(points[0]!, points[1]!), 0.5)
    this.pointer.screen = screen
    this.panViewportByScreenDelta(this.pointer.pinchLastScreen, screen)

    const camera = this.renderer.getCamera()
    this.setCameraScaleAt(screen, Scalar.clamp(
      camera.scale * (distance / this.pointer.pinchLastDistance),
      CameraControl.ZoomMin,
      CameraControl.ZoomMax,
    ))

    this.pointer.pinchLastDistance = distance
    this.pointer.pinchLastScreen = screen
    this.syncCameraMotion()
  }

  private restartDragAfterPinch() {
    this.pointer.pinchLastDistance = null
    this.pointer.pinchLastScreen = null
    const remaining = [...this.pointer.touchPointers.entries()][0]
    if (! remaining) {
      this.finishPointerGesture()
      return
    }

    const [pointerId, screen] = remaining
    this.pointer.activePointerId = pointerId
    this.pointer.dragStartScreen = screen
    this.pointer.dragLastScreen = screen
    this.pointer.dragExceeded = true
  }

  private panByPointerDrag(screen: Vec2) {
    const lastScreen = this.pointer.dragLastScreen
    if (! lastScreen) return

    this.panViewportByScreenDelta(lastScreen, screen)
    this.pointer.dragLastScreen = screen
  }

  private panViewportByScreenDelta(lastScreen: Vec2, screen: Vec2) {
    this.disableMoveAnimationViewportFollow()
    const worldLast = this.renderer.screenToWorld(lastScreen)
    const worldCurrent = this.renderer.screenToWorld(screen)
    const delta = Vec2.sub(worldCurrent, worldLast)
    const camera = this.renderer.getCamera()

    this.setViewportImmediate({
      center: Vec2.sub(camera.center, delta),
    }, {
      viewport: null,
      cancelMotion: true,
    })
  }

  private updatePointerDragExceeded(screen: Vec2) {
    const start = this.pointer.dragStartScreen
    if (! start) return
    if (Vec2.length(Vec2.sub(screen, start)) > POINTER_CLICK_THRESHOLD) {
      this.pointer.dragExceeded = true
    }
  }

  private clearPointerDrag() {
    this.pointer.activePointerId = null
    this.pointer.dragStartScreen = null
    this.pointer.dragLastScreen = null
    this.pointer.dragExceeded = false
    this.pointer.touchPointers.clear()
    this.pointer.pinchLastDistance = null
    this.pointer.pinchLastScreen = null
  }

  private finishPointerGesture() {
    this.clearPointerDrag()
    this.updateCameraBounds()
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.gameInputDisabled || e.repeat || isModifierKeyEvent(e) || isTextInputEvent(e)) return

    switch (e.key) {
      case 'z':
      case 'Backspace':
        e.preventDefault()
        this.undoMove()
        break
      case 'f':
      case 'Enter':
        e.preventDefault()
        this.submitMoves()
        break
      case 'w':
      case 'ArrowUp':
        e.preventDefault()
        this.panCameraByKeyboard([0, -1])
        break
      case 'a':
      case 'ArrowLeft':
        e.preventDefault()
        this.panCameraByKeyboard([-1, 0])
        break
      case 's':
      case 'ArrowDown':
        e.preventDefault()
        this.panCameraByKeyboard([0, 1])
        break
      case 'd':
      case 'ArrowRight':
        e.preventDefault()
        this.panCameraByKeyboard([1, 0])
        break
      case 'q':
        e.preventDefault()
        this.zoomCameraByStep(- CameraControl.KeyboardZoomStep)
        break
      case 'e':
        e.preventDefault()
        this.zoomCameraByStep(CameraControl.KeyboardZoomStep)
        break
      case 'u':
      case 'U':
        e.preventDefault()
        this.toggleViewPlayer()
        break
    }
  }

  private panCameraByKeyboard(direction: Vec2) {
    this.disableMoveAnimationViewportFollow()
    const camera = this.renderer.getCamera()
    const step = CameraControl.KeyboardPanStep / camera.scale
    const targetCenter = this.cameraMotion?.targetCenter ?? camera.center
    this.moveViewportTo({
      targetCenter: this.clampCameraCenterToValidViewportIfAvailable(
        Vec2.add(targetCenter, Vec2.scale(direction, step)),
      ),
    })
  }

  private zoomCameraByStep(step: number) {
    this.disableMoveAnimationViewportFollow()
    const camera = this.renderer.getCamera()
    const targetCenter = this.cameraMotion?.targetCenter ?? camera.center
    const targetScale = this.cameraMotion?.targetScale ?? camera.scale
    const nextScale = Scalar.clamp(
      targetScale + step,
      CameraControl.ZoomMin,
      CameraControl.ZoomMax,
    )
    const viewportWorldCenter = this.layout.getViewportWorldCenter(targetCenter, targetScale)
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(viewportWorldCenter, nextScale),
      targetScale: nextScale,
      viewportWorldCenter,
    }, {
      anchorScreen: this.getViewportCenterScreen(),
    })
  }

  private setCameraMotion(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}): CameraMotion {
    const camera = this.renderer.getCamera()
    this.cameraMotion = {
      id: ++ this.cameraMotionId,
      targetCenter: motion.targetCenter ?? this.cameraMotion?.targetCenter ?? camera.center,
      targetScale: motion.targetScale ?? this.cameraMotion?.targetScale ?? camera.scale,
      anchorScreen: options.anchorScreen ?? motion.anchorScreen ?? this.cameraMotion?.anchorScreen ?? this.getViewportCenterScreen(),
      viewportWorldCenter: motion.viewportWorldCenter,
      viewport: options.viewport,
    }
    return this.cameraMotion
  }

  private moveViewportTo(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}): CameraMotion | null {
    if (options.smooth === false) {
      this.setViewportImmediate({
        center: motion.targetCenter,
        scale: motion.targetScale,
      }, { ...options, cancelMotion: true })
      return null
    }

    return this.setCameraMotion(motion, options)
  }

  private setViewportImmediate(camera: Partial<Camera>, options: ViewportMoveOptions = {}) {
    if (options.cancelMotion) this.cameraMotion = null

    if (camera.scale !== undefined) {
      this.renderer.setCamera({
        scale: Scalar.clamp(camera.scale, CameraControl.ZoomMin, CameraControl.ZoomMax),
      })
    }

    const viewport = options.viewport === undefined
      ? this.layout.getValidViewportRect(this.multiverse)
      : options.viewport
    const targetCenter = camera.center ?? this.renderer.getCamera().center
    this.renderer.setCamera({
      center: viewport ? this.layout.clampCameraCenterToViewport(targetCenter, viewport) : targetCenter,
    })
    this.syncCameraMotion()
  }

  private disableMoveAnimationViewportFollow() {
    if (this.moveAnimation && this.isMoveAnimating()) {
      this.moveAnimation.viewportFollowDisabled = true
    }
  }

  public focusTurn(l: number, m: number, options: ViewportFocusOptions = {}) {
    this.focusRect(this.layout.getTurnRect(l, m), options)
  }

  public focusBoard(l: number, m: number, options: ViewportFocusOptions = {}) {
    const motion = this.focusRect(this.layout.getBoardRect(l, m), options)
    this.boardFocusPulse = {
      l,
      m,
      startedAt: performance.now(),
      motionId: motion?.id ?? null,
      heldForMotion: false,
      releaseStartedAt: null,
    }
  }

  private focusInitialTurn(options: ViewportFocusOptions = {}) {
    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue
      this.focusTurn(l, line.mStart, options)
      return
    }
  }

  private focusCurrentPresent(options: ViewportFocusOptions = {}) {
    const present = Multiverse.getPresent(this.multiverse, this.player)
    if (present) {
      const rects = present.lines.flatMap((l): Rect[] => {
        const line = Multiverse.getLine(this.multiverse, l)
        if (! line) return []

        const m = Line.getLatestBoardIndex(line)
        return m === null ? [] : [this.layout.getBoardRect(l, m)]
      })
      if (rects.length > 0) {
        this.focusRects(rects, Sizes.BoardWidth / 2, options)
        return
      }
    }

    this.focusInitialTurn(options)
  }

  private focusRect(rect: Rect, options: ViewportFocusOptions = {}): CameraMotion | null {
    const camera = this.renderer.getCamera()
    return this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(Rect.center(rect), camera.scale),
    }, {
      smooth: options.smooth,
    })
  }

  private focusRects(rects: Rect[], padding = 0, options: ViewportFocusOptions = {}) {
    const bounds = Rect.bounds(rects)
    if (! bounds) return

    const camera = this.renderer.getCamera()
    const targetScale = Math.min(
      camera.scale,
      getScaleToContainRects(rects, this.layout.getViewportScreenSize(), camera.scale, padding),
    )
    this.moveViewportTo({
      targetCenter: this.layout.getCameraCenterForViewportWorldCenter(Rect.center(bounds), targetScale),
      targetScale,
      viewportWorldCenter: Rect.center(bounds),
    }, {
      smooth: options.smooth,
    })
  }

  private loop = () => {
    this.updateScreen()
    this.updateCameraMotion()
    this.updateCameraBounds()
    this.updateMoveTravelSound()
    this.updateViewFlipTransition()
    this.updateBoardActivationAnimation()
    this.render()
    this.renderer.flush()
    this.finalizeSubmittedMoveAfterAnimation()
    this.continueRemoteActionPlaybackAfterAnimation()
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private updateScreen() {
    if (! this.resizeDirty) return
    this.renderer.resize()
    this.resizeDirty = false
  }

  private render() {
    this.updateInteraction()
    this.renderMultiverse()
    this.renderViewFlipOverlay()
  }

  private updateViewFlipTransition() {
    const transition = this.viewFlipTransition
    if (! transition) return

    const progress = this.getViewFlipTransitionProgress(transition)
    if (! transition.applied && progress >= 0.5) {
      transition.applied = true
      this.applyViewPlayer(transition.to)
    }
    if (progress >= 1) {
      if (! transition.applied) this.applyViewPlayer(transition.to)
      this.viewFlipTransition = null
    }
  }

  private updateBoardActivationAnimation() {
    const animation = this.boardActivationAnimation
    if (! animation) return

    if (this.getBoardActivationAnimationProgress(animation) >= 1) {
      this.boardActivationAnimation = null
    }
  }

  private renderViewFlipOverlay() {
    const transition = this.viewFlipTransition
    if (! transition) return

    const progress = this.getViewFlipTransitionProgress(transition)
    const alpha = progress < 0.5
      ? Easing.easeInOut(progress * 2)
      : 1 - Easing.easeInOut((progress - 0.5) * 2)
    if (alpha <= 0) return

    const { widthCss, heightCss } = this.renderer.getScreen()
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.UI,
      order: 100000,
      space: 'screen',
      mat: Mat3.transform([0, 0], [widthCss, heightCss]),
      color: Color4.fromRgba(0, 0, 0, alpha),
    })
  }

  private getViewFlipTransitionProgress(transition: ViewFlipTransition): number {
    return Scalar.clamp(
      (performance.now() - transition.startedAt) / Animations.ViewFlipTransitionDuration,
      0,
      1,
    )
  }

  private updateInteraction() {
    if (this.isMoveAnimating()) {
      this.hoverSquare = null
      this.hoverPiece = null
      this.hoverCheckWarning = null
      this.syncCanvasCursor()
      this.syncToolbarButtons()
      return
    }

    const canControlTurn = this.canControlTurn()
    const canInspectMoveRange = ! this.gameInputDisabled
    this.hoverCheckWarning = this.gameInputDisabled || ! canControlTurn
      ? null
      : this.getCheckWarningBadgeAtScreen(this.pointer.screen)
    const hit = this.getBoardSquareAtScreen(this.pointer.screen)
    this.hoverSquare = hit ? { l: hit.l, m: hit.m, coord: hit.coord } : null
    this.hoverPiece = this.selectedPiece || ! canInspectMoveRange
      ? null
      : this.getPieceSelectionAtScreen(this.pointer.screen)
    this.syncCanvasCursor()
    this.syncToolbarButtons()
  }

  private syncCanvasCursor() {
    this.setCanvasCursor(this.shouldUsePointerCursor() ? 'pointer' : '')
  }

  private setCanvasCursor(cursor: string) {
    if (this.canvasCursor === cursor) return
    this.canvasCursor = cursor
    this.renderer.setCursor(cursor)
  }

  private shouldUsePointerCursor(): boolean {
    if (this.gameInputDisabled || this.isMoveAnimating()) return false
    if (this.pointer.dragExceeded || this.pointer.pinchLastDistance !== null) return false
    const canControlTurn = this.canControlTurn()
    if (canControlTurn && this.hoverCheckWarning) return true

    if (canControlTurn && this.selectedPiece?.player === this.player && this.hoverSquare) {
      const { l, m, coord } = this.hoverSquare
      const { player, targets } = this.selectedPiece
      if (targets.some(target => (
        this.isTargetAt(target, l, m, coord, player)
      ))) return true
    }

    if (this.hoverPiece) return true

    const selection = this.getInspectablePieceSelectionAtScreen(this.pointer.screen)
    return selection !== null
  }

  private getToolbarButtons(): ButtonConfig[] {
    const finishGameButton = this.shouldShowFinishGameButton()
      ? {
          id: 'submit-moves',
          disabled: false,
          colorPreset: this.getGameStatusButtonColor(),
          turnPlayer: this.getGameStatusPlayer(),
          labelKey: 'button.finishGame',
          piece: null,
          onClick: () => {
            this.playUISound()
            this.ctx.onReturnToMainMenuRequest?.({ forfeit: false })
          },
        } satisfies ButtonConfig
      : null
    const leftButton: ButtonConfig = this.selectedPiece
      ? {
          id: 'deselect-piece',
          disabled: this.isMoveAnimating(),
          colorPreset: ButtonColors.Board,
          turnPlayer: this.player,
          labelKey: 'button.deselect',
          piece: this.selectedPiece.piece,
          onClick: () => {
            this.cancelPieceSelection()
          },
        }
      : {
          id: 'undo-move',
          disabled: ! this.canControlTurn()
            || this.pendingMoves.length === 0
            || this.submitRequestedDuringMoveAnimation,
          colorPreset: this.hasPendingChecks()
            ? ButtonColors.Red
            : getUndoMoveButtonColor(this.pendingMoves.at(-1)?.is5D ?? false),
          turnPlayer: this.player,
          labelKey: 'button.undoMove',
          piece: null,
          onClick: () => {
            this.undoMove()
          },
        }

    return [
      leftButton,
      finishGameButton ?? {
        id: 'submit-moves',
        disabled: ! this.canControlTurn()
          || ! this.canSubmitMoves()
          || this.submitRequestedDuringMoveAnimation,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: this.ctx.localPlayer === null ? 'button.deduceMoves' : 'button.submitMoves',
        piece: null,
        effect: 'pulse',
        onClick: () => {
          this.submitMoves()
        },
      },
      {
        id: 'restart-game',
        disabled: false,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: 'button.forfeit',
        piece: null,
        onClick: () => {
          this.playForfeitSound()
          this.ctx.onReturnToMainMenuRequest?.({ forfeit: true })
        },
      },
      {
        id: 'import-5dpgn',
        disabled: this.isMoveAnimating() || this.isOnlineGame(),
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: 'button.import',
        piece: null,
        onClick: () => {
          this.requestImportFiveDPGN()
        },
      },
      {
        id: 'export-5dpgn',
        disabled: false,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        labelKey: 'button.export',
        piece: null,
        onClick: () => {
          this.requestExportFiveDPGN()
        },
      },
    ]
  }

  public clickToolbarButton(id: string): boolean {
    const button = this.getToolbarButtons().find(button => button.id === id)
    if (! button) return false
    if (this.gameInputDisabled && isPrimaryGameToolbarButton(id)) return true
    if (button.disabled) return true
    button.onClick()
    if (this.gameDisposed) return true
    this.syncToolbarButtons()
    return true
  }

  public getToolbarButtonViews(): GameToolbarButton[] {
    return this.getToolbarButtons().map(button => toToolbarButtonView(button))
  }

  private syncToolbarButtons() {
    if (! this.ctx.onToolbarChange) return

    const buttons = this.getToolbarButtonViews()
    const signature = JSON.stringify(buttons)
    if (signature === this.toolbarSignature) return

    this.toolbarSignature = signature
    this.ctx.onToolbarChange(buttons)
  }

  private syncRecord() {
    if (! this.ctx.onRecordChange) return

    const request = this.getFiveDPGNExport()
    const signature = JSON.stringify(request)
    if (signature === this.recordSignature) return

    this.recordSignature = signature
    this.ctx.onRecordChange(request)
  }

  private syncStatus() {
    if (! this.ctx.onStatusChange) return

    const status = this.getStatusView()
    const signature = JSON.stringify(status)
    if (signature === this.statusSignature) return

    this.statusSignature = signature
    this.ctx.onStatusChange(status)
  }

  private updateGameEndState() {
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    if (this.pendingMoves.length > 0) {
      this.gameEndStatus = null
      return
    }

    const status = CoreGameState.getCheckmateResult({
      multiverse: this.multiverse,
      player: this.player,
    }).status
    this.gameEndStatus = status === 'not-checkmate' ? null : status
  }

  private getStatusView(): GameStatusView {
    if (this.gameEndStatus === 'checkmate') {
      const winner = CorePlayers.opponent(this.player)
      const colors = this.getStatusTextColors(winner)
      return {
        kind: 'checkmate',
        player: winner,
        ...colors,
        ended: true,
      }
    }

    if (this.gameEndStatus === 'stalemate') {
      const colors = this.getStatusTextColors(Player.W)
      return {
        kind: 'stalemate',
        player: null,
        ...colors,
        ended: true,
      }
    }

    const colors = this.getStatusTextColors(this.player)
    return {
      kind: 'turn',
      player: this.player,
      ...colors,
      ended: this.gameEndTrial,
    }
  }

  private getStatusTextColors(player: Player): Pick<GameStatusView, 'color' | 'shadowColor'> {
    const color = player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    const shadowColor = player === Player.W ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
    return {
      color: Color4.toRgbaString(color),
      shadowColor: Color4.toRgbaString(shadowColor),
    }
  }

  private getGameStatusButtonColor(): ButtonColorPreset {
    if (this.gameEndStatus === 'stalemate') return ButtonColors.White
    return getPlayerButtonColor(this.getGameStatusPlayer())
  }

  private getGameStatusPlayer(): Player {
    if (this.gameEndStatus === 'stalemate') return Player.W
    return this.gameEndStatus === 'checkmate' ? CorePlayers.opponent(this.player) : this.player
  }

  private isGameEnded(): boolean {
    return this.gameEndStatus !== null
  }

  private isExternallyFinished(): boolean {
    return this.ctx.isExternallyFinished?.() ?? false
  }

  private shouldShowFinishGameButton(): boolean {
    return this.isGameEnded() || this.isExternallyFinished()
  }

  private handleBoardClick(screen: Vec2) {
    if (this.isMoveAnimating()) return
    if (this.gameInputDisabled) return
    if (this.canControlTurn()) {
      if (this.tryCreatePassAt(screen)) return
      if (this.tryCreateMoveAt(screen)) return
    }
    this.selectPieceAt(screen)
  }

  private selectPieceAt(screen: Vec2) {
    const selection = this.getInspectablePieceSelectionAtScreen(screen)
    if (! selection) return
    this.selectedPiece = selection
    this.playUISound()
  }

  private tryCreatePassAt(screen: Vec2): boolean {
    const warning = this.getCheckWarningBadgeAtScreen(screen)
    if (! warning) return false
    const wasGameEndStatus = this.gameEndStatus
    const wasGameEnded = wasGameEndStatus !== null

    const t = Coord.turn(warning.m, this.player)
    const move: Move = {
      from: { x: 0, y: 0, l: warning.l, t },
      to: { x: 0, y: 0, l: warning.l, t },
    }
    const multiverseBefore = this.multiverse
    const order = this.getMoveOrder(this.pendingMoves.length)
    const pendingMove: PendingMove = {
      move,
      isPass: true,
      order,
      multiverseBefore,
      is5D: false,
      from: warning,
      created: {
        l: warning.l,
        m: warning.m + 1,
      },
    }

    this.multiverse = Multiverse.createPass(multiverseBefore, this.player, [warning.l])
    this.pendingMoves.push(pendingMove)
    this.pendingMove = pendingMove
    this.gameEndTrial ||= wasGameEnded
    if (wasGameEndStatus) this.gameEndTrialStatus = wasGameEndStatus
    this.gameEndStatus = null
    this.syncCheckState()
    this.boardActivationAnimation = null
    this.moveAnimation = {
      startedAt: performance.now(),
      cameraCenter: [...this.renderer.getCamera().center],
      cameraScale: this.renderer.getCamera().scale,
      viewportFollowDisabled: false,
      travelLoop: null,
      travelHitPlayed: false,
    }
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.playUISound()
    this.persistGameState()
    this.notifyPendingActionChange()
    return true
  }

  private tryCreateMoveAt(screen: Vec2): boolean {
    if (! this.selectedPiece) return false
    if (this.selectedPiece.player !== this.player) return false
    const wasGameEndStatus = this.gameEndStatus
    const wasGameEnded = wasGameEndStatus !== null

    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return false
    const target = this.selectedPiece.targets.find(target => (
      target.l === hit.l
      && Coord.boardIndex(target, this.selectedPiece!.player) === hit.m
      && Coord.isSameSpace(target, hit.coord)
    ))
    if (! target) return false

    const move: Move = {
      from: this.selectedPiece.from,
      to: target,
    }
    this.createAnimatedPendingMove(move, { playSound: true, persist: true, notify: true })
    this.gameEndTrial ||= wasGameEnded
    if (wasGameEndStatus) this.gameEndTrialStatus = wasGameEndStatus
    this.selectedPiece = null
    return true
  }

  private createAnimatedPendingMove(
    move: Move,
    { playSound, persist, notify = false }: { playSound: boolean, persist: boolean, notify?: boolean },
  ): PendingMove {
    const multiverseBefore = this.multiverse
    const order = this.getMoveOrder(this.pendingMoves.length)
    const pendingMove: PendingMove = {
      move,
      order,
      multiverseBefore,
      is5D: ! Coord.isSameBoard(move.from, move.to),
      from: {
        l: move.from.l,
        m: Coord.boardIndex(move.from, this.player),
      },
      created: Multiverse.getMoveArrivalBoardIndex(move, this.player, multiverseBefore),
    }
    this.multiverse = Multiverse.applyMove(move, this.player, multiverseBefore, order)
    this.pendingMoves.push(pendingMove)
    this.pendingMove = pendingMove
    this.gameEndStatus = null
    this.syncCheckState()
    this.boardActivationAnimation = null
    this.moveAnimation = {
      startedAt: performance.now(),
      cameraCenter: [...this.renderer.getCamera().center],
      cameraScale: this.renderer.getCamera().scale,
      viewportFollowDisabled: false,
      travelLoop: null,
      travelHitPlayed: false,
    }
    this.submitRequestedDuringMoveAnimation = false
    if (playSound) this.playUISound()
    if (persist) this.persistGameState()
    if (notify) this.notifyPendingActionChange()
    return pendingMove
  }

  private undoMove() {
    if (! this.canControlTurn()) return
    if (this.submitRequestedDuringMoveAnimation) return
    if (this.pendingMoves.length === 0) return
    const undoneMove = this.pendingMoves.at(-1)!
    this.playUndoSound()
    this.pendingMoves.pop()
    this.multiverse = this.replayPendingMoves()
    this.pendingMove = this.pendingMoves.at(-1) ?? null
    if (this.pendingMoves.length === 0) {
      this.gameEndTrial = false
      this.gameEndTrialStatus = null
      this.updateGameEndState()
    }
    else {
      this.gameEndStatus = null
    }
    this.syncCheckState()
    this.clearMoveAnimation()
    this.startBoardActivationAnimation(undoneMove)
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.persistGameState()
    this.notifyPendingActionChange()
  }

  private startBoardActivationAnimation(pendingMove: PendingMove) {
    const boardKeys = new Set<string>()
    const candidates = [
      pendingMove.from,
      ...(pendingMove.is5D
        ? [{
            l: pendingMove.move.to.l,
            m: Coord.boardIndex(pendingMove.move.to, this.player),
          }]
        : []),
    ]

    for (const candidate of candidates) {
      if (this.isTerminalBoard(Multiverse.getLine(this.multiverse, candidate.l), candidate.m)) {
        boardKeys.add(this.getBoardKey(candidate.l, candidate.m))
      }
    }

    this.boardActivationAnimation = boardKeys.size === 0
      ? null
      : {
          boardKeys,
          startedAt: performance.now(),
        }
  }

  private submitMoves() {
    if (! this.canControlTurn()) return
    if (! this.canSubmitMoves()) return
    this.playUISound()

    if (this.isMoveAnimating()) {
      this.submitRequestedDuringMoveAnimation = true
      this.deselectPiece()
      return
    }

    this.finalizeSubmitMoves()
  }

  private finalizeSubmittedMoveAfterAnimation() {
    if (! this.submitRequestedDuringMoveAnimation) return
    if (this.isMoveAnimating()) return
    this.finalizeSubmitMoves()
  }

  private continueRemoteActionPlaybackAfterAnimation() {
    if (! this.remoteActionMoves) return
    if (this.isMoveAnimating()) return

    if (this.remoteActionMoves.length > 0) {
      this.startNextRemoteMove()
      return
    }

    this.finalizeRemoteAction()
    this.remoteActionMoves = null
    this.startNextRemoteAction()
  }

  private finalizeSubmitMoves() {
    if (! this.canSubmitMoves()) {
      this.submitRequestedDuringMoveAnimation = false
      this.syncToolbarButtons()
      return
    }

    const action: Action = {
      moves: this.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move),
    }
    this.appendActionToActiveRecordLine(action)
    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
    this.syncAutomaticViewPlayer()
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.updateGameEndState()
    if (this.isGameEnded()) this.playGameEndSound()
    else this.playTurnStartSound()
    this.syncCheckState()
    this.persistGameState()
    this.ctx.onActionSubmitted?.(action, this.actions)
  }

  private tryStartRemoteActionPlayback(actions: Action[]): boolean {
    const signature = JSON.stringify(actions)
    if (signature === this.remoteActionTargetSignature) return true
    if (! this.isOnlineGame()) return false
    if (! isActionPrefix(this.actions, actions)) return false

    const nextActions = actions.slice(this.actions.length)
    if (nextActions.length === 0) return false

    this.remoteActionTargetSignature = signature
    this.remoteActionQueue = nextActions
    this.remoteActionMoves = null
    this.startNextRemoteAction()
    return true
  }

  private startNextRemoteAction() {
    if (this.isMoveAnimating() || this.pendingMoves.length > 0) return

    const action = this.remoteActionQueue.shift()
    if (! action) {
      this.remoteActionTargetSignature = ''
      return
    }

    this.remoteActionMoves = [...action.moves]
    if (this.remoteActionMoves.length === 0) {
      this.finalizeRemoteAction()
      this.remoteActionMoves = null
      this.startNextRemoteAction()
      return
    }

    this.startNextRemoteMove()
  }

  private startNextRemoteMove() {
    const move = this.remoteActionMoves?.shift()
    if (! move) return

    this.createAnimatedPendingMove(move, { playSound: true, persist: false })
  }

  private finalizeRemoteAction() {
    const action: Action = {
      moves: this.pendingMoves
        .filter(pendingMove => ! pendingMove.isPass)
        .map(pendingMove => pendingMove.move),
    }
    this.appendActionToActiveRecordLine(action)
    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
    this.syncAutomaticViewPlayer()
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.updateGameEndState()
    if (this.isGameEnded()) this.playGameEndSound()
    else this.playTurnStartSound()
    this.syncCheckState()
    this.persistGameState()
  }

  public importFiveDPGNText(input: string): string | null {
    try {
      this.loadCoreGameState(FiveDPGN.importGameState(input))
      this.syncToolbarButtons()
      return null
    }
    catch (error) {
      return error instanceof Error ? error.message : 'Failed to import game record'
    }
  }

  public getFiveDPGNExport(
    mode: GameExportMode = 'tree',
    format: GameExportFormat = 'pgn',
  ): GameExportRequest {
    const options: FiveDPGN.ExportOptions = {
      ...this.getFiveDPGNExportOptions(),
      initialMultiverse: this.initialMultiverse,
    }
    return {
      text: format === 'fen'
        ? FiveDPGN.exportFEN(this.multiverse)
        : mode === 'tree'
          ? FiveDPGN.exportActionTree(this.buildFiveDPGNActionTree(), options)
          : FiveDPGN.exportGameState({
              actions: this.actions.slice(0, Scalar.clamp(this.actionIndex, 0, this.actions.length)),
            }, options),
      format,
      mode,
      hasPendingMoves: format === 'pgn' && this.pendingMoves.length > 0,
      currentActionIndex: this.actionIndex,
      actions: this.buildRecordActionsForDisplay(),
    }
  }

  private getFiveDPGNExportOptions(): FiveDPGN.ExportOptions {
    return {
      ...this.fiveDPGNOptions,
      ...this.ctx.getFiveDPGNExportMetadata?.(),
    }
  }

  private buildFiveDPGNActionTree(lineId = 0, actionIndex = 0): FiveDPGN.ActionTree {
    const line = this.recordLines.get(lineId)
    if (! line) return { variations: [] }

    const variations: FiveDPGN.ActionTreeVariation[] = []
    const branchIds = line.branchLineIdsBeforeAction.get(actionIndex) ?? []
    for (const branchId of branchIds) {
      variations.push(...this.buildFiveDPGNActionTree(branchId).variations)
    }

    if (actionIndex < line.actions.length) {
      variations.push({
        action: line.actions[actionIndex],
        subtree: this.buildFiveDPGNActionTree(lineId, actionIndex + 1),
      })
    }

    return { variations }
  }

  private buildRecordActionsForDisplay(): GameRecordRow[] {
    return this.buildRecordLineActionsForDisplay(0, [])
  }

  private buildRecordLineActionsForDisplay(lineId: number, prefixActions: Action[]): GameRecordRow[] {
    const line = this.recordLines.get(lineId)
    if (! line) return []

    const rows: GameRecordRow[] = []
    const activePendingLocalActionIndex = line.id === this.activeRecordLineId && this.pendingMoves.length > 0
      ? this.getActiveRecordLineLocalActionIndex()
      : null
    const currentCursorLocalActionIndex = line.id === this.activeRecordLineId && this.pendingMoves.length === 0
      ? this.getActiveRecordLineLocalActionIndex()
      : null
    const lineRows = buildGameRecordActions([
      ...prefixActions,
      ...line.actions,
    ], {
      ...this.fiveDPGNOptions,
      initialMultiverse: this.initialMultiverse,
    })

    for (let actionIndex = 0; actionIndex <= line.actions.length; actionIndex += 1) {
      const hasFuture = this.hasRecordFutureAt(line.id, actionIndex)
      if (line.id === 0 || actionIndex > 0 || hasFuture) {
        rows.push({
          kind: 'cursor',
          recordKey: `${line.id}:cursor:${actionIndex}`,
          recordLineId: line.id,
          recordActionIndex: actionIndex,
          branchDepth: line.depth,
          hasFuture,
          current: currentCursorLocalActionIndex === actionIndex,
        })
      }

      const branchIds = line.branchLineIdsBeforeAction.get(actionIndex) ?? []
      const branchPrefixActions = [
        ...prefixActions,
        ...line.actions.slice(0, actionIndex),
      ]
      for (const branchId of branchIds) {
        rows.push(...this.buildRecordLineActionsForDisplay(branchId, branchPrefixActions))
      }

      if (activePendingLocalActionIndex === actionIndex) {
        const pendingMoves = this.getPendingMoves()
        const pendingRows = buildGameRecordActions([
          ...branchPrefixActions,
          { moves: pendingMoves },
        ], {
          ...this.fiveDPGNOptions,
          initialMultiverse: this.initialMultiverse,
        })
        const pendingRow = pendingRows.at(-1)
        if (pendingRow) {
          rows.push({
            ...pendingRow,
            recordKey: `${line.id}:${actionIndex}:pending`,
            recordLineId: line.id,
            recordActionIndex: actionIndex,
            branchDepth: line.depth,
            pending: true,
          })
        }
      }

      if (actionIndex >= line.actions.length) continue

      const row = lineRows[prefixActions.length + actionIndex]
      if (! row) continue

      rows.push({
        ...row,
        recordKey: `${line.id}:${actionIndex}`,
        recordLineId: line.id,
        recordActionIndex: actionIndex,
        branchDepth: line.depth,
      })
    }

    return rows
  }

  public rollbackToActionEnd(actionIndex: number): boolean {
    if (this.isMoveAnimating()) return false

    const targetActionIndex = Scalar.clamp(Math.floor(actionIndex), 0, this.actions.length)
    const state = CoreGameState.create(this.actions.slice(0, targetActionIndex), [], this.initialMultiverse)
    this.initialMultiverse = state.initialMultiverse
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    this.persistGameState()
    this.focusCurrentPresent()
    this.syncToolbarButtons()
    return true
  }

  private requestImportFiveDPGN() {
    this.ctx.onImportRequest?.()
  }

  private requestExportFiveDPGN() {
    this.ctx.onExportRequest?.(this.getFiveDPGNExport())
  }

  private loadCoreGameState(state: CoreGameState, { focus = true }: { focus?: boolean } = {}) {
    this.initialMultiverse = state.initialMultiverse
    this.actions = state.actions
    this.resetRecordTree(state.actions)
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.syncAutomaticViewPlayer()
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.clearMoveAnimation()
    this.submitRequestedDuringMoveAnimation = false
    this.gameEndTrial = false
    this.gameEndTrialStatus = null
    this.cameraMotion = null
    this.clearPointerDrag()
    this.updateGameEndState()
    this.syncCheckState()
    this.persistGameState()
    if (focus) this.focusCurrentPresent()
  }

  private deselectPiece() {
    this.selectedPiece = null
  }

  private cancelPieceSelection() {
    if (! this.selectedPiece) return
    this.selectedPiece = null
    this.playUISound()
  }

  private playUISound() {
    this.soundManager.play('lightswitch.ogg', { volume: this.getUISoundVolume() })
  }

  private playUndoSound() {
    this.soundManager.play('guiro_long.ogg', { volume: this.getUISoundVolume() })
  }

  private playForfeitSound() {
    this.soundManager.play('timpani_hit_a2.ogg', { volume: this.getUISoundVolume() })
  }

  private playTurnStartSound() {
    if (this.isOnlineGame()) return

    if (this.ctx.localPlayer === this.player) {
      this.soundManager.play('bell.ogg', { volume: this.getBellSoundVolume() })
      return
    }

    this.soundManager.playSequence([
      { name: 'timpani_hit_c3.ogg', nextAfter: 0.5 },
      'timpani_hit_e3.ogg',
    ], { volume: this.getBellSoundVolume() })
  }

  private playLocalTurnStartSoundAfterLoadedAction(previousPlayer: Player, previousActionIndex: number) {
    if (! this.isOnlineGame()) return
    if (this.isGameEnded()) return
    if (this.ctx.localPlayer !== this.player) return
    if (previousPlayer === this.player) return
    if (this.actionIndex <= previousActionIndex) return

    this.playTurnStartSound()
  }

  private playGameEndSound() {
    this.soundManager.playSequence([
      { name: 'timpani_hit_c3.ogg', nextAfter: 0.5 },
      'fanfare.ogg',
    ], { volume: this.getBellSoundVolume() })
  }

  private getUISoundVolume(): number {
    return this.ctx.getUISoundVolume?.() ?? 1
  }

  private getBellSoundVolume(): number {
    return this.ctx.getBellSoundVolume?.() ?? 1
  }

  private syncAutomaticViewPlayer() {
    if (! this.autoSwitchViewPlayer) return
    this.setViewPlayer(this.player)
  }

  private canSubmitMoves(): boolean {
    return ! this.isGameEnded()
      && ! this.gameEndTrial
      && this.pendingMoves.length > 0
      && ! this.pendingMoves.some(pendingMove => pendingMove.isPass)
      && this.hasSubmittedPresentMoves()
      && ! this.hasPendingChecks()
      && ! this.hasCheckWarning()
  }

  private syncCheckState() {
    this.syncCheckWarnings()
    this.syncPendingChecks()
  }

  private syncCheckWarnings() {
    const checkWarningBoardKeys = new Set<string>()
    const checkWarningBoards = CoreGameState.findPassCheckWarnings({
      multiverse: this.multiverse,
      player: this.player,
      includePhantom: this.isGameEnded(),
    })
    for (const { l, m } of checkWarningBoards) {
      checkWarningBoardKeys.add(this.getBoardKey(l, m))
    }

    this.checkWarningBoards = checkWarningBoards
    this.checkWarningBoardKeys = checkWarningBoardKeys
  }

  private syncPendingChecks() {
    const pendingCheckBoardKeys = new Set<string>()
    const redCandidateBoardKeys = this.getPendingCheckRedCandidateBoardKeys()
    const attackingPlayer = CorePlayers.opponent(this.player)
    const checks = this.pendingMoves.length === 0
      ? []
      : Multiverse.findChecks(this.multiverse, attackingPlayer)

    this.pendingChecks = checks.map((move) => {
      const fromBoard = {
        l: move.from.l,
        m: Coord.boardIndex(move.from, attackingPlayer),
      }
      const toBoard = {
        l: move.to.l,
        m: Coord.boardIndex(move.to, attackingPlayer),
      }
      this.addPendingCheckRedBoardKey(pendingCheckBoardKeys, redCandidateBoardKeys, fromBoard)
      this.addPendingCheckRedBoardKey(pendingCheckBoardKeys, redCandidateBoardKeys, toBoard)
      return {
        move,
        attackingPlayer,
        fromBoard,
        toBoard,
      }
    })
    this.pendingCheckBoardKeys = pendingCheckBoardKeys
  }

  private getPendingCheckRedCandidateBoardKeys(): ReadonlySet<string> {
    const boardKeys = new Set<string>()
    for (const pendingMove of this.pendingMoves) {
      const mandatoryLines = new Set(
        Multiverse.getTimelineStatus(pendingMove.multiverseBefore, this.player).mandatory,
      )

      this.addNewBoardOfMandatoryBoardKey(
        boardKeys,
        pendingMove.multiverseBefore,
        pendingMove.from,
        this.getPendingMoveSourceCreatedBoard(pendingMove),
        mandatoryLines,
      )

      if (pendingMove.is5D) {
        this.addNewBoardOfMandatoryBoardKey(
          boardKeys,
          pendingMove.multiverseBefore,
          {
            l: pendingMove.move.to.l,
            m: Coord.boardIndex(pendingMove.move.to, this.player),
          },
          pendingMove.created,
          mandatoryLines,
        )
      }
    }
    return boardKeys
  }

  private addNewBoardOfMandatoryBoardKey(
    boardKeys: Set<string>,
    multiverse: Multiverse,
    board: { l: number, m: number },
    newBoard: { l: number, m: number },
    mandatoryLines: ReadonlySet<number>,
  ) {
    if (this.isMandatoryActiveBoard(multiverse, board.l, board.m, mandatoryLines)) {
      boardKeys.add(this.getBoardKey(newBoard.l, newBoard.m))
    }
  }

  private addPendingCheckRedBoardKey(
    pendingCheckBoardKeys: Set<string>,
    redCandidateBoardKeys: ReadonlySet<string>,
    board: { l: number, m: number },
  ) {
    const boardKey = this.getBoardKey(board.l, board.m)
    if (redCandidateBoardKeys.has(boardKey)) pendingCheckBoardKeys.add(boardKey)
  }

  private hasPendingChecks(): boolean {
    return this.pendingChecks.length > 0
  }

  private hasCheckWarning(): boolean {
    return this.checkWarningBoardKeys.size > 0
  }

  private isCheckWarningBoard(l: number, m: number): boolean {
    return this.checkWarningBoardKeys.has(this.getBoardKey(l, m))
  }

  private isPendingCheckBoard(l: number, m: number): boolean {
    return this.pendingCheckBoardKeys.has(this.getBoardKey(l, m))
  }

  private isMandatoryActiveBoard(
    multiverse: Multiverse,
    l: number,
    m: number,
    mandatoryLines: ReadonlySet<number> = new Set(Multiverse.getTimelineStatus(multiverse, this.player).mandatory),
  ): boolean {
    if (! mandatoryLines.has(l)) return false

    const line = Multiverse.getLine(multiverse, l)
    return Line.getLatestBoardIndex(line) === m
  }

  private isTerminalBoard(line: Line | null, m: number): boolean {
    if (! line) return false
    return Line.getLatestBoardIndex(line) === m
  }

  private getBoardKey(l: number, m: number): string {
    return `${l}:${m}`
  }

  private getMoveOrder(pendingMoveIndex: number): number {
    return this.actionIndex * CoreGameState.MOVE_ORDER_STRIDE + pendingMoveIndex
  }

  private getCommittedMoveOrderBase(): number {
    return Math.max(0, this.actionIndex - 1) * CoreGameState.MOVE_ORDER_STRIDE
  }

  private replayPendingMoves(): Multiverse {
    return this.pendingMoves.reduce(
      (multiverse, pendingMove) => pendingMove.isPass
        ? Multiverse.createPass(multiverse, this.player, [pendingMove.from.l])
        : Multiverse.applyMove(
          pendingMove.move,
          this.player,
          multiverse,
          pendingMove.order,
        ),
      this.multiverseCommitted,
    )
  }

  private getPendingMoves(): Move[] {
    return this.pendingMoves
      .filter(pendingMove => ! pendingMove.isPass)
      .map(pendingMove => pendingMove.move)
  }

  private notifyPendingActionChange() {
    const moves = this.getPendingMoves()
    this.ctx.onPendingActionChange?.(moves.length > 0 ? { moves } : null)
  }

  private createPendingMoves(moves: Move[]): { pendingMoves: PendingMove[], multiverse: Multiverse } {
    let multiverse = this.multiverseCommitted
    const pendingMoves = moves.map((move, index): PendingMove => {
      const order = this.getMoveOrder(index)
      const pendingMove: PendingMove = {
        move,
        order,
        multiverseBefore: multiverse,
        is5D: ! Coord.isSameBoard(move.from, move.to),
        from: {
          l: move.from.l,
          m: Coord.boardIndex(move.from, this.player),
        },
        created: Multiverse.getMoveArrivalBoardIndex(move, this.player, multiverse),
      }
      multiverse = Multiverse.applyMove(move, this.player, multiverse, order)
      return pendingMove
    })

    return { pendingMoves, multiverse }
  }

  private fillMissingMoveOrders(multiverse: Multiverse, baseOrder: number) {
    let fallbackIndex = 0
    for (const [, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [, board] of Line.getBoardEntries(line)) {
        if (! board?.createdBy) continue
        board.createdByOrder ??= baseOrder + fallbackIndex
        fallbackIndex += 1
      }
    }
  }

  private isMoveAnimating(): boolean {
    return this.getMoveAnimationProgress() < 1
  }

  private getMoveAnimationProgress(): number {
    if (! this.moveAnimation) return 1
    return Scalar.clamp(
      this.getMoveAnimationElapsed() / this.getMoveAnimationDuration(),
      0,
      1,
    )
  }

  private getMoveAnimationElapsed(): number {
    if (! this.moveAnimation) return Infinity
    return performance.now() - this.moveAnimation.startedAt
  }

  private getBoardActivationAnimationProgress(animation: BoardActivationAnimation): number {
    return Scalar.clamp(
      (performance.now() - animation.startedAt) / Animations.MoveAnimationDuration,
      0,
      1,
    )
  }

  private getBoardActivationProgress(l: number, m: number, isActive: boolean): number | null {
    const animation = this.boardActivationAnimation
    if (! animation || ! isActive) return null
    if (! animation.boardKeys.has(this.getBoardKey(l, m))) return null
    return Easing.easeInOut(this.getBoardActivationAnimationProgress(animation))
  }

  private getMoveAnimationDuration(): number {
    if (! this.pendingMove?.is5D) return Animations.MoveAnimationDuration
    return Animations.MoveAnimationDuration
      + (this.showMoveTravelAnimation ? this.getMoveTravelDuration(this.pendingMove) : 0)
      + Animations.MoveAnimationDuration
  }

  private getMoveAnimationEase(): number {
    return Easing.easeInOut(this.getMoveBoardAnimationProgress())
  }

  private getMoveBoardAnimationProgress(): number {
    const elapsed = this.getMoveAnimationElapsed()
    if (! this.pendingMove?.is5D) {
      return Scalar.clamp(elapsed / Animations.MoveAnimationDuration, 0, 1)
    }
    const travelDuration = this.getMoveTravelDuration(this.pendingMove)
    return Scalar.clamp(
      (elapsed - Animations.MoveAnimationDuration - travelDuration)
        / Animations.MoveAnimationDuration,
      0,
      1,
    )
  }

  private getMoveSourceBoardAnimationProgress(): number {
    return Scalar.clamp(this.getMoveAnimationElapsed() / Animations.MoveAnimationDuration, 0, 1)
  }

  private getMoveTravelViewportProgress(): number {
    return Scalar.clamp(
      this.getMoveAnimationElapsed() / Animations.MoveTravelViewportDuration,
      0,
      1,
    )
  }

  private getMoveTravelAnimationProgress(): number {
    if (! this.showMoveTravelAnimation) return 1
    return Scalar.clamp(
      (this.getMoveAnimationElapsed() - Animations.MoveAnimationDuration)
        / this.getMoveTravelDuration(this.pendingMove),
      0,
      1,
    )
  }

  private getMoveTravelDuration(pendingMove: PendingMove | null): number {
    if (! this.showMoveTravelAnimation) return 0
    if (! pendingMove?.is5D) return Animations.MoveTravelDuration

    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return Animations.MoveTravelDuration

    const length = CubicBezier.length(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      Sizes.MoveArrowCurveSamples,
    )
    return Math.max(1, length / Animations.MoveTravelSpeed)
  }

  private updateMoveTravelSound() {
    const animation = this.moveAnimation
    const pendingMove = this.pendingMove
    if (! this.showMoveTravelAnimation) {
      if (animation) this.stopMoveTravelLoop(animation)
      return
    }
    if (! animation || ! pendingMove?.is5D) return

    const sourceProgress = this.getMoveSourceBoardAnimationProgress()
    const travelProgress = this.getMoveTravelAnimationProgress()
    const inTravel = sourceProgress >= 1 && travelProgress < 1

    if (inTravel && ! animation.travelLoop) {
      animation.travelLoop = this.soundManager.playLoop('timpani_roll_f3.ogg', { volume: this.getBellSoundVolume() })
    }

    if (travelProgress < 1) return

    this.stopMoveTravelLoop(animation)
    if (! animation.travelHitPlayed && sourceProgress >= 1) {
      this.soundManager.play('timpani_hit_f3.ogg', { volume: this.getBellSoundVolume() })
      animation.travelHitPlayed = true
    }
  }

  private clearMoveAnimation() {
    if (this.moveAnimation) this.stopMoveTravelLoop(this.moveAnimation)
    this.moveAnimation = null
  }

  private stopMoveTravelLoop(animation: MoveAnimation) {
    animation.travelLoop?.stop()
    animation.travelLoop = null
  }

  private hasSubmittedPresentMoves(): boolean {
    return CoreGameState.hasSubmittedPresentMoves(this.multiverse, this.player)
  }

  private getPieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    const hit = this.getActiveBoardSquareAtScreen(screen)
    if (! hit) return null
    return this.getPieceSelectionFromHit(hit, this.getBoardPlayer(hit.m))
  }

  private getInspectablePieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    return this.getPieceSelectionAtScreen(screen)
  }

  private getPieceSelectionFromHit(hit: BoardSquareHit, player: Player): PieceSelection | null {
    const piece = Board.getPiece(hit.coord, hit.board)
    if (Pieces.getPlayer(piece) !== player) return null

    const from: Coord = {
      ...hit.coord,
      l: hit.l,
      t: Coord.turn(hit.m, player),
    }

    return {
      l: hit.l,
      m: hit.m,
      player,
      from,
      targets: Multiverse.getMoveTargets(this.multiverse, from, player),
      piece,
    }
  }

  private getBoardPlayer(m: number): Player {
    return m % 2 === Player.W ? Player.W : Player.B
  }

  private getActiveBoardSquareAtScreen(screen: Vec2): BoardSquareHit | null {
    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return null
    const player = this.getBoardPlayer(hit.m)
    if (! Multiverse.isPlayableBoard(this.multiverse, player, {
      l: hit.l,
      t: Coord.turn(hit.m, player),
    })) return null
    return hit
  }

  private getBoardSquareAtScreen(screen: Vec2): BoardSquareHit | null {
    const world = this.renderer.screenToWorld(screen)

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue

        const [[borderX, borderY]] = this.layout.getBoardRect(l, m)
        const x0 = borderX + Sizes.BoardBorder
        const y0 = borderY + Sizes.BoardBorder
        const displayCoord = {
          x: Math.floor((world[0] - x0) / Sizes.PieceWidth),
          y: Math.floor((world[1] - y0) / Sizes.PieceWidth),
        }
        if (! Coord.isInBoard(displayCoord)) continue

        const coord = this.toBoardCoord(displayCoord)

        return { l, m, board, coord }
      }
    }

    return null
  }

  private getCheckWarningBadgeAtScreen(screen: Vec2): { l: number, m: number } | null {
    const world = this.renderer.screenToWorld(screen)
    for (const warning of this.checkWarningBoards) {
      const center = this.getCheckBadgeCenter(warning.l, warning.m)
      if (Vec2.length(Vec2.sub(world, center)) <= Sizes.CheckBadgeRadius) return warning
    }
    return null
  }

  private updateCameraMotion() {
    if (! this.cameraMotion) return

    const viewport = this.getCameraMotionViewport(this.cameraMotion, this.cameraMotion.targetScale)
    if (viewport) {
      const targetCenter = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, this.cameraMotion.targetScale)
      const clampedTargetCenter = this.layout.clampCameraCenterToViewport(
        targetCenter,
        viewport,
        this.cameraMotion.targetScale,
      )
      this.cameraMotion.targetCenter = clampedTargetCenter
      if (this.cameraMotion.viewportWorldCenter) {
        this.cameraMotion.viewportWorldCenter = this.layout.getViewportWorldCenter(
          clampedTargetCenter,
          this.cameraMotion.targetScale,
        )
      }
    }

    const camera = this.renderer.getCamera()
    const scaleDelta = this.cameraMotion.targetScale - camera.scale
    const scaleNext = Math.abs(scaleDelta) <= CameraControl.ZoomSnapEpsilon
      ? this.cameraMotion.targetScale
      : camera.scale + scaleDelta * CameraControl.ZoomSmoothing
    const targetCenterAtScale = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, scaleNext)

    this.setCameraScaleAt(this.cameraMotion.anchorScreen, scaleNext)

    const cameraAfterScale = this.renderer.getCamera()
    const centerDelta = Vec2.sub(targetCenterAtScale, cameraAfterScale.center)
    const centerNext = Vec2.length(centerDelta) <= CameraControl.BounceBackSnapEpsilon
      ? targetCenterAtScale
      : Vec2.add(cameraAfterScale.center, Vec2.scale(centerDelta, CameraControl.BounceBackSmoothing))
    this.renderer.setCamera({ center: centerNext })

    this.smoothCameraToViewport(
      this.getCameraMotionViewport(this.cameraMotion, scaleNext),
      CameraControl.BounceBackSmoothing,
    )

    const cameraAfterBounds = this.renderer.getCamera()
    const targetCenterAfterBounds = this.getCameraMotionTargetCenterAtScale(this.cameraMotion, scaleNext)

    if (
      scaleNext === this.cameraMotion.targetScale
      && Vec2.length(Vec2.sub(cameraAfterBounds.center, targetCenterAfterBounds)) <= CameraControl.BounceBackSnapEpsilon
    ) {
      this.renderer.setCamera({ center: targetCenterAfterBounds })
      this.cameraMotion = null
    }
  }

  private getCameraMotionTargetCenterAtScale(motion: CameraMotion, scale: number): Vec2 {
    return motion.viewportWorldCenter
      ? this.layout.getCameraCenterForViewportWorldCenter(motion.viewportWorldCenter, scale)
      : motion.targetCenter
  }

  private setCameraScaleAt(anchorScreen: Vec2, scale: number) {
    const worldBefore = this.renderer.screenToWorld(anchorScreen)
    this.renderer.setCamera({ scale })
    const worldAfter = this.renderer.screenToWorld(anchorScreen)
    const camera = this.renderer.getCamera()
    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.sub(worldBefore, worldAfter)),
    })
  }

  private syncCameraMotion() {
    if (! this.cameraMotion) return
    this.cameraMotion.targetCenter = this.renderer.getCamera().center
    this.cameraMotion.targetScale = this.renderer.getCamera().scale
    this.cameraMotion.viewportWorldCenter = undefined
  }

  private getViewportCenterScreen(): Vec2 {
    return this.layout.getViewportCenterScreen()
  }

  private getCameraMotionViewport(motion: CameraMotion, scale = motion.targetScale): Rect | null {
    return motion.viewport === undefined
      ? this.layout.getValidViewportRect(this.multiverse, [], scale)
      : motion.viewport
  }

  private updateCameraBounds() {
    if (this.cameraMotion) return
    if (this.pointer.dragLastScreen) return

    const validViewport = this.layout.getValidViewportRect(this.multiverse)
    if (! validViewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.layout.clampCameraCenterToViewport(camera.center, validViewport)
    const delta = Vec2.sub(targetCenter, camera.center)

    if (Vec2.length(delta) <= CameraControl.BounceBackSnapEpsilon) {
      this.renderer.setCamera({ center: targetCenter })
      return
    }

    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.scale(delta, CameraControl.BounceBackSmoothing)),
    })
  }

  private smoothCameraToViewport(viewport: Rect | null, smoothing: number) {
    if (! viewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.layout.clampCameraCenterToViewport(camera.center, viewport)
    const delta = Vec2.sub(targetCenter, camera.center)
    if (Vec2.length(delta) <= CameraControl.BounceBackSnapEpsilon) {
      this.renderer.setCamera({ center: targetCenter })
      return
    }

    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.scale(delta, smoothing)),
    })
  }

  private clampCameraCenterToValidViewportIfAvailable(center: Vec2): Vec2 {
    const validViewport = this.layout.getValidViewportRect(this.multiverse)
    if (! validViewport) return center
    return this.layout.clampCameraCenterToViewport(center, validViewport)
  }

  private getMoveAnimationViewportRect(pendingMove: PendingMove): Rect | null {
    return this.layout.getValidViewportRect(
      pendingMove.multiverseBefore,
      [
        this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1),
        this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m),
      ],
    )
  }

  private renderMultiverse() {
    this.timelineTilesPainter.render(this.multiverse, {
      endedProgress: this.getGameEndBackgroundProgress(),
      endedStatus: this.gameEndBackgroundStatus,
    })
    if (this.pendingMove && this.isMoveAnimating()) {
      if (this.pendingMove.is5D && this.getMoveBoardAnimationProgress() === 0) {
        this.renderMultiverseTravelAnimation(this.pendingMove)
        return
      }
      this.renderMultiversePendingAnimation(this.pendingMove, this.getMoveAnimationEase())
      return
    }

    this.presentPainter.render({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
    })
    this.renderMultiverseStatic(this.multiverse)
    this.renderPendingCheckArrows()
  }

  private getGameEndBackgroundProgress(): number {
    const now = performance.now()
    const targetStatus = this.getGameEndBackgroundTargetStatus()
    const target = targetStatus !== null
    const targetProgress = target ? 1 : 0
    const currentProgress = this.resolveGameEndBackgroundProgress(now)

    if (targetStatus) this.gameEndBackgroundStatus = targetStatus

    if (target !== this.gameEndBackgroundTarget) {
      this.gameEndBackgroundTarget = target
      this.gameEndBackgroundAnimation = {
        from: currentProgress,
        to: targetProgress,
        startedAt: now,
      }
      return currentProgress
    }

    return currentProgress
  }

  private getGameEndBackgroundTargetStatus(): Exclude<CheckmateStatus, 'not-checkmate'> | null {
    if (this.gameEndStatus) return this.gameEndStatus
    if (this.gameEndTrial) return this.gameEndTrialStatus ?? 'checkmate'
    return null
  }

  private resolveGameEndBackgroundProgress(now: number): number {
    if (! this.gameEndBackgroundAnimation) return this.gameEndBackgroundTarget ? 1 : 0

    const progress = Scalar.clamp(
      (now - this.gameEndBackgroundAnimation.startedAt) / Animations.GameEndBackgroundDuration,
      0,
      1,
    )
    const eased = Easing.easeInOut(progress)
    const value = Scalar.lerp(
      this.gameEndBackgroundAnimation.from,
      this.gameEndBackgroundAnimation.to,
      eased,
    )

    if (progress >= 1) {
      this.gameEndBackgroundAnimation = null
      return this.gameEndBackgroundTarget ? 1 : 0
    }

    return value
  }

  private renderMultiverseStatic(multiverse: Multiverse) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      this.linePainter.render(line, l, 1, multiverse)

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        this.renderBoard(board, l, m, this.isTerminalBoard(line, m), this.isTemporaryBoard(l, m), {
          temporaryPreset: this.getTemporaryBoardPreset(l, m),
        })
      }
    }
  }

  private renderMultiverseTravelAnimation(pendingMove: PendingMove) {
    const viewportProgress = this.getMoveTravelViewportProgress()
    const sourceProgress = this.getMoveSourceBoardAnimationProgress()
    const sourceEase = Easing.easeInOut(sourceProgress)
    const travelProgress = this.getMoveTravelAnimationProgress()
    const pieceProgress = this.getMoveTravelPathProgress(pendingMove, travelProgress)

    this.followTravelAnimationViewport(pendingMove, Easing.easeInOut(viewportProgress))
    this.presentPainter.render({
      multiverse: pendingMove.multiverseBefore,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
    })
    this.renderMultiverseSourceAnimation(pendingMove, sourceEase)
    this.renderMoveArrow(pendingMove.move, this.player, 1, pendingMove.order)
    if (sourceProgress >= 1) {
      this.renderTravelPiece(pendingMove, pieceProgress, 1)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, sourceEase, 0))
  }

  private renderMultiversePendingAnimation(pendingMove: PendingMove, progress: number) {
    if (pendingMove.is5D) {
      this.renderMultiverseTargetAnimation(pendingMove, progress)
      return
    }

    this.followPendingBoardAnimation(pendingMove, progress)
    this.presentPainter.renderAnimated({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
      pendingMove,
      progress,
    })
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isPendingLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l

      if (isPendingLine && Line.getLatestBoardIndex(lineCommitted) !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isPendingLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        if (isTargetLine && m === targetBoardIndex) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (l === pendingMove.created.l) {
        renderedCreatedBoard = this.renderPendingCreatedBoard(pendingMove, progress) || renderedCreatedBoard
      }
    }

    if (! renderedCreatedBoard) {
      const createdLine = Multiverse.getLine(this.multiverse, pendingMove.created.l)
      if (createdLine) this.linePainter.render(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, progress, progress))
  }

  private renderMultiverseSourceAnimation(pendingMove: PendingMove, progress: number) {
    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const isSourceLine = l === pendingMove.from.l

      if (isSourceLine && Line.getLatestBoardIndex(lineCommitted) !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isSourceLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (isSourceLine) this.renderSourceCreatedBoard(pendingMove, progress)
    }
  }

  private renderMultiverseTargetAnimation(pendingMove: PendingMove, progress: number) {
    this.presentPainter.renderAnimated({
      multiverse: this.multiverse,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
      pendingMove,
      progress,
    })
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isSourceLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isSourceLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }
      else if (isTargetLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isSourceLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 0,
          })
          continue
        }
        if (isTargetLine && m === targetBoardIndex) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: this.isTerminalBoard(lineCommitted, m) ? 1 - progress : 0,
          })
          continue
        }
        this.renderBoard(board, l, m, this.isTerminalBoard(lineCommitted, m), false)
      }

      if (isSourceLine) this.renderSourceCreatedBoard(pendingMove, 1)
      if (l === pendingMove.created.l) {
        renderedCreatedBoard = this.renderPendingCreatedBoard(pendingMove, progress) || renderedCreatedBoard
      }
    }

    if (! renderedCreatedBoard) {
      const createdLine = Multiverse.getLine(this.multiverse, pendingMove.created.l)
      if (createdLine) this.linePainter.render(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
    this.renderPendingCheckArrows(this.getMoveAnimationBoardPositions(pendingMove, 1, progress))
  }

  private getMoveAnimationBoardPositions(
    pendingMove: PendingMove,
    sourceProgress: number,
    targetProgress: number,
  ): ReadonlyMap<string, Vec2> {
    const positions = new Map<string, Vec2>()
    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [targetPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)

    if (! pendingMove.is5D) {
      positions.set(
        this.getBoardKey(pendingMove.created.l, pendingMove.created.m),
        Vec2.mix(fromPos, targetPos, targetProgress),
      )
      return positions
    }

    const sourceCreatedM = this.getSourceCreatedBoardIndex(pendingMove)
    const [sourceCreatedPos] = this.layout.getBoardRect(pendingMove.from.l, sourceCreatedM)
    const [targetStartPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
    positions.set(
      this.getBoardKey(pendingMove.from.l, sourceCreatedM),
      Vec2.mix(fromPos, sourceCreatedPos, sourceProgress),
    )
    positions.set(
      this.getBoardKey(pendingMove.created.l, pendingMove.created.m),
      Vec2.mix(targetStartPos, targetPos, targetProgress),
    )

    return positions
  }

  private renderSourceCreatedBoard(pendingMove: PendingMove, progress: number): boolean {
    const sourceCreatedM = this.getSourceCreatedBoardIndex(pendingMove)
    const linePreview = Multiverse.getLine(this.multiverse, pendingMove.from.l)
    const createdBoard = linePreview?.boards[sourceCreatedM]
    if (! createdBoard) return false

    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.from.l, sourceCreatedM)
    this.renderBoard(createdBoard, pendingMove.from.l, sourceCreatedM, true, true, {
      activeProgress: 1,
      temporaryProgress: progress,
      temporaryPreset: ButtonColors.FiveD,
      pos: Vec2.mix(fromPos, toPos, progress),
      animatedLayer: true,
      basePlayer: pendingMove.from.m % 2,
    })
    return true
  }

  private renderPendingCreatedBoard(pendingMove: PendingMove, progress: number): boolean {
    const linePreview = Multiverse.getLine(this.multiverse, pendingMove.created.l)
    const createdBoard = linePreview?.boards[pendingMove.created.m]
    if (! createdBoard) return false

    const [fromPos] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
      : [fromPos]
    this.renderBoard(createdBoard, pendingMove.created.l, pendingMove.created.m, true, true, {
      activeProgress: 1,
      temporaryProgress: pendingMove.is5D ? 1 : progress,
      temporaryPreset: pendingMove.is5D ? ButtonColors.FiveD : ButtonColors.Yellow,
      alpha: pendingMove.is5D ? progress : 1,
      pos: Vec2.mix(startPos, toPos, progress),
      animatedLayer: true,
      basePlayer: pendingMove.from.m % 2,
    })
    return true
  }

  private getSourceCreatedBoardIndex(pendingMove: PendingMove): number {
    return pendingMove.from.m + 1
  }

  private getPendingMoveSourceCreatedBoard(pendingMove: PendingMove): { l: number, m: number } {
    return pendingMove.is5D
      ? {
          l: pendingMove.from.l,
          m: this.getSourceCreatedBoardIndex(pendingMove),
        }
      : pendingMove.created
  }

  private followPendingBoardAnimation(pendingMove: PendingMove, progress: number) {
    if (! this.moveAnimation) return
    if (this.moveAnimation.viewportFollowDisabled) return
    if (pendingMove.isPass) return

    const [fromPos, fromSize] = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
      : [fromPos]
    const followCenter = Vec2.add(Vec2.mix(startPos, toPos, progress), Vec2.scale(fromSize, 0.5))
    const center = Vec2.mix(this.moveAnimation.cameraCenter, followCenter, progress)
    this.setViewportImmediate({
      center,
    }, {
      viewport: this.getMoveAnimationViewportRect(pendingMove),
    })
  }

  private followTravelAnimationViewport(pendingMove: PendingMove, progress: number) {
    if (! this.moveAnimation) return
    if (this.moveAnimation.viewportFollowDisabled) return
    if (! this.showMoveTravelAnimation) return

    const sourceOldRect = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const targetOldRect = this.layout.getBoardRect(
      pendingMove.move.to.l,
      Coord.boardIndex(pendingMove.move.to, this.player),
    )
    const sourceNewRect = this.layout.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1)
    const targetNewRect = this.layout.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const sourceOldCenter = Rect.center(sourceOldRect)
    const targetOldCenter = Rect.center(targetOldRect)
    const sourceNewCenter = Rect.center(sourceNewRect)
    const targetNewCenter = Rect.center(targetNewRect)
    const { widthCss, heightCss } = this.renderer.getScreen()
    const targetScale = getMoveTravelTargetScale(this.moveAnimation.cameraScale, [
      sourceOldRect,
      targetOldRect,
    ], [widthCss, heightCss], Sizes.BoardWidth / 2)
    const scale = Scalar.lerp(this.moveAnimation.cameraScale, targetScale, progress)
    const center: Vec2 = [
      Scalar.lerp(
        this.moveAnimation.cameraCenter[0],
        (sourceOldCenter[0] + targetOldCenter[0]) / 2,
        progress,
      ),
      Scalar.lerp(
        this.moveAnimation.cameraCenter[1],
        (sourceNewCenter[1] + targetNewCenter[1]) / 2,
        progress,
      ),
    ]

    this.setViewportImmediate({
      scale,
      center,
    }, {
      viewport: this.getMoveAnimationViewportRect(pendingMove),
    })
  }

  private getMoveTravelPathProgress(pendingMove: PendingMove, progress: number): number {
    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return progress
    return CubicBezier.tAtDistanceProgress(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      progress,
      Sizes.MoveArrowCurveSamples,
    )
  }

  private renderTravelPiece(pendingMove: PendingMove, progress: number, alpha: number) {
    if (alpha <= 0) return
    if (! this.showMoveTravelAnimation) return

    const sourceBoard = Multiverse.getBoard(
      pendingMove.multiverseBefore,
      pendingMove.move.from,
      this.player,
    )
    if (! sourceBoard) return

    const piece = Board.getPiece(pendingMove.move.from, sourceBoard)
    if (piece === Piece.E) return

    const geometry = this.getMoveArrowGeometry(pendingMove.move, this.player)
    if (! geometry) return

    const center = CubicBezier.point(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
      progress,
    )
    this.renderPiece(
      piece,
      Vec2.sub(center, Vec2.scale(Sizes.PieceSize, 0.5)),
      RenderLayer.AnimatedPiece,
      alpha,
    )
  }

  private isTemporaryBoard(l: number, m: number): boolean {
    return this.pendingMoves.some(pendingMove => this.isTemporaryBoardOfPendingMove(pendingMove, l, m))
  }

  private getTemporaryBoardPreset(l: number, m: number): ButtonColorPreset | undefined {
    const pendingMove = this.pendingMoves.find(pendingMove => (
      this.isTemporaryBoardOfPendingMove(pendingMove, l, m)
    ))
    if (! pendingMove) return undefined
    return pendingMove.is5D ? ButtonColors.FiveD : ButtonColors.Yellow
  }

  private isTemporaryBoardOfPendingMove(pendingMove: PendingMove, l: number, m: number): boolean {
    if (pendingMove.created.l === l && pendingMove.created.m === m) return true
    return pendingMove.is5D
      && pendingMove.from.l === l
      && this.getSourceCreatedBoardIndex(pendingMove) === m
  }

  private getBoardFocusPulseProgress(l: number, m: number): number {
    if (! this.boardFocusPulse) return 0
    if (this.boardFocusPulse.l !== l || this.boardFocusPulse.m !== m) return 0

    const now = performance.now()
    const elapsed = now - this.boardFocusPulse.startedAt
    const attackDuration = Animations.BoardFocusPulseDuration / 2
    const boundMotion = (
      this.boardFocusPulse.motionId !== null
      && this.cameraMotion?.id === this.boardFocusPulse.motionId
    )
      ? this.cameraMotion
      : null
    const shouldHoldForMotion = (
      boundMotion !== null
      && ! this.isCameraMotionVisuallySettled(boundMotion)
    )

    if (elapsed < attackDuration) {
      return Easing.easeInOut(elapsed / attackDuration)
    }
    if (shouldHoldForMotion) {
      this.boardFocusPulse.heldForMotion = true
      return 1
    }
    if (this.boardFocusPulse.heldForMotion) {
      this.boardFocusPulse.releaseStartedAt ??= now
      const releaseProgress = (now - this.boardFocusPulse.releaseStartedAt)
        / Animations.BoardFocusPulseReleaseDuration
      if (releaseProgress >= 1) {
        this.boardFocusPulse = null
        return 0
      }
      return 1 - Easing.easeInOut(releaseProgress)
    }

    const releaseProgress = (elapsed - attackDuration)
      / (Animations.BoardFocusPulseDuration - attackDuration)
    if (releaseProgress >= 1) {
      this.boardFocusPulse = null
      return 0
    }
    return 1 - Easing.easeInOut(releaseProgress)
  }

  private isCameraMotionVisuallySettled(motion: CameraMotion): boolean {
    const camera = this.renderer.getCamera()
    return Vec2.length(Vec2.sub(camera.center, motion.targetCenter)) <= Animations.BoardFocusPulseSettleDistance
      && Math.abs(camera.scale - motion.targetScale) <= Animations.BoardFocusPulseSettleScale
  }

  private renderBoard(
    board: Board,
    l: number,
    m: number,
    isActive: boolean,
    isTemporary: boolean,
    options: BoardRenderOptions = {},
  ) {
    const boardPlayer = options.basePlayer ?? m % 2
    const [[boardRectX, boardRectY]] = this.layout.getBoardRect(l, m)
    const [borderX, borderY] = options.pos ?? [boardRectX, boardRectY]
    const x0 = borderX + Sizes.BoardBorder
    const y0 = borderY + Sizes.BoardBorder
    const baseBorderColor = boardPlayer === Player.B ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
    const baseActiveBorderFill = boardPlayer === Player.B ? Colors.BoardBorderBlackDim : Colors.BoardBorderWhiteDim
    const temporaryProgress = options.temporaryProgress ?? (isTemporary ? 1 : 0)
    const temporaryPreset = options.temporaryPreset ?? ButtonColors.Yellow
    const alpha = options.alpha ?? 1
    const pendingCheckPreset = this.isPendingCheckBoard(l, m) ? ButtonColors.Red : null
    const borderColorBase = pendingCheckPreset?.border
      ?? Color4.mix(baseBorderColor, temporaryPreset.border, temporaryProgress)
    const activeBorderFillBase = pendingCheckPreset?.fill
      ?? Color4.mix(baseActiveBorderFill, temporaryPreset.fill, temporaryProgress)
    const borderColor = Color4.withAlpha(borderColorBase, alpha)
    const activeBorderFill = Color4.withAlpha(activeBorderFillBase, alpha)
    const explicitActiveProgress = options.activeProgress
    const boardActivationProgress = explicitActiveProgress === undefined
      ? this.getBoardActivationProgress(l, m, isActive)
      : null
    const activeProgress = pendingCheckPreset
      ? 1
      : (boardActivationProgress ?? explicitActiveProgress ?? (isActive ? 1 : 0))
    const activeBorder = Sizes.ActiveBoardBorder * activeProgress
    const outerBorder = Sizes.BoardBorder + activeBorder
    const outerBorderPos: Vec2 = [x0 - outerBorder, y0 - outerBorder]
    const outerBorderSize: Vec2 = [
      Sizes.BoardWidth + outerBorder * 2,
      Sizes.BoardWidth + outerBorder * 2,
    ]
    const innerBorderRadius = Scalar.lerp(Sizes.BoardBorderRadius, Sizes.ActiveBoardBorderRadius, activeProgress)
    const outerBorderRadius = innerBorderRadius + Sizes.BoardBorder * activeProgress
    const boardFrame: BoardFrame = {
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
    }

    const layers = getBoardRenderLayers(options.animatedLayer === true)

    this.renderBoardShadow(boardFrame, layers, alpha)

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer: layers.border,
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
      fill: borderColor,
      stroke: null,
    })

    if (activeProgress > 0) {
      this.renderer.submit({
        type: RenderItemType.RoundRect,
        layer: layers.border,
        pos: [
          x0 - activeBorder,
          y0 - activeBorder,
        ],
        size: [
          Sizes.BoardWidth + activeBorder * 2,
          Sizes.BoardWidth + activeBorder * 2,
        ],
        radius: innerBorderRadius,
        fill: Color4.withAlpha(activeBorderFill, activeProgress),
        stroke: null,
      })
    }

    for (const [x, y] of Coord.spacelikes()) {
      const coord = { x, y }
      const pos = this.getSquarePos(x0, y0, coord)
      const isWhiteSquare = (x + y) % 2 === 0
      const moveHighlightColor = this.getMoveFormationHighlightColor(board, coord, isWhiteSquare)
      const baseColor = this.isHighlightedBoardSquare(l, m, coord)
        ? (isWhiteSquare ? Colors.BoardHighlightWhite : Colors.BoardHighlightBlack)
        : moveHighlightColor
          ? moveHighlightColor
        : (isWhiteSquare ? Colors.BoardWhite : Colors.BoardBlack)
      const color = Color4.withAlpha(baseColor, alpha)

      this.renderer.submit({
        type: RenderItemType.Quad,
        layer: layers.board,
        mat: Mat3.transform(pos, Sizes.PieceSize),
        color,
      })

      const piece = board.pieces[x][y]
      if (piece !== Piece.E) this.renderPiece(piece, pos, layers.piece, alpha)
      if (this.shouldRenderPieceGhost(l, m, coord)) this.renderPieceGhost(this.selectedPiece!.piece, pos)
    }

    this.renderSpacelikeLabels(x0, y0, layers.board, alpha)
    this.renderBoardFocusMask(l, m, boardPlayer, [x0, y0], alpha)
    this.renderMoveFormationArrow(board, alpha)
    this.renderCheckBadge(l, m, [x0, y0], alpha)
  }

  private renderSpacelikeLabels(x0: number, y0: number, layer: RenderLayer, alpha: number) {
    const labelAlpha = this.getSpacelikeLabelAlpha() * alpha
    if (labelAlpha <= 0) return

    for (let displayX = 0; displayX < 8; displayX ++) {
      const displayCoord = { x: displayX, y: 7 }
      const boardCoord = this.toBoardCoord(displayCoord)
      const isWhiteSquare = (boardCoord.x + boardCoord.y) % 2 === 0
      this.renderer.submit({
        type: RenderItemType.Text,
        layer,
        order: 1,
        pos: [
          x0 + displayCoord.x * Sizes.PieceWidth + Sizes.SpacelikeLabelInset,
          y0 + (displayCoord.y + 1) * Sizes.PieceWidth - Sizes.SpacelikeLabelInset,
        ],
        angle: 0,
        text: 'abcdefgh'[boardCoord.x],
        fontSize: Sizes.SpacelikeLabelFontSize,
        color: Color4.withAlpha(
          isWhiteSquare ? Colors.BoardBlack : Colors.BoardWhite,
          labelAlpha,
        ),
        align: 'left',
        baseline: 'bottom',
      })
    }

    for (let displayY = 0; displayY < 8; displayY ++) {
      const displayCoord = { x: 7, y: displayY }
      const boardCoord = this.toBoardCoord(displayCoord)
      const isWhiteSquare = (boardCoord.x + boardCoord.y) % 2 === 0
      this.renderer.submit({
        type: RenderItemType.Text,
        layer,
        order: 1,
        pos: [
          x0 + (displayCoord.x + 1) * Sizes.PieceWidth - Sizes.SpacelikeLabelInset,
          y0 + displayCoord.y * Sizes.PieceWidth + Sizes.SpacelikeLabelInset,
        ],
        angle: 0,
        text: String(8 - boardCoord.y),
        fontSize: Sizes.SpacelikeLabelFontSize,
        color: Color4.withAlpha(
          isWhiteSquare ? Colors.BoardBlack : Colors.BoardWhite,
          labelAlpha,
        ),
        align: 'right',
        baseline: 'top',
      })
    }
  }

  private getSpacelikeLabelAlpha(): number {
    const scale = this.renderer.getCamera().scale
    const progress = Scalar.clamp(
      (scale - LabelVisibility.SpacelikeScaleStart)
      / (LabelVisibility.SpacelikeScaleEnd - LabelVisibility.SpacelikeScaleStart),
      0,
      1,
    )
    return Easing.easeInOut(progress)
  }

  private getSquarePos(x0: number, y0: number, coord: CoordSpacelike): Vec2 {
    const displayCoord = this.toDisplayCoord(coord)
    return [
      x0 + displayCoord.x * Sizes.PieceWidth,
      y0 + displayCoord.y * Sizes.PieceWidth,
    ]
  }

  private toDisplayCoord(coord: CoordSpacelike): CoordSpacelike {
    return this.viewPlayer === Player.W
      ? coord
      : {
          x: 7 - coord.x,
          y: 7 - coord.y,
        }
  }

  private toBoardCoord(displayCoord: CoordSpacelike): CoordSpacelike {
    return this.toDisplayCoord(displayCoord)
  }

  private renderBoardFocusMask(l: number, m: number, boardPlayer: Player, pos: Vec2, alpha: number) {
    const focusPulse = this.getBoardFocusPulseProgress(l, m)
    if (focusPulse <= 0) return

    const focusPreset = boardPlayer === Player.B ? ButtonColors.GreenBlack : ButtonColors.GreenWhite
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.MoveHighlight,
      order: -1,
      mat: Mat3.transform(pos, Sizes.BoardSize),
      color: Color4.withAlpha(
        focusPreset.fill,
        alpha * focusPulse * Animations.BoardFocusMaskAlpha,
      ),
    })
  }

  private renderCheckBadge(l: number, m: number, boardPos: Vec2, alpha: number) {
    if (! this.isCheckWarningBoard(l, m)) return

    const center = this.getCheckBadgeCenter(l, m, boardPos)
    const hovered = this.hoverCheckWarning?.l === l && this.hoverCheckWarning.m === m
    const fill = hovered ? Colors.CheckBadgeHover : Colors.CheckBadgeFill
    const stroke = hovered ? Colors.CheckBadgeHover : Colors.CheckBadgeBorder

    this.renderer.submit({
      type: RenderItemType.Circle,
      layer: RenderLayer.UI,
      center,
      radius: Sizes.CheckBadgeRadius,
      fill: Color4.withAlpha(fill, alpha),
      stroke: Color4.withAlpha(stroke, alpha),
      strokeWidth: 2,
    })
    this.renderer.submit({
      type: RenderItemType.Text,
      layer: RenderLayer.UI,
      pos: [center[0], center[1] + 0.5],
      angle: 0,
      text: '!',
      fontSize: Sizes.CheckBadgeFontSize,
      color: Color4.withAlpha(Colors.CheckBadgeText, alpha),
      align: 'center',
      baseline: 'middle',
    })
  }

  private getCheckBadgeCenter(l: number, m: number, boardContentPos?: Vec2): Vec2 {
    const contentPos = boardContentPos ?? Vec2.add(this.layout.getBoardRect(l, m)[0], [
      Sizes.BoardBorder,
      Sizes.BoardBorder,
    ])
    return [
      contentPos[0] + Sizes.BoardWidth + Sizes.CheckBadgeOffset,
      contentPos[1] - Sizes.CheckBadgeOffset,
    ]
  }

  private getMoveFormationHighlightColor(
    board: Board,
    coord: CoordSpacelike,
    isWhiteSquare: boolean,
  ): Color4 | null {
    const move = board.createdBy
    if (! move || ! board.createdByRole) return null

    const is5DMove = ! Coord.isSameBoard(move.from, move.to)
    const highlightsSource = (
      (board.createdByRole === 'source' || board.createdByRole === 'both')
      && Coord.isSameSpace(move.from, coord)
    )
    const highlightsTarget = (
      (board.createdByRole === 'target' || board.createdByRole === 'both')
      && Coord.isSameSpace(move.to, coord)
    )
    if (! highlightsSource && ! highlightsTarget) return null

    if (is5DMove) return isWhiteSquare ? Colors.MoveHighlight5DWhite : Colors.MoveHighlight5DBlack
    return isWhiteSquare ? Colors.MoveHighlight2DWhite : Colors.MoveHighlight2DBlack
  }

  private renderMoveFormationArrow(board: Board, alpha = 1) {
    if (this.selectedPiece) return

    const move = board.createdBy
    const player = board.createdByPlayer
    if (! move || player === null || board.createdByRole !== 'target') return
    if (Coord.isSameBoard(move.from, move.to)) return

    this.renderMoveArrow(move, player, alpha, board.createdByOrder ?? 0)
  }

  private renderMoveArrow(move: Move, player: Player, alpha = 1, order = 0) {
    const geometry = this.getMoveArrowGeometry(move, player)
    if (! geometry) return

    const stroke = player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    this.renderArrowPolygon(
      geometry,
      Colors.MoveArrowFill,
      stroke,
      alpha,
      order,
    )
  }

  private renderPendingCheckArrows(boardPositions?: ReadonlyMap<string, Vec2>) {
    for (let i = 0; i < this.pendingChecks.length; i += 1) {
      const check = this.pendingChecks[i]
      const geometry = this.getCheckArrowGeometry(check, boardPositions)
      if (! geometry) continue

      const stroke = check.attackingPlayer === Player.W
        ? Colors.BoardBorderWhite
        : Colors.BoardBorderBlack
      const isInsideBoard = check.fromBoard.l === check.toBoard.l
        && check.fromBoard.m === check.toBoard.m
      this.renderArrowPolygon(
        geometry,
        Colors.CheckArrowFill,
        stroke,
        1,
        (isInsideBoard ? 11000 : 10000) + i,
        RenderLayer.CheckArrow,
      )
    }
  }

  private renderArrowPolygon(
    geometry: MoveArrowGeometry,
    fill: Color4,
    stroke: Color4,
    alpha: number,
    order: number,
    layer = RenderLayer.MoveHighlight,
  ) {
    const points = geometry.straight === true
      ? getStraightMoveArrowPolygon(geometry.from, geometry.to)
      : getMoveArrowPolygon(
        geometry.from,
        geometry.control1,
        geometry.control2,
        geometry.to,
      )
    if (points.length === 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer,
      order,
      points,
      fill: getMoveArrowMaskFill(
        Color4.withAlpha(fill, alpha),
        geometry.from,
        geometry.control1,
      ),
      stroke: getMoveArrowMaskFill(
        Color4.withAlpha(stroke, alpha),
        geometry.from,
        geometry.control1,
      ),
      strokeWidth: Sizes.MoveArrowStrokeWidth,
    })
  }

  private getMoveArrowGeometry(move: Move, player: Player): MoveArrowGeometry | null {
    if (Coord.isSameBoard(move.from, move.to)) return null

    const fromM = Coord.boardIndex(move.from, player)
    const toM = Coord.boardIndex(move.to, player)
    const from = this.getVisibleSquareCenter(move.from.l, fromM, move.from)
    const to = this.getVisibleSquareCenter(move.to.l, toM, move.to)
    return this.getCurvedArrowGeometry(from, to, player)
  }

  private getCheckArrowGeometry(
    check: PendingCheck,
    boardPositions?: ReadonlyMap<string, Vec2>,
  ): MoveArrowGeometry | null {
    const from = this.getCheckArrowSquareCenter(
      check.fromBoard.l,
      check.fromBoard.m,
      check.move.from,
      boardPositions,
    )
    const to = this.getCheckArrowSquareCenter(
      check.toBoard.l,
      check.toBoard.m,
      check.move.to,
      boardPositions,
    )

    if (check.fromBoard.l === check.toBoard.l && check.fromBoard.m === check.toBoard.m) {
      const direction = Vec2.sub(to, from)
      return {
        from,
        control1: Vec2.add(from, Vec2.scale(direction, 0.35)),
        control2: Vec2.add(from, Vec2.scale(direction, 0.65)),
        to,
        straight: true,
      }
    }

    return this.getCurvedArrowGeometry(from, to, check.attackingPlayer)
  }

  private getCheckArrowSquareCenter(
    l: number,
    m: number,
    coord: CoordSpacelike,
    boardPositions?: ReadonlyMap<string, Vec2>,
  ): Vec2 {
    const boardPos = boardPositions?.get(this.getBoardKey(l, m))
    if (! boardPos) return this.getVisibleSquareCenter(l, m, coord)

    return this.getVisibleSquareCenterAtBoardPos(boardPos, coord)
  }

  private getVisibleSquareCenter(l: number, m: number, coord: CoordSpacelike): Vec2 {
    const [boardPos] = this.layout.getBoardRect(l, m)
    return this.getVisibleSquareCenterAtBoardPos(boardPos, coord)
  }

  private getVisibleSquareCenterAtBoardPos(boardPos: Vec2, coord: CoordSpacelike): Vec2 {
    const displayCoord = this.toDisplayCoord(coord)
    return Vec2.add(boardPos, [
      Sizes.BoardBorder + (displayCoord.x + 0.5) * Sizes.PieceWidth,
      Sizes.BoardBorder + (displayCoord.y + 0.5) * Sizes.PieceWidth,
    ])
  }

  private getCurvedArrowGeometry(from: Vec2, to: Vec2, player: Player): MoveArrowGeometry | null {
    const horizontal = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1])
    const direction = Vec2.sub(to, from)
    if (Vec2.length(direction) === 0) return null

    const playerBendDirection = player === Player.W ? 1 : -1
    const bend = Vec2.scale(
      horizontal
        ? [0, direction[0] >= 0 ? -1 : 1]
        : [direction[1] >= 0 ? 1 : -1, 0],
      Sizes.MoveArrowCurveOffset * playerBendDirection,
    )
    const control1 = Vec2.add(Vec2.add(from, Vec2.scale(direction, 0.35)), bend)
    const control2 = Vec2.add(Vec2.add(from, Vec2.scale(direction, 0.65)), bend)

    return { from, control1, control2, to }
  }

  private isHighlightedBoardSquare(l: number, m: number, coord: CoordSpacelike): boolean {
    if (this.hoverSquare && isSameLocatedSquare(this.hoverSquare, l, m, coord)) return true

    const selection = this.selectedPiece ?? this.hoverPiece
    if (! selection) return false
    if (selection.l === l && selection.m === m && Coord.isSameSpace(selection.from, coord)) return true
    return selection.targets.some(target => this.isTargetAt(target, l, m, coord, selection.player))
  }

  private shouldRenderPieceGhost(l: number, m: number, coord: CoordSpacelike): boolean {
    if (! this.selectedPiece || ! this.hoverSquare) return false
    if (! this.canControlTurn() || this.selectedPiece.player !== this.player) return false
    if (! isSameLocatedSquare(this.hoverSquare, l, m, coord)) return false
    return this.selectedPiece.targets.some(target => (
      this.isTargetAt(target, l, m, coord, this.selectedPiece!.player)
    ))
  }

  private isTargetAt(target: Coord, l: number, m: number, coord: CoordSpacelike, player: Player): boolean {
    return target.l === l
      && Coord.boardIndex(target, player) === m
      && Coord.isSameSpace(target, coord)
  }

  private renderBoardShadow(
    frame: BoardFrame,
    layers = getBoardRenderLayers(false),
    alpha = 1,
  ) {
    const pos = Vec2.add(frame.pos, Sizes.BoardShadowOffset)
    const size = frame.size
    this.renderBoardShadowRect([pos, size], frame.radius, layers.shadowBase, alpha)

    this.renderBoardShadowRect(
      [
        Vec2.add(pos, [Sizes.ShadowShrink, 0]),
        Vec2.add(size, [-Sizes.ShadowShrink, -Sizes.ShadowShrink]),
      ],
      frame.radius,
      layers.shadowHigh,
      alpha,
    )
  }

  private renderBoardShadowRect([pos, size]: Rect, radius: number, layer: RenderLayer, alpha = 1) {
    if (size[0] <= 0 || size[1] <= 0) return

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer,
      pos,
      size,
      radius,
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })
  }

  private renderPiece(piece: Piece, pos: Vec2, layer: RenderLayer = RenderLayer.Piece, alpha = 1) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer,
      mat: Mat3.transform(pos, Sizes.PieceSize),
      textureId: PIECE_TO_TEXTURE_ID.get(piece)!,
      alpha,
    })
  }

  private renderPieceGhost(piece: Piece, pos: Vec2) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer: RenderLayer.PieceGhost,
      mat: Mat3.transform(pos, Sizes.PieceSize),
      textureId: PIECE_TO_TEXTURE_ID.get(piece)!,
      alpha: PIECE_GHOST_ALPHA,
    })
  }
}

const isActionPrefix = (prefix: Action[], actions: Action[]): boolean => {
  if (prefix.length > actions.length) return false

  for (let i = 0; i < prefix.length; i += 1) {
    if (! Action.isSame(prefix[i]!, actions[i]!)) return false
  }
  return true
}
