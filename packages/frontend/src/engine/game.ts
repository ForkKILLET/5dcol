import { Board, Player, Players as CorePlayers, Coord, FiveDPGN, GameState as CoreGameState, Line, Multiverse, Piece, Pieces, type Action, type CoordSpacelike, type Move } from '@5dcol/core'
import { Disposable, Effect, Empty } from '@/utils'
import { Color4, CubicBezier, Mat3, Rect, Scalar, Vec2, type Camera } from '@engine/basic'
import { getBoardRenderLayers } from '@engine/board'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, RenderLayer, Sizes, Animations } from '@engine/constant'
import { Easing } from '@engine/easing'
import { isSameLocatedSquare, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState, type PendingMove, type StoredGameState } from '@engine/gameState'
import { GameLayout, type ViewportInsets } from '@engine/layout'
import { LinePainter } from '@engine/painters/linePainter'
import { type Logger } from '@engine/logger'
import { getMoveArrowMaskFill, getMoveArrowPolygon } from '@engine/moveArrow'
import { PresentPainter } from '@engine/painters/presentPainter'
import { buildGameRecordActions, type GameRecordAction } from '@engine/record'
import { type Renderer, RenderItemType } from '@engine/renderer'
import { PIECE_TO_TEXTURE_ID } from '@engine/texture'
import { TimelineTilesPainter } from '@engine/painters/timelineTilesPainter'
import { getMoveTravelTargetScale, getScaleToContainRects } from '@engine/viewport'
import {
  getPlayerButtonColor,
  getUndoMoveButtonColor,
  isPrimaryGameToolbarButton,
  toToolbarButtonView,
  type ButtonConfig,
  type GameToolbarButton,
} from '@engine/toolbar'

export type { GameToolbarButton } from '@engine/toolbar'
export type { GameRecordAction, GameRecordMoveSegment } from '@engine/record'

export interface GameConfig {
  debug: boolean
  logger: Logger
  renderer: Renderer
  onToolbarChange?: (buttons: GameToolbarButton[]) => void
  onRecordChange?: (request: GameExportRequest) => void
  onImportRequest?: () => void
  onExportRequest?: (request: GameExportRequest) => void
}

export interface GameExportRequest {
  text: string
  hasPendingMoves: boolean
  currentActionIndex: number
  actions: GameRecordAction[]
}

interface PointerState {
  screen: Vec2
  dragStartScreen: Vec2 | null
  dragLastScreen: Vec2 | null
  dragExceeded: boolean
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
}
interface BoardFocusPulse {
  l: number
  m: number
  startedAt: number
  motionId: number | null
  heldForMotion: boolean
  releaseStartedAt: number | null
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
}
const POINTER_CLICK_THRESHOLD = 3
const PIECE_GHOST_ALPHA = 0.45

export class Game extends Disposable(Empty) {
  constructor(public readonly config: GameConfig) {
    super()
    this.logger = config.logger
    this.renderer = config.renderer
    this.layout = new GameLayout(config.renderer)
    this.presentPainter = new PresentPainter(config.renderer, this.layout)
    this.timelineTilesPainter = new TimelineTilesPainter(config.renderer, this.layout)
    this.linePainter = new LinePainter(config.renderer, this.layout)
  }

  public readonly logger: Logger
  public readonly renderer: Renderer
  public readonly layout: GameLayout
  public readonly presentPainter: PresentPainter
  public readonly timelineTilesPainter: TimelineTilesPainter
  public readonly linePainter: LinePainter

  private multiverseCommitted = Multiverse.createInitial()
  private multiverse = this.multiverseCommitted
  private player: Player = Player.W
  private actionIndex = 0
  private actions: Action[] = []
  private readonly pointer: PointerState = {
    screen: [0, 0],
    dragStartScreen: null,
    dragLastScreen: null,
    dragExceeded: false,
  }
  private cameraMotion: CameraMotion | null = null
  private selectedPiece: PieceSelection | null = null
  private hoverSquare: SquareHover | null = null
  private hoverPiece: PieceSelection | null = null
  private pendingMove: PendingMove | null = null
  private pendingMoves: PendingMove[] = []
  private moveAnimation: MoveAnimation | null = null
  private boardFocusPulse: BoardFocusPulse | null = null
  private submitRequestedDuringMoveAnimation = false
  private toolbarSignature = ''
  private recordSignature = ''
  private gameInputDisabled = false
  private cameraMotionId = 0

  private animationFrame: number | null = null
  private resizeDirty = false

  public start() {
    const restored = this.restoreGameState()
    this.renderer.start()
    if (restored) this.focusCurrentPresent({ smooth: false })
    else this.focusInitialTurn({ smooth: false })
    this.bindEvents()
    this.syncToolbarButtons()
    this.syncRecord()
    this.animationFrame = requestAnimationFrame(this.loop)
    this.collect(() => {
      if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
      this.renderer.dispose()
    })
    this.logger.info('Game started')
  }

  public setGameInputDisabled(disabled: boolean) {
    if (this.gameInputDisabled === disabled) return

    this.gameInputDisabled = disabled
    if (! disabled) return

    this.hoverSquare = null
    this.hoverPiece = null
    this.clearPointerDrag()
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
      const actionIndex = Scalar.clamp(Math.floor(state.actionIndex), 0, actions.length)
      const pendingMoveMoves = state.pendingMoves.map(pendingMove => pendingMove.move)
      const coreState = CoreGameState.create(actions.slice(0, actionIndex), pendingMoveMoves)

      this.multiverseCommitted = coreState.multiverseCommitted
      this.player = coreState.player
      this.actionIndex = coreState.actionIndex
      this.actions = actions
      this.fillMissingMoveOrders(this.multiverseCommitted, this.getCommittedMoveOrderBase())
      const preview = this.createPendingMoves(pendingMoveMoves)
      this.pendingMoves = preview.pendingMoves
      this.multiverse = preview.multiverse
      this.pendingMove = this.pendingMoves.at(-1) ?? null
      this.moveAnimation = null
      this.submitRequestedDuringMoveAnimation = false
      this.deselectPiece()
      return true
    }
    catch {
      this.clearStoredGameState()
      return false
    }
  }

  private persistGameState() {
    const storage = getLocalStorage()

    const state: StoredGameState = {
      version: 1,
      actions: this.actions,
      multiverseCommitted: this.multiverseCommitted,
      multiverse: this.multiverse,
      player: this.player,
      actionIndex: this.actionIndex,
      pendingMoves: this.pendingMoves,
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
  }

  private clearStoredGameState() {
    const storage = getLocalStorage()
    if (! storage) return

    try {
      storage.removeItem(GAME_STORAGE_KEY)
    }
    catch {
      // Ignore storage cleanup failures; gameplay state should still reset in memory.
    }
  }

  private restartGame() {
    this.multiverseCommitted = Multiverse.createInitial()
    this.multiverse = this.multiverseCommitted
    this.player = Player.W
    this.actionIndex = 0
    this.actions = []
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.moveAnimation = null
    this.submitRequestedDuringMoveAnimation = false
    this.cameraMotion = null
    this.clearPointerDrag()
    this.clearStoredGameState()
    this.persistGameState()
    this.focusInitialTurn()
  }

  private bindEvents() {
    this.collect(Effect.useListener(window, 'resize', () => {
      this.resizeDirty = true
    }))

    this.collect(Effect.useListener(window, 'mousemove', e => {
      if (this.gameInputDisabled) return
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      this.updatePointerDragExceeded(screen)
      this.panByPointerDrag(screen)
    }))

    this.collect(Effect.useListener(window, 'mousedown', e => {
      if (this.gameInputDisabled) return
      if (e.button !== 0) return
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      this.pointer.dragStartScreen = screen
      this.pointer.dragLastScreen = screen
      this.pointer.dragExceeded = false
    }))

    this.collect(Effect.useListener(window, 'mouseup', e => {
      if (this.gameInputDisabled) {
        this.clearPointerDrag()
        return
      }

      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      if (! this.pointer.dragExceeded) this.handleBoardClick(screen)
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'mouseleave', () => {
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'blur', () => {
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'contextmenu', e => {
      if (this.gameInputDisabled) return
      e.preventDefault()
      if (! this.isMoveAnimating()) this.deselectPiece()
      this.clearPointerDrag()
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

  private panByPointerDrag(screen: Vec2) {
    const lastScreen = this.pointer.dragLastScreen
    if (! lastScreen) return

    const worldLast = this.renderer.screenToWorld(lastScreen)
    const worldCurrent = this.renderer.screenToWorld(screen)
    const delta = Vec2.sub(worldCurrent, worldLast)
    const camera = this.renderer.getCamera()

    this.setViewportImmediate({
      center: Vec2.sub(camera.center, delta),
    }, {
      viewport: this.layout.getRenderViewportRect(this.multiverse),
    })
    this.pointer.dragLastScreen = screen
  }

  private updatePointerDragExceeded(screen: Vec2) {
    const start = this.pointer.dragStartScreen
    if (! start) return
    if (Vec2.length(Vec2.sub(screen, start)) > POINTER_CLICK_THRESHOLD) {
      this.pointer.dragExceeded = true
    }
  }

  private clearPointerDrag() {
    this.pointer.dragStartScreen = null
    this.pointer.dragLastScreen = null
    this.pointer.dragExceeded = false
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.gameInputDisabled || e.repeat || isTextInputEvent(e)) return

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
    }
  }

  private panCameraByKeyboard(direction: Vec2) {
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

    const viewport = options.viewport ?? this.layout.getValidViewportRect(this.multiverse)
    const targetCenter = camera.center ?? this.renderer.getCamera().center
    this.renderer.setCamera({
      center: viewport ? this.layout.clampCameraCenterToViewport(targetCenter, viewport) : targetCenter,
    })
    this.syncCameraMotion()
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
    this.render()
    this.renderer.flush()
    this.finalizeSubmittedMoveAfterAnimation()
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
    if (this.config.debug) {
      this.renderPointer()
    }
  }

  private updateInteraction() {
    if (this.isMoveAnimating()) {
      this.hoverSquare = null
      this.hoverPiece = null
      this.syncToolbarButtons()
      return
    }

    const hit = this.getBoardSquareAtScreen(this.pointer.screen)
    this.hoverSquare = hit ? { l: hit.l, m: hit.m, coord: hit.coord } : null
    const playableHit = this.getPlayableBoardSquareAtScreen(this.pointer.screen)
    this.hoverPiece = this.selectedPiece || ! playableHit ? null : this.getPieceSelectionFromHit(playableHit)
    this.syncToolbarButtons()
  }

  private getToolbarButtons(): ButtonConfig[] {
    const leftButton: ButtonConfig = this.selectedPiece
      ? {
          id: 'deselect-piece',
          disabled: this.isMoveAnimating(),
          colorPreset: ButtonColors.Board,
          turnPlayer: this.player,
          text: 'Deselect',
          piece: this.selectedPiece.piece,
          onClick: () => {
            this.deselectPiece()
          },
        }
      : {
          id: 'undo-move',
          disabled: this.pendingMoves.length === 0 || this.submitRequestedDuringMoveAnimation,
          colorPreset: getUndoMoveButtonColor(this.pendingMoves.at(-1)?.is5D ?? false),
          turnPlayer: this.player,
          text: 'Undo Move',
          piece: null,
          onClick: () => {
            this.undoMove()
          },
        }

    return [
      leftButton,
      {
        id: 'submit-moves',
        disabled: ! this.canSubmitMoves() || this.submitRequestedDuringMoveAnimation,
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        text: 'Submit Moves',
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
        text: 'Restart',
        piece: null,
        onClick: () => {
          this.restartGame()
        },
      },
      {
        id: 'import-5dpgn',
        disabled: this.isMoveAnimating(),
        colorPreset: getPlayerButtonColor(this.player),
        turnPlayer: this.player,
        text: 'Import',
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
        text: 'Export',
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
    this.syncToolbarButtons()
    return true
  }

  public getToolbarButtonViews(): GameToolbarButton[] {
    return this.getToolbarButtons().map(button => toToolbarButtonView(button))
  }

  private syncToolbarButtons() {
    if (! this.config.onToolbarChange) return

    const buttons = this.getToolbarButtonViews()
    const signature = JSON.stringify(buttons)
    if (signature === this.toolbarSignature) return

    this.toolbarSignature = signature
    this.config.onToolbarChange(buttons)
  }

  private syncRecord() {
    if (! this.config.onRecordChange) return

    const request = this.getFiveDPGNExport()
    const signature = JSON.stringify(request)
    if (signature === this.recordSignature) return

    this.recordSignature = signature
    this.config.onRecordChange(request)
  }

  private handleBoardClick(screen: Vec2) {
    if (this.isMoveAnimating()) return
    if (this.tryCreateMoveAt(screen)) return
    this.selectPieceAt(screen)
  }

  private selectPieceAt(screen: Vec2) {
    const selection = this.getPieceSelectionAtScreen(screen)
    if (! selection) return
    this.selectedPiece = selection
  }

  private tryCreateMoveAt(screen: Vec2): boolean {
    if (! this.selectedPiece) return false

    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return false
    const target = this.selectedPiece.targets.find(target => (
      target.l === hit.l
      && Coord.boardIndex(target, this.player) === hit.m
      && Coord.isSameSpace(target, hit.coord)
    ))
    if (! target) return false

    const move: Move = {
      from: this.selectedPiece.from,
      to: target,
    }
    const multiverseBefore = this.multiverse
    const created = Multiverse.getMoveArrivalBoardIndex(move, this.player, multiverseBefore)
    const order = this.getMoveOrder(this.pendingMoves.length)
    const pendingMove: PendingMove = {
      move,
      order,
      multiverseBefore,
      is5D: ! Coord.isSameBoard(move.from, move.to),
      from: {
        l: this.selectedPiece.l,
        m: this.selectedPiece.m,
      },
      created,
    }
    this.multiverse = Multiverse.applyMove(move, this.player, multiverseBefore, order)
    this.pendingMoves.push(pendingMove)
    this.pendingMove = pendingMove
    this.moveAnimation = {
      startedAt: performance.now(),
      cameraCenter: [...this.renderer.getCamera().center],
      cameraScale: this.renderer.getCamera().scale,
    }
    this.submitRequestedDuringMoveAnimation = false
    this.selectedPiece = null
    this.persistGameState()
    return true
  }

  private undoMove() {
    if (this.submitRequestedDuringMoveAnimation) return
    if (this.pendingMoves.length === 0) return
    this.pendingMoves.pop()
    this.multiverse = this.replayPendingMoves()
    this.pendingMove = this.pendingMoves.at(-1) ?? null
    this.moveAnimation = null
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.persistGameState()
  }

  private submitMoves() {
    if (! this.canSubmitMoves()) return

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

  private finalizeSubmitMoves() {
    if (this.actionIndex < this.actions.length) {
      this.actions = this.actions.slice(0, this.actionIndex)
    }
    this.actions.push({ moves: this.pendingMoves.map(pendingMove => pendingMove.move) })
    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.pendingMoves = []
    this.moveAnimation = null
    this.submitRequestedDuringMoveAnimation = false
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
    this.persistGameState()
  }

  public importFiveDPGNText(input: string): string | null {
    try {
      this.loadCoreGameState(FiveDPGN.importGameState(input))
      this.syncToolbarButtons()
      return null
    }
    catch (error) {
      return error instanceof Error ? error.message : 'Failed to import 5dpgn'
    }
  }

  public getFiveDPGNExport(): GameExportRequest {
    return {
      text: FiveDPGN.exportGameState({ actions: this.actions }),
      hasPendingMoves: this.pendingMoves.length > 0,
      currentActionIndex: this.actionIndex,
      actions: buildGameRecordActions(this.actions),
    }
  }

  public rollbackToActionEnd(actionIndex: number) {
    if (this.isMoveAnimating()) return

    const targetActionIndex = Scalar.clamp(Math.floor(actionIndex), 0, this.actions.length)
    const state = CoreGameState.create(this.actions.slice(0, targetActionIndex))
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.moveAnimation = null
    this.submitRequestedDuringMoveAnimation = false
    this.cameraMotion = null
    this.clearPointerDrag()
    this.persistGameState()
    this.focusCurrentPresent()
    this.syncToolbarButtons()
  }

  private requestImportFiveDPGN() {
    this.config.onImportRequest?.()
  }

  private requestExportFiveDPGN() {
    this.config.onExportRequest?.(this.getFiveDPGNExport())
  }

  private loadCoreGameState(state: CoreGameState) {
    this.actions = state.actions
    this.multiverseCommitted = state.multiverseCommitted
    this.multiverse = state.multiverse
    this.player = state.player
    this.actionIndex = state.actionIndex
    this.selectedPiece = null
    this.hoverSquare = null
    this.hoverPiece = null
    this.pendingMove = null
    this.pendingMoves = []
    this.moveAnimation = null
    this.submitRequestedDuringMoveAnimation = false
    this.cameraMotion = null
    this.clearPointerDrag()
    this.persistGameState()
    this.focusCurrentPresent()
  }

  private deselectPiece() {
    this.selectedPiece = null
  }

  private canSubmitMoves(): boolean {
    return this.pendingMoves.length > 0 && this.hasSubmittedPresentMoves()
  }

  private getMoveOrder(pendingMoveIndex: number): number {
    return this.actionIndex * CoreGameState.MOVE_ORDER_STRIDE + pendingMoveIndex
  }

  private getCommittedMoveOrderBase(): number {
    return Math.max(0, this.actionIndex - 1) * CoreGameState.MOVE_ORDER_STRIDE
  }

  private replayPendingMoves(): Multiverse {
    return this.pendingMoves.reduce(
      (multiverse, pendingMove) => Multiverse.applyMove(
        pendingMove.move,
        this.player,
        multiverse,
        pendingMove.order,
      ),
      this.multiverseCommitted,
    )
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

  private getMoveAnimationDuration(): number {
    if (! this.pendingMove?.is5D) return Animations.MoveAnimationDuration
    return Animations.MoveAnimationDuration
      + this.getMoveTravelDuration(this.pendingMove)
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
    return Scalar.clamp(
      (this.getMoveAnimationElapsed() - Animations.MoveAnimationDuration)
        / this.getMoveTravelDuration(this.pendingMove),
      0,
      1,
    )
  }

  private getMoveTravelDuration(pendingMove: PendingMove | null): number {
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

  private hasSubmittedPresentMoves(): boolean {
    return CoreGameState.hasSubmittedPresentMoves(this.multiverse, this.player)
  }

  private getPieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    const hit = this.getPlayableBoardSquareAtScreen(screen)
    if (! hit) return null
    return this.getPieceSelectionFromHit(hit)
  }

  private getPieceSelectionFromHit(hit: BoardSquareHit): PieceSelection | null {
    const piece = Board.getPiece(hit.coord, hit.board)
    if (Pieces.getPlayer(piece) !== this.player) return null

    const from: Coord = {
      ...hit.coord,
      l: hit.l,
      t: Coord.turn(hit.m, this.player),
    }

    return {
      l: hit.l,
      m: hit.m,
      from,
      targets: Multiverse.getMoveTargets(this.multiverse, from, this.player),
      piece,
    }
  }

  private getPlayableBoardSquareAtScreen(screen: Vec2): BoardSquareHit | null {
    const hit = this.getBoardSquareAtScreen(screen)
    if (! hit) return null
    if (! Multiverse.isPlayableBoard(this.multiverse, this.player, {
      l: hit.l,
      t: Coord.turn(hit.m, this.player),
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
        const x = Math.floor((world[0] - x0) / Sizes.PieceWidth)
        const y = Math.floor((world[1] - y0) / Sizes.PieceWidth)
        const coord = { x, y }
        if (! Coord.isInBoard(coord)) continue

        return { l, m, board, coord }
      }
    }

    return null
  }

  private updateCameraMotion() {
    if (! this.cameraMotion) return

    const viewport = this.getCameraMotionViewport(this.cameraMotion)
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

    this.smoothCameraToViewport(viewport, CameraControl.BounceBackSmoothing)

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
  }

  private getViewportCenterScreen(): Vec2 {
    return this.layout.getViewportCenterScreen()
  }

  private getCameraMotionViewport(motion: CameraMotion): Rect | null {
    return motion.viewport === undefined ? this.layout.getValidViewportRect(this.multiverse) : motion.viewport
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
    this.timelineTilesPainter.render(this.multiverse)
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
  }

  private renderMultiverseStatic(multiverse: Multiverse) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      this.linePainter.render(line, l, 1, multiverse)
      const activeM = Line.getLatestBoardIndex(line)

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        this.renderBoard(board, l, m, m === activeM, this.isTemporaryBoard(l, m), {
          temporaryPreset: this.getTemporaryBoardPreset(l, m),
        })
      }
    }
  }

  private renderMultiverseTravelAnimation(pendingMove: PendingMove) {
    const viewportProgress = this.getMoveTravelViewportProgress()
    const sourceProgress = this.getMoveSourceBoardAnimationProgress()
    const travelProgress = this.getMoveTravelAnimationProgress()
    const pieceProgress = this.getMoveTravelPathProgress(pendingMove, travelProgress)

    this.followTravelAnimationViewport(pendingMove, Easing.easeInOut(viewportProgress))
    this.presentPainter.render({
      multiverse: pendingMove.multiverseBefore,
      multiverseCommitted: this.multiverseCommitted,
      player: this.player,
    })
    this.renderMultiverseSourceAnimation(pendingMove, Easing.easeInOut(sourceProgress))
    this.renderMoveArrow(pendingMove.move, this.player, 1, pendingMove.order)
    if (sourceProgress >= 1) {
      this.renderTravelPiece(pendingMove, pieceProgress, 1)
    }
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
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isPendingLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isPendingLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 1 - progress,
          })
          continue
        }
        if (isTargetLine && m === targetBoardIndex) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 1 - progress,
          })
          continue
        }
        this.renderBoard(board, l, m, m === activeCommitted, false)
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
  }

  private renderMultiverseSourceAnimation(pendingMove: PendingMove, progress: number) {
    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const isSourceLine = l === pendingMove.from.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isSourceLine && activeCommitted !== null) {
        this.linePainter.renderDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.linePainter.render(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isSourceLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 1 - progress,
          })
          continue
        }
        this.renderBoard(board, l, m, m === activeCommitted, false)
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
            activeProgress: 1 - progress,
          })
          continue
        }
        this.renderBoard(board, l, m, m === activeCommitted, false)
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

  private followPendingBoardAnimation(pendingMove: PendingMove, progress: number) {
    if (! this.moveAnimation) return

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
    const borderColor = Color4.withAlpha(Color4.mix(baseBorderColor, temporaryPreset.border, temporaryProgress), alpha)
    const activeBorderFill = Color4.withAlpha(Color4.mix(baseActiveBorderFill, temporaryPreset.fill, temporaryProgress), alpha)
    const activeProgress = options.activeProgress ?? (isActive ? 1 : 0)
    const outerBorder = Sizes.BoardBorder + Sizes.ActiveBoardBorder * activeProgress
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
          x0 - Sizes.ActiveBoardBorder,
          y0 - Sizes.ActiveBoardBorder,
        ],
        size: [
          Sizes.BoardWidth + Sizes.ActiveBoardBorder * 2,
          Sizes.BoardWidth + Sizes.ActiveBoardBorder * 2,
        ],
        radius: innerBorderRadius,
        fill: Color4.withAlpha(activeBorderFill, activeProgress),
        stroke: null,
      })
    }

    for (const [x, y] of Coord.spacelikes()) {
      const coord = { x, y }
      const pos: Vec2 = [
        x0 + x * Sizes.PieceWidth,
        y0 + y * Sizes.PieceWidth,
      ]
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

    this.renderBoardFocusMask(l, m, boardPlayer, [x0, y0], alpha)
    this.renderMoveFormationArrow(board, alpha)
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
    const move = board.createdBy
    const player = board.createdByPlayer
    if (! move || player === null || board.createdByRole !== 'target') return
    if (Coord.isSameBoard(move.from, move.to)) return

    this.renderMoveArrow(move, player, alpha, board.createdByOrder ?? 0)
  }

  private renderMoveArrow(move: Move, player: Player, alpha = 1, order = 0) {
    const geometry = this.getMoveArrowGeometry(move, player)
    if (! geometry) return

    const points = getMoveArrowPolygon(
      geometry.from,
      geometry.control1,
      geometry.control2,
      geometry.to,
    )
    if (points.length === 0) return

    const stroke = player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.MoveHighlight,
      order,
      points,
      fill: getMoveArrowMaskFill(
        Color4.withAlpha(Colors.MoveArrowFill, alpha),
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
    const from = this.layout.getSquareCenter(move.from.l, fromM, move.from)
    const to = this.layout.getSquareCenter(move.to.l, toM, move.to)
    const horizontal = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1])
    const direction = Vec2.sub(to, from)
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
    return selection.targets.some(target => this.isTargetAt(target, l, m, coord))
  }

  private shouldRenderPieceGhost(l: number, m: number, coord: CoordSpacelike): boolean {
    if (! this.selectedPiece || ! this.hoverSquare) return false
    if (! isSameLocatedSquare(this.hoverSquare, l, m, coord)) return false
    return this.selectedPiece.targets.some(target => this.isTargetAt(target, l, m, coord))
  }

  private isTargetAt(target: Coord, l: number, m: number, coord: CoordSpacelike): boolean {
    return target.l === l
      && Coord.boardIndex(target, this.player) === m
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

  private renderPointer() {
    const camera: Camera = this.renderer.getCamera()
    const center = this.renderer.screenToWorld(this.pointer.screen)
    const width = Sizes.PointerDebugWidth / camera.scale

    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Debug,
      mat: Mat3.transform(Vec2.sub(center, [width / 2, width / 2]), [width, width]),
      color: [1, 0, 0, 0.5],
    })
  }
}
