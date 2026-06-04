import { Board, Player, Players as CorePlayers, Coord, FiveDPGN, GameState as CoreGameState, Line, Multiverse, Piece, Pieces, type Action, type CoordSpacelike, type Move } from '@5dcol/core'
import { Effect } from '@/utils'
import { Color4, CubicBezier, Mat3, Rect, Scalar, Vec2, type Camera } from '@engine/basic'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, RenderLayer, Sizes, Animations } from '@engine/constant'
import { type Logger } from '@engine/logger'
import { CircleRenderItem, type FillStyle, LinearGradientFill, type Renderer, RenderItemType } from '@engine/renderer'
import { PIECE_TO_TEXTURE_ID } from '@engine/texture'

export interface GameConfig {
  debug: boolean
  logger: Logger
  renderer: Renderer
}

interface PointerState {
  screen: Vec2
  dragStartScreen: Vec2 | null
  dragLastScreen: Vec2 | null
  dragExceeded: boolean
}

interface VerticalBounds {
  top: number
  bottom: number
}
interface BoardFrame {
  pos: Vec2
  size: Vec2
  radius: number
}
interface CameraMotion {
  targetCenter: Vec2
  targetScale: number
  anchorScreen: Vec2
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
interface PendingMove {
  move: Move
  order: number
  multiverseBefore: Multiverse
  is5D: boolean
  from: {
    l: number
    m: number
  }
  created: {
    l: number
    m: number
  }
}
interface StoredGameState {
  version: 1
  actions?: Action[]
  multiverseCommitted: Multiverse
  multiverse: Multiverse
  player: Player
  actionIndex: number
  pendingMoves: PendingMove[]
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
interface BoardRenderOptions {
  activeProgress?: number
  temporaryProgress?: number
  temporaryPreset?: ButtonColorPreset
  alpha?: number
  pos?: Vec2
  animatedLayer?: boolean
  basePlayer?: Player
}
interface PresentColors {
  border: Color4
  fill: Color4
  label: Color4
}
interface LineColors {
  border: Color4
  fill: Color4
}
interface MoveArrowGeometry {
  from: Vec2
  control1: Vec2
  control2: Vec2
  to: Vec2
}
interface LineBranchGeometry {
  source: Vec2
  bend1Control1: Vec2
  bend1Control2: Vec2
  bend1End: Vec2
  lineEnd: Vec2
  bend2Control1: Vec2
  bend2Control2: Vec2
  target: Vec2
}

type ScreenRect = [pos: Vec2, size: Vec2]

interface ButtonConfig {
  id: string
  rect: ScreenRect
  disabled: boolean
  colorPreset: ButtonColorPreset
  turnPlayer: Player
  text: string
  piece: Piece | null
  effect?: 'pulse'
  onClick: () => void
}

const PRESENT_LABEL = 'The Present'
const PRESENT_LABEL_FONT = 'Georgia, Times New Roman, serif'
const UI_FONT = 'Georgia, Times New Roman, serif'
const POINTER_CLICK_THRESHOLD = 3
const PIECE_GHOST_ALPHA = 0.45
const GAME_STORAGE_KEY = '5dcol.gameState'

const isTextInputEvent = (e: KeyboardEvent): boolean => {
  const target = e.target
  if (! (target instanceof HTMLElement)) return false
  return target.isContentEditable
    || target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
}

const isSameLocatedSquare = (
  square: SquareHover,
  l: number,
  m: number,
  coord: CoordSpacelike,
): boolean => (
  square.l === l && square.m === m && Coord.isSameSpace(square.coord, coord)
)

class ButtonControl {
  private buttons: ButtonConfig[] = []
  private pressedId: string | null = null
  private hoverId: string | null = null

  set(buttons: ButtonConfig[]) {
    this.buttons = buttons
    if (! buttons.some(button => button.id === this.pressedId)) this.pressedId = null
    if (! buttons.some(button => button.id === this.hoverId)) this.hoverId = null
  }

  handleMouseMove(screen: Vec2) {
    this.hoverId = this.getButtonAt(screen)?.id ?? null
  }

  clearHover() {
    this.hoverId = null
  }

  handleMouseDown(screen: Vec2): boolean {
    const button = this.getButtonAt(screen)
    if (! button) return false
    if (button.disabled) return true
    this.pressedId = button.id
    return true
  }

  handleMouseUp(screen: Vec2): boolean {
    const pressedId = this.pressedId
    this.pressedId = null

    if (! pressedId) return false

    const button = this.buttons.find(button => button.id === pressedId) ?? null
    const pressed = button !== null && this.contains(button.rect, screen)
    if (! button || ! pressed) return true
    if (button.disabled || ! this.contains(button.rect, screen)) return true

    button.onClick()
    return true
  }

  render(renderer: Renderer) {
    for (const button of this.buttons) this.renderButton(renderer, button)
  }

  private renderButton(renderer: Renderer, button: ButtonConfig) {
    const pressed = this.pressedId === button.id
    const hovered = this.hoverId === button.id
    const collapsed = pressed || button.disabled
    const colors = this.getButtonColors(button, hovered)
    const shadowOffset = Sizes.ButtonShadowOffset
    const bodyRect: ScreenRect = collapsed
      ? [Vec2.add(button.rect[0], [0, shadowOffset]), button.rect[1]]
      : button.rect

    if (! collapsed) {
      this.renderRoundRect(renderer, [
        Vec2.add(button.rect[0], [shadowOffset, shadowOffset]),
        button.rect[1],
      ], Colors.Shadow, null)
    }

    this.renderRoundRect(
      renderer,
      bodyRect,
      colors.fill,
      colors.border,
    )

    this.renderContent(renderer, button, colors, bodyRect)
  }

  private getButtonAt(screen: Vec2): ButtonConfig | null {
    return this.buttons.find(button => this.contains(button.rect, screen)) ?? null
  }

  private getButtonColors(button: ButtonConfig, hovered: boolean): ButtonColorPreset {
    if (button.disabled) {
      return button.turnPlayer === Player.W ? ButtonColors.DisabledWhite : ButtonColors.DisabledBlack
    }
    if (button.effect === 'pulse') return this.getPulseColors(button)
    if (hovered) return this.getGreenColors(button.turnPlayer)
    return button.colorPreset
  }

  private getPulseColors(button: ButtonConfig): ButtonColorPreset {
    const phase = (Math.sin(performance.now() / Animations.PulseEffectDuration) + 1) / 2
    const green = this.getGreenColors(button.turnPlayer)
    return {
      border: Color4.mix(button.colorPreset.border, green.border, phase),
      fill: Color4.mix(button.colorPreset.fill, green.fill, phase),
      text: Color4.mix(button.colorPreset.text, green.text, phase),
    }
  }

  private getGreenColors(player: Player): ButtonColorPreset {
    return player === Player.W ? ButtonColors.GreenWhite : ButtonColors.GreenBlack
  }

  private renderContent(
    renderer: Renderer,
    button: ButtonConfig,
    colors: ButtonColorPreset,
    [[x, y], [w, h]]: ScreenRect,
  ) {
    const iconSize = Sizes.ButtonIconSize
    const gap = Sizes.ButtonContentGap
    const textWidth = this.getTextWidth(button.text)
    const contentWidth = button.piece === null ? textWidth : textWidth + gap + iconSize
    const contentX = x + (w - contentWidth) / 2
    const centerY = y + h / 2

    renderer.submit({
      type: RenderItemType.Text,
      layer: RenderLayer.UI,
      space: 'screen',
      pos: [contentX + textWidth / 2, centerY + 3],
      angle: 0,
      text: button.text,
      fontSize: Sizes.ButtonFontSize,
      fontFamily: UI_FONT,
      color: colors.text,
      align: 'center',
      baseline: 'middle',
    })

    if (button.piece === null) return

    const iconPos: Vec2 = [
      contentX + textWidth + gap,
      centerY - iconSize / 2,
    ]
    renderer.submit({
      type: RenderItemType.Texture,
      layer: RenderLayer.UI,
      space: 'screen',
      mat: Mat3.transform(iconPos, [iconSize, iconSize]),
      textureId: PIECE_TO_TEXTURE_ID.get(button.piece)!,
    })
  }

  private renderRoundRect(
    renderer: Renderer,
    rect: ScreenRect,
    fill: FillStyle | null,
    stroke: Color4 | null,
  ) {
    renderer.submit({
      type: RenderItemType.RoundRect,
      layer: fill === Colors.Shadow ? RenderLayer.UIShadow : RenderLayer.UI,
      space: 'screen',
      pos: rect[0],
      size: rect[1],
      radius: Sizes.ButtonHeight / 2,
      fill,
      stroke,
      strokeWidth: Sizes.ButtonBorder,
    })
  }

  private getTextWidth(text: string): number {
    return Math.ceil(text.length * Sizes.ButtonFontSize * 0.52)
  }

  private contains([[x, y], [w, h]]: ScreenRect, [px, py]: Vec2): boolean {
    return px >= x && px <= x + w && py >= y && py <= y + h
  }
}

export class Game {
  constructor(public readonly config: GameConfig) {
    this.logger = config.logger
    this.renderer = config.renderer
  }

  public readonly logger: Logger
  public readonly renderer: Renderer

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
  private readonly effects: Effect[] = []
  private readonly buttonControl = new ButtonControl()
  private cameraMotion: CameraMotion | null = null
  private selectedPiece: PieceSelection | null = null
  private hoverSquare: SquareHover | null = null
  private hoverPiece: PieceSelection | null = null
  private pendingMove: PendingMove | null = null
  private pendingMoves: PendingMove[] = []
  private moveAnimation: MoveAnimation | null = null
  private submitRequestedDuringMoveAnimation = false

  private animationFrame: number | null = null
  private resizeDirty = false
  private disposed = false

  public start() {
    const restored = this.restoreGameState()
    this.renderer.start()
    if (restored) this.focusCurrentPresent({ smooth: false })
    else this.focusInitialTurn({ smooth: false })
    this.bindEvents()
    this.animationFrame = requestAnimationFrame(this.loop)
    this.logger.info('Game started')
  }

  public dispose() {
    if (this.disposed) return
    for (const effect of this.effects) effect()
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.renderer.dispose()
    this.disposed = true
  }

  private collect(effect: Effect) {
    this.effects.push(effect)
  }

  private restoreGameState(): boolean {
    const storage = this.getLocalStorage()
    if (! storage) return false

    try {
      const raw = storage.getItem(GAME_STORAGE_KEY)
      if (! raw) return false

      const state = JSON.parse(raw) as Partial<StoredGameState>
      if (! this.isStoredGameState(state)) {
        this.clearStoredGameState()
        return false
      }

      const actions = state.actions ?? CoreGameState.extractActions(state.multiverseCommitted)
      const pendingMoveMoves = state.pendingMoves.map(pendingMove => pendingMove.move)
      const coreState = CoreGameState.create(actions, pendingMoveMoves)

      this.multiverseCommitted = coreState.multiverseCommitted
      this.player = coreState.player
      this.actionIndex = coreState.actionIndex
      this.actions = coreState.actions
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
    const storage = this.getLocalStorage()
    if (! storage) return

    const state: StoredGameState = {
      version: 1,
      actions: this.actions,
      multiverseCommitted: this.multiverseCommitted,
      multiverse: this.multiverse,
      player: this.player,
      actionIndex: this.actionIndex,
      pendingMoves: this.pendingMoves,
    }

    try {
      storage.setItem(GAME_STORAGE_KEY, JSON.stringify(state))
    }
    catch {
      this.logger.error('Failed to save game state')
    }
  }

  private isStoredGameState(state: Partial<StoredGameState>): state is StoredGameState {
    return state.version === 1
      && this.isMultiverseLike(state.multiverseCommitted)
      && this.isMultiverseLike(state.multiverse)
      && (state.actions === undefined || Array.isArray(state.actions))
      && (state.player === Player.W || state.player === Player.B)
      && typeof state.actionIndex === 'number'
      && Array.isArray(state.pendingMoves)
  }

  private isMultiverseLike(value: unknown): value is Multiverse {
    if (! value || typeof value !== 'object') return false
    const multiverse = value as Partial<Multiverse>
    return Array.isArray(multiverse.lines)
      && typeof multiverse.lOffset === 'number'
      && typeof multiverse.lFurthestB === 'number'
      && typeof multiverse.lFurthestW === 'number'
  }

  private getLocalStorage(): Storage | null {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage
    }
    catch {
      return null
    }
  }

  private clearStoredGameState() {
    const storage = this.getLocalStorage()
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
    this.buttonControl.clearHover()
    this.clearStoredGameState()
    this.persistGameState()
    this.focusInitialTurn()
  }

  private bindEvents() {
    this.collect(Effect.useListener(window, 'resize', () => {
      this.resizeDirty = true
    }))

    this.collect(Effect.useListener(window, 'mousemove', e => {
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      this.buttonControl.handleMouseMove(screen)
      this.updatePointerDragExceeded(screen)
      this.panByPointerDrag(screen)
    }))

    this.collect(Effect.useListener(window, 'mousedown', e => {
      if (e.button !== 0) return
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      if (this.buttonControl.handleMouseDown(screen)) return
      this.pointer.dragStartScreen = screen
      this.pointer.dragLastScreen = screen
      this.pointer.dragExceeded = false
    }))

    this.collect(Effect.useListener(window, 'mouseup', e => {
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      if (this.buttonControl.handleMouseUp(screen)) {
        this.clearPointerDrag()
        return
      }
      if (! this.pointer.dragExceeded) this.handleBoardClick(screen)
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'mouseleave', () => {
      this.buttonControl.clearHover()
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'blur', () => {
      this.buttonControl.handleMouseUp([-Infinity, -Infinity])
      this.buttonControl.clearHover()
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'contextmenu', e => {
      e.preventDefault()
      if (! this.isMoveAnimating()) this.deselectPiece()
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'keydown', e => {
      this.handleKeyDown(e)
    }))

    this.collect(Effect.useListener(window, 'wheel', e => {
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
      viewport: this.getRenderViewportRect(),
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
    if (e.repeat || isTextInputEvent(e)) return

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
    const targetScale = this.cameraMotion?.targetScale ?? camera.scale
    this.moveViewportTo({
      targetScale: Scalar.clamp(
        targetScale + step,
        CameraControl.ZoomMin,
        CameraControl.ZoomMax,
      ),
    })
  }

  private setCameraMotion(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}) {
    const camera = this.renderer.getCamera()
    this.cameraMotion = {
      targetCenter: motion.targetCenter ?? this.cameraMotion?.targetCenter ?? camera.center,
      targetScale: motion.targetScale ?? this.cameraMotion?.targetScale ?? camera.scale,
      anchorScreen: options.anchorScreen ?? motion.anchorScreen ?? this.cameraMotion?.anchorScreen ?? this.getViewportCenterScreen(),
      viewport: options.viewport,
    }
  }

  private moveViewportTo(motion: Partial<CameraMotion>, options: ViewportMoveOptions = {}) {
    if (options.smooth === false) {
      this.setViewportImmediate({
        center: motion.targetCenter,
        scale: motion.targetScale,
      }, { ...options, cancelMotion: true })
      return
    }

    this.setCameraMotion(motion, options)
  }

  private setViewportImmediate(camera: Partial<Camera>, options: ViewportMoveOptions = {}) {
    if (options.cancelMotion) this.cameraMotion = null

    if (camera.scale !== undefined) {
      this.renderer.setCamera({
        scale: Scalar.clamp(camera.scale, CameraControl.ZoomMin, CameraControl.ZoomMax),
      })
    }

    const viewport = options.viewport ?? this.getValidViewportRect()
    const targetCenter = camera.center ?? this.renderer.getCamera().center
    this.renderer.setCamera({
      center: viewport ? this.clampCameraCenterToViewport(targetCenter, viewport) : targetCenter,
    })
    this.syncCameraMotion()
  }

  public focusTurn(l: number, m: number, options: ViewportFocusOptions = {}) {
    this.focusRect(this.getTurnRect(l, m), options)
  }

  public focusBoard(l: number, m: number, options: ViewportFocusOptions = {}) {
    this.focusRect(this.getBoardRect(l, m), options)
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
        return m === null ? [] : [this.getBoardRect(l, m)]
      })
      if (rects.length > 0) {
        this.focusRects(rects, Sizes.BoardWidth / 2, options)
        return
      }
    }

    this.focusInitialTurn(options)
  }

  private focusRect(rect: Rect, options: ViewportFocusOptions = {}) {
    const [pos, size] = rect
    this.moveViewportTo({
      targetCenter: Vec2.add(pos, Vec2.scale(size, 0.5)),
    }, {
      smooth: options.smooth,
    })
  }

  private focusRects(rects: Rect[], padding = 0, options: ViewportFocusOptions = {}) {
    const bounds = this.getRectBounds(rects)
    if (! bounds) return

    const camera = this.renderer.getCamera()
    const scale = this.getScaleToContainRects(rects, padding)
    this.moveViewportTo({
      targetCenter: this.getRectCenter(bounds),
      targetScale: Math.min(camera.scale, scale),
    }, {
      smooth: options.smooth,
    })
  }

  private getTurnRect(l: number, m: number): Rect {
    return [
      [
        Sizes.TurnWidth * m - Sizes.BoardMargin,
        this.getTurnY(l) - Sizes.TurnHeight / 2,
      ],
      Sizes.TurnSize,
    ]
  }

  private getBoardRect(l: number, m: number): Rect {
    return [
      [
        m * (Sizes.BoardWidth + Sizes.BoardGap) - Sizes.BoardBorder,
        this.getLineY(l) - Sizes.BoardWidth * 0.5 - Sizes.BoardBorder,
      ],
      Sizes.BoardBorderSize,
    ]
  }

  private getTurnY(l: number): number {
    return l * Sizes.TurnHeight
  }

  private getLineY(l: number): number {
    return l * (Sizes.BoardWidth + Sizes.BoardGap)
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
    this.buttonControl.render(this.renderer)
  }

  private updateInteraction() {
    if (this.isMoveAnimating()) {
      this.hoverSquare = null
      this.hoverPiece = null
      this.buttonControl.set(this.getToolbarButtons())
      return
    }

    const hit = this.getBoardSquareAtScreen(this.pointer.screen)
    this.hoverSquare = hit ? { l: hit.l, m: hit.m, coord: hit.coord } : null
    const playableHit = this.getPlayableBoardSquareAtScreen(this.pointer.screen)
    this.hoverPiece = this.selectedPiece || ! playableHit ? null : this.getPieceSelectionFromHit(playableHit)
    this.buttonControl.set(this.getToolbarButtons())
  }

  private getToolbarButtons(): ButtonConfig[] {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const gap = Sizes.ButtonContentGap * 2
    const leftX = (widthCss - Sizes.ButtonWidth * 2 - gap) / 2
    const rightX = leftX + Sizes.ButtonWidth + gap
    const importRect: ScreenRect = [
      [
        widthCss - Sizes.RestartButtonWidth * 3 - gap * 2 - Sizes.ButtonTop,
        heightCss - Sizes.ButtonHeight - Sizes.ButtonTop,
      ],
      [Sizes.RestartButtonWidth, Sizes.ButtonHeight],
    ]
    const exportRect: ScreenRect = [
      [
        widthCss - Sizes.RestartButtonWidth * 2 - gap - Sizes.ButtonTop,
        heightCss - Sizes.ButtonHeight - Sizes.ButtonTop,
      ],
      [Sizes.RestartButtonWidth, Sizes.ButtonHeight],
    ]
    const restartRect: ScreenRect = [
      [
        widthCss - Sizes.RestartButtonWidth - Sizes.ButtonTop,
        heightCss - Sizes.ButtonHeight - Sizes.ButtonTop,
      ],
      [Sizes.RestartButtonWidth, Sizes.ButtonHeight],
    ]

    const leftButton: ButtonConfig = this.selectedPiece
      ? {
          id: 'deselect-piece',
          rect: [[leftX, Sizes.ButtonTop], [Sizes.ButtonWidth, Sizes.ButtonHeight]],
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
          rect: [[leftX, Sizes.ButtonTop], [Sizes.ButtonWidth, Sizes.ButtonHeight]],
          disabled: this.pendingMoves.length === 0 || this.submitRequestedDuringMoveAnimation,
          colorPreset: this.getUndoMoveButtonColor(),
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
        rect: [[rightX, Sizes.ButtonTop], [Sizes.ButtonWidth, Sizes.ButtonHeight]],
        disabled: ! this.canSubmitMoves() || this.submitRequestedDuringMoveAnimation,
        colorPreset: this.getSubmitMovesButtonColor(),
        turnPlayer: this.player,
        text: 'Submit Moves',
        piece: null,
        effect: 'pulse',
        onClick: () => {
          this.submitMoves()
        },
      },
      {
        id: 'import-5dpgn',
        rect: importRect,
        disabled: this.isMoveAnimating(),
        colorPreset: ButtonColors.Board,
        turnPlayer: this.player,
        text: 'Import',
        piece: null,
        onClick: () => {
          this.importFiveDPGN()
        },
      },
      {
        id: 'export-5dpgn',
        rect: exportRect,
        disabled: false,
        colorPreset: ButtonColors.Board,
        turnPlayer: this.player,
        text: 'Export',
        piece: null,
        onClick: () => {
          this.exportFiveDPGN()
        },
      },
      {
        id: 'restart-game',
        rect: restartRect,
        disabled: false,
        colorPreset: ButtonColors.Board,
        turnPlayer: this.player,
        text: 'Restart',
        piece: null,
        onClick: () => {
          this.restartGame()
        },
      },
    ]
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

  private importFiveDPGN() {
    const input = window.prompt('Paste 5dpgn')
    if (! input) return

    try {
      this.loadCoreGameState(FiveDPGN.importGameState(input))
    }
    catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to import 5dpgn')
    }
  }

  private exportFiveDPGN() {
    if (this.pendingMoves.length > 0) {
      const confirmed = window.confirm('Pending moves are not exported. Export committed moves only?')
      if (! confirmed) return
    }

    const text = FiveDPGN.exportGameState({ actions: this.actions })
    const clipboard = navigator.clipboard
    if (clipboard) {
      clipboard.writeText(text)
        .then(() => window.alert('5dpgn copied to clipboard'))
        .catch(() => {
          window.prompt('Copy 5dpgn', text)
        })
      return
    }

    window.prompt('Copy 5dpgn', text)
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
    this.buttonControl.clearHover()
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

  private getUndoMoveButtonColor(): ButtonColorPreset {
    return this.pendingMoves.at(-1)?.is5D ? ButtonColors.FiveD : ButtonColors.Yellow
  }

  private getSubmitMovesButtonColor(): ButtonColorPreset {
    return this.player === Player.W ? ButtonColors.White : ButtonColors.Black
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
    return Scalar.smoothstep(this.getMoveBoardAnimationProgress())
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

        const [[borderX, borderY]] = this.getBoardRect(l, m)
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

    const camera = this.renderer.getCamera()
    const scaleDelta = this.cameraMotion.targetScale - camera.scale
    const scaleNext = Math.abs(scaleDelta) <= CameraControl.ZoomSnapEpsilon
      ? this.cameraMotion.targetScale
      : camera.scale + scaleDelta * CameraControl.ZoomSmoothing

    this.setCameraScaleAt(this.cameraMotion.anchorScreen, scaleNext)

    const cameraAfterScale = this.renderer.getCamera()
    const centerDelta = Vec2.sub(this.cameraMotion.targetCenter, cameraAfterScale.center)
    const centerNext = Vec2.length(centerDelta) <= CameraControl.BounceBackSnapEpsilon
      ? this.cameraMotion.targetCenter
      : Vec2.add(cameraAfterScale.center, Vec2.scale(centerDelta, CameraControl.BounceBackSmoothing))
    this.renderer.setCamera({ center: centerNext })

    const viewport = this.getCameraMotionViewport(this.cameraMotion)
    this.smoothCameraToViewport(viewport, CameraControl.BounceBackSmoothing)

    const cameraAfterBounds = this.renderer.getCamera()
    this.cameraMotion.targetCenter = viewport
      ? this.clampCameraCenterToViewport(this.cameraMotion.targetCenter, viewport)
      : this.cameraMotion.targetCenter

    if (
      scaleNext === this.cameraMotion.targetScale
      && Vec2.length(Vec2.sub(cameraAfterBounds.center, this.cameraMotion.targetCenter)) <= CameraControl.BounceBackSnapEpsilon
    ) {
      this.renderer.setCamera({ center: this.cameraMotion.targetCenter })
      this.cameraMotion = null
    }
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
    const { widthCss, heightCss } = this.renderer.getScreen()
    return [widthCss / 2, heightCss / 2]
  }

  private getCameraMotionViewport(motion: CameraMotion): Rect | null {
    return motion.viewport === undefined ? this.getValidViewportRect() : motion.viewport
  }

  private updateCameraBounds() {
    if (this.cameraMotion) return
    if (this.pointer.dragLastScreen) return

    const validViewport = this.getValidViewportRect()
    if (! validViewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.clampCameraCenterToViewport(camera.center, validViewport)
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
    const targetCenter = this.clampCameraCenterToViewport(camera.center, viewport)
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
    const validViewport = this.getValidViewportRect()
    if (! validViewport) return center
    return this.clampCameraCenterToViewport(center, validViewport)
  }

  private getMoveAnimationViewportRect(pendingMove: PendingMove): Rect | null {
    return this.getValidViewportRect(
      pendingMove.multiverseBefore,
      [
        this.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1),
        this.getBoardRect(pendingMove.created.l, pendingMove.created.m),
      ],
    )
  }

  private renderMultiverse() {
    this.renderTimelineTiles()
    if (this.pendingMove && this.isMoveAnimating()) {
      if (this.pendingMove.is5D && this.getMoveBoardAnimationProgress() === 0) {
        this.renderMultiverseTravelAnimation(this.pendingMove)
        return
      }
      this.renderMultiversePendingAnimation(this.pendingMove, this.getMoveAnimationEase())
      return
    }

    this.renderPresent(this.multiverse, this.getPresentDisplayColor())
    this.renderMultiverseStatic(this.multiverse)
  }

  private renderMultiverseStatic(multiverse: Multiverse) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      this.renderLine(line, l, 1, multiverse)
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

    this.followTravelAnimationViewport(pendingMove, Scalar.smoothstep(viewportProgress))
    this.renderPresent(
      pendingMove.multiverseBefore,
      this.getPresentDisplayPlayer(pendingMove.multiverseBefore),
    )
    this.renderMultiverseSourceAnimation(pendingMove, Scalar.smoothstep(sourceProgress))
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
    this.renderPresentAnimated(progress)
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isPendingLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isPendingLine && activeCommitted !== null) {
        this.renderLineDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.renderLine(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
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
      if (createdLine) this.renderLine(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
  }

  private renderMultiverseSourceAnimation(pendingMove: PendingMove, progress: number) {
    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const isSourceLine = l === pendingMove.from.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isSourceLine && activeCommitted !== null) {
        this.renderLineDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.renderLine(lineCommitted, l, 1, pendingMove.multiverseBefore)
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
    this.renderPresentAnimated(progress)
    let renderedCreatedBoard = false
    const targetBoardIndex = Coord.boardIndex(pendingMove.move.to, this.player)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(pendingMove.multiverseBefore)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isSourceLine = l === pendingMove.from.l
      const isTargetLine = l === pendingMove.move.to.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isSourceLine && activeCommitted !== null) {
        this.renderLineDuringMoveAnimation(lineCommitted, l, 1, pendingMove.multiverseBefore)
      }
      else if (isTargetLine && activeCommitted !== null) {
        this.renderLineDuringMoveAnimation(lineCommitted, l, progress, pendingMove.multiverseBefore)
      }
      else {
        this.renderLine(linePreview ?? lineCommitted, l, 1, linePreview ? this.multiverse : pendingMove.multiverseBefore)
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
      if (createdLine) this.renderLine(createdLine, pendingMove.created.l, progress, this.multiverse)
      this.renderPendingCreatedBoard(pendingMove, progress)
    }
  }

  private renderSourceCreatedBoard(pendingMove: PendingMove, progress: number): boolean {
    const sourceCreatedM = this.getSourceCreatedBoardIndex(pendingMove)
    const linePreview = Multiverse.getLine(this.multiverse, pendingMove.from.l)
    const createdBoard = linePreview?.boards[sourceCreatedM]
    if (! createdBoard) return false

    const [fromPos] = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.getBoardRect(pendingMove.from.l, sourceCreatedM)
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

    const [fromPos] = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
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

    const [fromPos, fromSize] = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const [startPos] = pendingMove.is5D
      ? this.getBoardRect(pendingMove.created.l, pendingMove.created.m - 1)
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

    const sourceOldRect = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const targetOldRect = this.getBoardRect(
      pendingMove.move.to.l,
      Coord.boardIndex(pendingMove.move.to, this.player),
    )
    const sourceNewRect = this.getBoardRect(pendingMove.from.l, pendingMove.from.m + 1)
    const targetNewRect = this.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const sourceOldCenter = this.getRectCenter(sourceOldRect)
    const targetOldCenter = this.getRectCenter(targetOldRect)
    const sourceNewCenter = this.getRectCenter(sourceNewRect)
    const targetNewCenter = this.getRectCenter(targetNewRect)
    const targetScale = this.getMoveTravelTargetScale(this.moveAnimation.cameraScale, [
      sourceOldRect,
      targetOldRect,
    ], Sizes.BoardWidth / 2)
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

  private getMoveTravelTargetScale(baseScale: number, rects: Rect[], padding = 0): number {
    const fitScale = this.getScaleToContainRects(rects, padding)
    return Math.min(baseScale, fitScale)
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

  private getScaleToContainRects(rects: Rect[], padding = 0): number {
    const bounds = this.getRectBounds(rects)
    if (! bounds) return this.renderer.getCamera().scale

    const [, [w, h]] = bounds
    const { widthCss, heightCss } = this.renderer.getScreen()
    const paddedWidth = w + padding * 2
    const paddedHeight = h + padding * 2
    const xScale = paddedWidth > 0 ? widthCss / paddedWidth : CameraControl.ZoomMax
    const yScale = paddedHeight > 0 ? heightCss / paddedHeight : CameraControl.ZoomMax
    return Math.min(xScale, yScale, CameraControl.ZoomMax)
  }

  private getRectBounds(rects: Rect[]): Rect | null {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity

    for (const [[x, y], [w, h]] of rects) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + w)
      y1 = Math.max(y1, y + h)
    }

    if (! Number.isFinite(x0) || ! Number.isFinite(y0)) return null
    return [[x0, y0], [x1 - x0, y1 - y0]]
  }

  private getRectCenter([pos, size]: Rect): Vec2 {
    return Vec2.add(pos, Vec2.scale(size, 0.5))
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

  private renderPresent(multiverse: Multiverse, displayPlayer: Player, boundsOverride?: VerticalBounds | null) {
    const present = Multiverse.getPresent(multiverse, this.player)
    if (! present) return

    this.renderPresentAt(present.m, this.getPresentColors(displayPlayer), undefined, multiverse, boundsOverride)
  }

  private renderPresentAnimated(progress: number) {
    const multiverseBefore = this.pendingMove?.multiverseBefore ?? this.multiverseCommitted
    const presentCommitted = Multiverse.getPresent(multiverseBefore, this.player)
    const presentPreview = Multiverse.getPresent(this.multiverse, this.player)
    if (! presentCommitted || ! presentPreview) return

    const displayPlayerBefore = this.getPresentDisplayPlayer(multiverseBefore)
    const displayPlayerPreview = this.getPresentDisplayPlayer(this.multiverse)
    const bounds = this.getAnimatedBoardVerticalBounds(multiverseBefore, this.multiverse, progress)

    if (presentCommitted.m === presentPreview.m && displayPlayerBefore === displayPlayerPreview) {
      this.renderPresent(this.multiverse, displayPlayerPreview, bounds)
      return
    }

    const [[x0]] = this.getPresentViewportRect(presentCommitted.m)
    const [[x1]] = this.getPresentViewportRect(presentPreview.m)
    const colors = this.mixPresentColors(
      this.getPresentColors(displayPlayerBefore),
      this.getPresentColors(displayPlayerPreview),
      progress,
    )
    this.renderPresentAt(presentPreview.m, colors, x0 + (x1 - x0) * progress, this.multiverse, bounds)
  }

  private renderPresentAt(
    m: number,
    colors: PresentColors,
    xOverride?: number,
    multiverse = this.multiverse,
    boundsOverride?: VerticalBounds | null,
  ) {
    const [[xRect, y], [w, h]] = this.getPresentViewportRect(m)
    const x = xOverride ?? xRect
    const boardBounds = boundsOverride ?? this.getBoardVerticalBounds(multiverse)

    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.PresentShadow,
      mat: Mat3.transform(Vec2.add([x, y], Sizes.LineShadowOffset), [w, h]),
      color: Colors.Shadow,
    })

    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Present,
      mat: Mat3.transform([x + Sizes.PresentBorder, y], [w - Sizes.PresentBorder * 2, h]),
      color: colors.fill,
    })

    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Present,
      mat: Mat3.transform([x, y], [Sizes.PresentBorder, h]),
      color: colors.border,
    })
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Present,
      mat: Mat3.transform([x + w - Sizes.PresentBorder, y], [Sizes.PresentBorder, h]),
      color: colors.border,
    })

    if (boardBounds) {
      this.renderPresentLabels(x, w, boardBounds, colors.label)
      this.renderPresentIcons(x, w, boardBounds)
    }
  }

  private getPresentDisplayColor(): Player {
    return this.getPresentDisplayPlayer(this.multiverse)
  }

  private getPresentDisplayPlayer(multiverse: Multiverse): Player {
    const committedPresent = Multiverse.getPresent(this.multiverseCommitted, this.player)
    const present = Multiverse.getPresent(multiverse, this.player)
    if (! committedPresent || ! present) return this.player
    return present.m > committedPresent.m ? CorePlayers.opponent(this.player) : this.player
  }

  private getPresentColors(player: Player): PresentColors {
    return {
      border: player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack,
      fill: player === Player.W ? Colors.BoardBorderWhiteDim : Colors.BoardBorderBlackDim,
      label: player === Player.W ? Colors.BoardBorderBlack : Colors.BoardBorderWhite,
    }
  }

  private mixPresentColors(a: PresentColors, b: PresentColors, progress: number): PresentColors {
    return {
      border: Color4.mix(a.border, b.border, progress),
      fill: Color4.mix(a.fill, b.fill, progress),
      label: Color4.mix(a.label, b.label, progress),
    }
  }

  private getPresentViewportRect(m: number): Rect {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const topLeft = this.renderer.screenToWorld([0, 0])
    const bottomRight = this.renderer.screenToWorld([widthCss, heightCss])
    const y0 = Math.min(topLeft[1], bottomRight[1])
    const y1 = Math.max(topLeft[1], bottomRight[1])
    const margin = (y1 - y0) * Sizes.PresentViewportMarginRatio + Sizes.TurnHeight

    return [
      [
        m * (Sizes.BoardWidth + Sizes.BoardGap) + (Sizes.BoardWidth - Sizes.PresentWidth) / 2,
        y0 - margin,
      ],
      [
        Sizes.PresentWidth,
        y1 - y0 + margin * 2,
      ],
    ]
  }

  private getBoardVerticalBounds(multiverse = this.multiverse): VerticalBounds | null {
    let top = Infinity
    let bottom = -Infinity

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        const [[, y], [, h]] = this.getBoardRect(l, m)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y + h)
      }
    }

    if (! Number.isFinite(top) || ! Number.isFinite(bottom)) return null
    return { top, bottom }
  }

  private getAnimatedBoardVerticalBounds(
    fromMultiverse: Multiverse,
    toMultiverse: Multiverse,
    progress: number,
  ): VerticalBounds | null {
    const from = this.getBoardVerticalBounds(fromMultiverse)
    const to = this.getBoardVerticalBounds(toMultiverse)
    if (! from) return to
    if (! to) return from

    return {
      top: Scalar.lerp(from.top, to.top, progress),
      bottom: Scalar.lerp(from.bottom, to.bottom, progress),
    }
  }

  private renderPresentLabels(x: number, w: number, bounds: VerticalBounds, color: Color4) {
    const cx = x + w * Sizes.PresentLabelXRatio
    const topY = bounds.top - Sizes.TurnHeight * Sizes.PresentLabelOffsetTurns
    const bottomY = bounds.bottom + Sizes.TurnHeight * Sizes.PresentLabelOffsetTurns

    this.renderPresentLabel([cx, topY], Math.PI / 2, color)
    this.renderPresentLabel([cx, bottomY], Math.PI / 2, color)
  }

  private renderPresentLabel(pos: Vec2, angle: number, color: Color4) {
    this.renderer.submit({
      type: RenderItemType.Text,
      layer: RenderLayer.Present,
      pos,
      angle,
      text: PRESENT_LABEL,
      fontSize: Sizes.PresentLabelFontSize,
      fontFamily: PRESENT_LABEL_FONT,
      fontStyle: 'italic',
      color,
      align: 'center',
      baseline: 'middle',
    })
  }

  private renderPresentIcons(x: number, w: number, bounds: VerticalBounds) {
    const cx = x + w / 2

    const iconCenter: Vec2 = [cx, bounds.top - Sizes.TurnHeight * Sizes.PresentIconOffsetTurns]
    this.renderPresentIcon(
      iconCenter,
      -1,
      this.canCreateTimelinePresent(Player.B),
      Colors.BoardBorderBlack,
      Colors.BoardBorderBlackDim,
    )

    const lowerIconCenter: Vec2 = [cx, bounds.bottom + Sizes.TurnHeight * Sizes.PresentIconOffsetTurns]
    this.renderPresentIcon(
      lowerIconCenter,
      1,
      this.canCreateTimelinePresent(Player.W),
      Colors.BoardBorderWhite,
      Colors.BoardBorderWhiteDim,
    )
  }

  private canCreateTimelinePresent(player: Player): boolean {
    return Multiverse.canCreateActiveTimeline(this.multiverse, player)
  }

  private renderPresentIcon(
    center: Vec2,
    direction: -1 | 1,
    canCreateTimeline: boolean,
    borderColor: Color4,
    fillColor: Color4,
  ) {
    if (canCreateTimeline) {
      const radius = Sizes.PresentIconActiveRadius
      this.renderPresentCircle({
        center,
        radius,
        stroke: borderColor,
        strokeWidth: 0,
        fill: fillColor
      })
      this.renderPresentArrow(center, direction, radius)
      this.renderPresentCircle({
        center,
        radius,
        stroke: borderColor,
        strokeWidth: Sizes.PresentBorder,
        fill: Colors.Transparent
      })
    }
    else {
      this.renderPresentCircle({
        center,
        radius: Sizes.PresentIconInactiveRadius,
        stroke: borderColor,
        strokeWidth: Sizes.PresentBorder,
        fill: fillColor,
      })
    }
  }

  private renderPresentArrow(center: Vec2, direction: -1 | 1, radius: number) {
    const xStart = - radius * Sizes.PresentArrowHalfShaftRatio
    const xEnd = radius * Sizes.PresentArrowHalfShaftRatio
    const xTip = 0

    const yStart = - direction * (radius - Sizes.PresentArrowTailInset)
    const yStartFill = - direction * (radius - Sizes.PresentArrowTailFillInset)
    const yTip = direction * radius * Sizes.PresentArrowTipRatio
    const yTipBase = - direction * radius * Sizes.PresentArrowTipBaseRatio
    const xTipBaseLeft = - (Math.abs(yTip) + Math.abs(yTipBase))
    const xTipBaseRight = Math.abs(yTip) + Math.abs(yTipBase)

    const getPoints = (yStart: number): Vec2[] => {
      const pointsModel: Vec2[] = [
        [xStart, yStart],
        [xEnd, yStart],
        [xEnd, yTipBase],
        [xTipBaseRight, yTipBase],
        [xTip, yTip],
        [xTipBaseLeft, yTipBase],
        [xStart, yTipBase],
      ]
      return pointsModel.map(Vec2.curry.add(center))
    }

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Present,
      points: getPoints(yStart),
      fill: Colors.Purple,
      stroke: Colors.PurpleDark,
      strokeWidth: Sizes.PresentArrowStrokeWidth,
    })

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Present,
      points: getPoints(yStartFill),
      fill: Colors.Purple,
      stroke: null,
      strokeWidth: 0,
    })
  }

  private renderPresentCircle(attrs: Omit<CircleRenderItem, 'type' | 'layer'>) {
    this.renderer.submit({
      type: RenderItemType.Circle,
      layer: RenderLayer.Present,
      ...attrs,
    })
  }

  private renderTimelineTiles() {
    const tileViewport = this.getTimeTileViewportRect()
    if (! tileViewport) return

    const [[x, y], [w, h]] = tileViewport
    const t0 = Math.floor((x + Sizes.BoardMargin) / Sizes.TurnWidth)
    const t1 = Math.ceil((x + w + Sizes.BoardMargin) / Sizes.TurnWidth)
    const l0 = Math.floor(- (y + h) / Sizes.TurnHeight - 0.5)
    const l1 = Math.ceil(- y / Sizes.TurnHeight - 0.5)
    const tileOverdraw = Sizes.BoardTimeOverdrawDevicePixels
      / this.renderer.getScreen().dpr
      / this.renderer.getCamera().scale

    for (let t = t0; t < t1; t ++) {
      for (let l = l0; l < l1; l ++) {
        const [turnPos, turnSize] = this.getTurnRect(l, t)

        this.renderer.submit({
          type: RenderItemType.Quad,
          layer: RenderLayer.BoardTime,
          mat: Mat3.transform(
            Vec2.sub(turnPos, [tileOverdraw / 2, tileOverdraw / 2]),
            Vec2.add(turnSize, [tileOverdraw, tileOverdraw]),
          ),
          color: (t + l) % 2 === 0 ? Colors.BoardTimeWhite : Colors.BoardTimeBlack,
        })
      }
    }
  }

  private getBoardViewportRect(multiverse = this.multiverse, extraRects: Rect[] = []): Rect | null {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        const [[x, y], [w, h]] = this.getBoardRect(l, m)
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + w)
        y1 = Math.max(y1, y + h)
      }
    }

    for (const [[x, y], [w, h]] of extraRects) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + w)
      y1 = Math.max(y1, y + h)
    }

    if (! Number.isFinite(x0) || ! Number.isFinite(y0)) return null
    return [[x0, y0], [x1 - x0, y1 - y0]]
  }

  private getScreenWorldSize(): Vec2 {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const topLeft = this.renderer.screenToWorld([0, 0])
    const bottomRight = this.renderer.screenToWorld([widthCss, heightCss])
    return [
      Math.abs(bottomRight[0] - topLeft[0]),
      Math.abs(bottomRight[1] - topLeft[1]),
    ]
  }

  private getValidViewportRect(multiverse = this.multiverse, extraRects: Rect[] = []): Rect | null {
    const boardViewport = this.getBoardViewportRect(multiverse, extraRects)
    if (! boardViewport) return null

    const center = Vec2.add(boardViewport[0], Vec2.scale(boardViewport[1], 0.5))
    const screenWorldSize = this.getScreenWorldSize()
    const padding = this.getValidViewportPadding(screenWorldSize)
    const size: Vec2 = [
      Math.max(boardViewport[1][0] + padding[0] * 2, screenWorldSize[0]),
      Math.max(boardViewport[1][1] + padding[1] * 2, screenWorldSize[1]),
    ]
    return [
      Vec2.sub(center, Vec2.scale(size, 0.5)),
      size,
    ]
  }

  private getValidViewportPadding(screenWorldSize: Vec2): Vec2 {
    return [
      Math.max(0, (screenWorldSize[0] - Sizes.BoardBorderSize[0]) / 2),
      Math.max(0, (screenWorldSize[1] - Sizes.BoardBorderSize[1]) / 2),
    ]
  }

  private getTimeTileViewportRect(): Rect | null {
    const validViewport = this.getValidViewportRect()
    if (! validViewport) return null

    const screenWorldSize = this.getScreenWorldSize()
    return [
      Vec2.sub(validViewport[0], screenWorldSize),
      Vec2.add(validViewport[1], Vec2.scale(screenWorldSize, 2)),
    ]
  }

  private getRenderViewportRect(): Rect | null {
    return this.getTimeTileViewportRect()
  }

  private clampCameraCenterToViewport(center: Vec2, viewport: Rect): Vec2 {
    const screenWorldSize = this.getScreenWorldSize()
    const [[x, y], [w, h]] = viewport
    return Rect.clampPoint(center, [
      [
        x + screenWorldSize[0] / 2,
        y + screenWorldSize[1] / 2,
      ],
      [
        Math.max(0, w - screenWorldSize[0]),
        Math.max(0, h - screenWorldSize[1]),
      ],
    ])
  }

  private renderLine(line: Line, l: number, alpha = 1, multiverse = this.multiverse) {
    const branch = this.getLineBranchGeometry(line, l)
    const order = this.getLineRenderOrder(line)
    const colors = this.getLineColors(multiverse, l)
    if (branch) {
      this.renderLineBranchArrow(line, l, branch, alpha, order, colors)
      return
    }

    this.renderLineStart(line, l, alpha, branch, order, colors)
    const points = this.getLinePoints(line, l)
    this.renderLinePolygon(points, alpha, order, colors)
  }

  private renderLineStart(
    line: Line,
    l: number,
    alpha = 1,
    branch = this.getLineBranchGeometry(line, l),
    order = this.getLineRenderOrder(line),
    colors = this.getLineColors(this.multiverse, l),
  ) {
    if (branch) {
      this.renderLineBranch(branch, alpha, order, colors)
      return
    }

    this.renderLineInitialStartSegment(line, l, alpha, order, colors)
  }

  private renderLineInitialStartSegment(line: Line, l: number, alpha: number, order: number, colors: LineColors) {
    if (alpha <= 0) return

    const y = this.getLineY(l)
    const xEnd = line.mStart * (Sizes.BoardWidth + Sizes.BoardGap)
    const xStart = xEnd - Sizes.LineStartSegmentLength
    const points: Vec2[] = [
      [xStart, y - Sizes.LineArrowRadius],
      [xEnd, y - Sizes.LineArrowRadius],
      [xEnd, y + Sizes.LineArrowRadius],
      [xStart, y + Sizes.LineArrowRadius],
    ]

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.LineShadow,
      order,
      points: points.map(Vec2.curry.add(Sizes.LineShadowOffset)),
      fill: {
        type: 'linear-gradient',
        from: Vec2.add([xStart, y], Sizes.LineShadowOffset),
        to: Vec2.add([xEnd, y], Sizes.LineShadowOffset),
        stops: [
          { offset: 0, color: Color4.withAlpha(Colors.Shadow, 0) },
          { offset: 1, color: Color4.withAlpha(Colors.Shadow, alpha) },
        ],
      },
      stroke: null,
    })

    const fill = {
      type: 'linear-gradient' as const,
      from: [xStart, y] satisfies Vec2,
      to: [xEnd, y] satisfies Vec2,
      stops: [
        { offset: 0, color: Color4.withAlpha(colors.fill, 0) },
        { offset: 1, color: Color4.withAlpha(colors.fill, alpha) },
      ],
    }
    const stroke = {
      type: 'linear-gradient' as const,
      from: [xStart, y] satisfies Vec2,
      to: [xEnd, y] satisfies Vec2,
      stops: [
        { offset: 0, color: Color4.withAlpha(colors.border, 0) },
        { offset: 1, color: Color4.withAlpha(colors.border, alpha) },
      ],
    }

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Line,
      order,
      points,
      fill,
      stroke,
      strokeWidth: Sizes.LineBorderWidth,
    })
  }

  private renderLineDuringMoveAnimation(line: Line, l: number, progress: number, multiverse = this.multiverse) {
    const branch = this.getLineBranchGeometry(line, l)
    const order = this.getLineRenderOrder(line)
    const colors = this.getLineColors(multiverse, l)
    this.renderLineStart(line, l, 1, branch, order, colors)
    const latestM = Line.getLatestBoardIndex(line)
    if (latestM === null) {
      return
    }

    this.renderLineStableSegment(line, l, latestM, branch?.target[0], order, colors)
    const oldSegment = this.getLineLatestSegmentGeometry(latestM, l)
    this.renderLinePolygon(oldSegment.points, 1 - progress, order, colors)
    this.renderLineBridgeSegment(latestM, l, oldSegment.xStart, progress, order, colors)
    this.renderLinePolygon(this.getMovingLineLatestSegmentPoints(latestM, l, progress), progress, order, colors)
  }

  private renderLinePolygon(points: Vec2[], alpha: number, order: number, colors: LineColors) {
    if (alpha <= 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.LineShadow,
      order,
      points: points.map(Vec2.curry.add(Sizes.LineShadowOffset)),
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Line,
      order,
      points,
      fill: Color4.withAlpha(colors.fill, alpha),
      stroke: Color4.withAlpha(colors.border, alpha),
      strokeWidth: Sizes.LineBorderWidth,
    })
  }

  private renderLineBranchArrow(line: Line, l: number, branch: LineBranchGeometry, alpha: number, order: number, colors: LineColors) {
    const points = this.getLineBranchArrowPoints(line, l, branch)
    if (points.length === 0 || alpha <= 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.LineShadow,
      order,
      points: points.map(Vec2.curry.add(Sizes.LineShadowOffset)),
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Line,
      order,
      points,
      fill: Color4.withAlpha(colors.fill, alpha),
      stroke: Color4.withAlpha(colors.border, alpha),
      strokeWidth: Sizes.LineBorderWidth,
    })
  }

  private getLineBranchArrowPoints(line: Line, l: number, branch: LineBranchGeometry): Vec2[] {
    const step = Sizes.BoardWidth + Sizes.BoardGap
    const y = this.getLineY(l)
    const yUpTip = y - Sizes.LineArrowRadius - Sizes.LineArrowTip
    const yDownTip = y + Sizes.LineArrowRadius + Sizes.LineArrowTip
    const xTip = line.boards.length * step + Sizes.LineArrowShaftLength
    const xEnd = xTip + Sizes.LineArrowRadius + Sizes.LineArrowTip
    const centerline = this.getLineBranchArrowCenterline(branch, [xTip, y])
    if (centerline.length < 2) return []

    const upper: Vec2[] = []
    const lower: Vec2[] = []

    for (let i = 0; i < centerline.length; i ++) {
      const point = centerline[i]
      const previous = centerline[Math.max(0, i - 1)]
      const next = centerline[Math.min(centerline.length - 1, i + 1)]
      const tangent = Vec2.sub(next, previous)
      const length = Vec2.length(tangent)
      if (length === 0) continue

      const unit = Vec2.scale(tangent, 1 / length)
      const normal: Vec2 = [-unit[1], unit[0]]
      upper.push(Vec2.sub(point, Vec2.scale(normal, Sizes.LineArrowRadius)))
      lower.push(Vec2.add(point, Vec2.scale(normal, Sizes.LineArrowRadius)))
    }

    return [
      ...upper,
      [xTip, yUpTip],
      [xEnd, y],
      [xTip, yDownTip],
      ...lower.reverse(),
    ]
  }

  private getLineBranchArrowCenterline(branch: LineBranchGeometry, end: Vec2): Vec2[] {
    const points: Vec2[] = []
    const pushPoint = (point: Vec2) => {
      const previous = points.at(-1)
      if (previous && Vec2.length(Vec2.sub(point, previous)) < 0.001) return
      points.push(point)
    }
    const pushCubic = (from: Vec2, control1: Vec2, control2: Vec2, to: Vec2) => {
      for (let i = 0; i <= Sizes.LineBranchCurveSamples; i ++) {
        pushPoint(CubicBezier.point(from, control1, control2, to, i / Sizes.LineBranchCurveSamples))
      }
    }

    pushCubic(branch.source, branch.bend1Control1, branch.bend1Control2, branch.bend1End)
    pushPoint(branch.lineEnd)
    pushCubic(branch.lineEnd, branch.bend2Control1, branch.bend2Control2, branch.target)
    pushPoint(end)
    return points
  }

  private renderLineBranch(geometry: LineBranchGeometry, alpha: number, order: number, colors: LineColors) {
    this.renderLineBranchStroke(geometry, {
      alpha,
      layer: RenderLayer.LineShadow,
      order,
      offset: Sizes.LineShadowOffset,
      stroke: Colors.Shadow,
      strokeWidth: Sizes.LineBranchWidth,
    })
    this.renderLineBranchStroke(geometry, {
      alpha,
      layer: RenderLayer.Line,
      order,
      offset: [0, 0],
      stroke: colors.border,
      strokeWidth: Sizes.LineBranchWidth + Sizes.LineBorderWidth * 2,
    })
    this.renderLineBranchStroke(geometry, {
      alpha,
      layer: RenderLayer.Line,
      order,
      offset: [0, 0],
      stroke: colors.fill,
      strokeWidth: Sizes.LineBranchWidth,
    })
  }

  private getLineRenderOrder(line: Line): number {
    const board = line.boards[line.mStart]
    if (! board?.createdBy) return 0
    if (board.createdByRole !== 'target') return 0
    if (Coord.isSameBoard(board.createdBy.from, board.createdBy.to)) return 0
    return board.createdByOrder ?? 0
  }

  private getLineColors(multiverse: Multiverse, l: number): LineColors {
    if (! Multiverse.isInactiveLine(multiverse, l)) {
      return {
        border: Colors.PurpleDark,
        fill: Colors.Purple,
      }
    }

    switch (Multiverse.getLinePlayer(l)) {
      case Player.W:
        return {
          border: Colors.InactiveLineWhiteBorder,
          fill: Colors.BoardBorderWhiteDim,
        }
      case Player.B:
        return {
          border: Colors.BoardBorderBlack,
          fill: Colors.BoardBorderBlackDim,
        }
      case null:
        return {
          border: Colors.PurpleDark,
          fill: Colors.Purple,
        }
    }
  }

  private renderLineBranchStroke(
    geometry: LineBranchGeometry,
    {
      alpha,
      layer,
      order,
      offset,
      stroke,
      strokeWidth,
    }: {
      alpha: number
      layer: RenderLayer
      order: number
      offset: Vec2
      stroke: Color4
      strokeWidth: number
    },
  ) {
    const color = Color4.withAlpha(stroke, alpha)
    const addOffset = Vec2.curry.add(offset)

    this.renderLineCurve(
      addOffset(geometry.source),
      addOffset(geometry.bend1Control1),
      addOffset(geometry.bend1Control2),
      addOffset(geometry.bend1End),
      layer,
      color,
      strokeWidth,
      order,
    )
    this.renderLineCurve(
      addOffset(geometry.bend1End),
      addOffset(geometry.bend1End),
      addOffset(geometry.lineEnd),
      addOffset(geometry.lineEnd),
      layer,
      color,
      strokeWidth,
      order,
    )
    this.renderLineCurve(
      addOffset(geometry.lineEnd),
      addOffset(geometry.bend2Control1),
      addOffset(geometry.bend2Control2),
      addOffset(geometry.target),
      layer,
      color,
      strokeWidth,
      order,
    )
  }

  private renderLineCurve(
    from: Vec2,
    control1: Vec2,
    control2: Vec2,
    to: Vec2,
    layer: RenderLayer,
    stroke: Color4,
    strokeWidth: number,
    order: number,
  ) {
    this.renderer.submit({
      type: RenderItemType.Curve,
      layer,
      order,
      from,
      control1,
      control2,
      to,
      stroke,
      strokeWidth,
    })
  }

  private getLineBranchGeometry(line: Line, l: number): LineBranchGeometry | null {
    const board = line.boards[line.mStart]
    if (! board?.createdBy || board.createdByPlayer === null) return null
    if (board.createdByRole !== 'target') return null
    if (Coord.isSameBoard(board.createdBy.from, board.createdBy.to)) return null
    if (board.createdBy.to.l === l) return null

    const step = Sizes.BoardWidth + Sizes.BoardGap
    const branchX = Coord.boardIndex(board.createdBy.to, board.createdByPlayer) * step
      + Sizes.BoardWidth
      + Sizes.BoardGap / 2
    const sourceY = this.getLineY(board.createdBy.to.l)
    const targetY = this.getLineY(l)
    const dy = targetY - sourceY
    if (dy === 0) return null

    const direction = dy > 0 ? 1 : -1
    const radius = Math.min(
      Sizes.LineBranchRadius,
      Math.abs(dy) / 2,
    )
    const k = 0.5522847498307936
    const sourceX = branchX - radius
    const targetX = branchX + radius
    const source: Vec2 = [sourceX, sourceY]
    const bend1End: Vec2 = [branchX, sourceY + direction * radius]
    const lineEnd: Vec2 = [branchX, targetY - direction * radius]
    const target: Vec2 = [targetX, targetY]

    return {
      source,
      bend1Control1: [sourceX + radius * k, sourceY],
      bend1Control2: [branchX, sourceY + direction * radius * (1 - k)],
      bend1End,
      lineEnd,
      bend2Control1: [branchX, targetY - direction * radius * (1 - k)],
      bend2Control2: [target[0] - radius * k, targetY],
      target,
    }
  }

  private renderLineStableSegment(
    line: Line,
    l: number,
    latestM: number,
    xStartOverride?: number,
    order = this.getLineRenderOrder(line),
    colors = this.getLineColors(this.multiverse, l),
  ) {
    const y = this.getLineY(l)
    const xStart = xStartOverride ?? line.mStart * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEnd = latestM * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    if (xEnd <= xStart) return

    this.renderLinePolygon([
      [xStart, y - Sizes.LineArrowRadius],
      [xEnd, y - Sizes.LineArrowRadius],
      [xEnd, y + Sizes.LineArrowRadius],
      [xStart, y + Sizes.LineArrowRadius],
    ], 1, order, colors)
  }

  private renderLineBridgeSegment(m: number, l: number, xStart: number, progress: number, order: number, colors: LineColors) {
    const y = this.getLineY(l)
    const xEndFrom = m * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEndTo = (m + 1) * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEnd = Scalar.lerp(xEndFrom, xEndTo, progress)
    if (xEnd <= xStart) return

    this.renderLinePolygon([
      [xStart, y - Sizes.LineArrowRadius],
      [xEnd, y - Sizes.LineArrowRadius],
      [xEnd, y + Sizes.LineArrowRadius],
      [xStart, y + Sizes.LineArrowRadius],
    ], progress, order, colors)
  }

  private getLineLatestSegmentGeometry(m: number, l: number): { points: Vec2[], xStart: number } {
    const points = this.getLineLatestSegmentPoints(m, l)
    return {
      points,
      xStart: points[0][0],
    }
  }

  private getMovingLineLatestSegmentPoints(m: number, l: number, progress: number): Vec2[] {
    const from = this.getLineLatestSegmentPoints(m, l)
    const to = this.getLineLatestSegmentPoints(m + 1, l)
    return from.map((point, index) => Vec2.mix(point, to[index], progress))
  }

  private getLineLatestSegmentPoints(m: number, l: number, xStartOverride?: number): Vec2[] {
    const y = this.getLineY(l)
    const yUp = y - Sizes.LineArrowRadius
    const yDown = y + Sizes.LineArrowRadius
    const xStart = xStartOverride ?? m * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xTip = (m + 1) * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.LineArrowShaftLength
    const yUpTip = yUp - Sizes.LineArrowTip
    const yDownTip = yDown + Sizes.LineArrowTip
    const xEnd = xTip + Sizes.LineArrowRadius + Sizes.LineArrowTip

    return [
      [xStart, yUp],
      [xTip, yUp],
      [xTip, yUpTip],
      [xEnd, y],
      [xTip, yDownTip],
      [xTip, yDown],
      [xStart, yDown],
    ]
  }

  private getLinePoints(line: Line, l: number, xStartOverride?: number): Vec2[] {
    const y = this.getLineY(l)
    const yUp = y - Sizes.LineArrowRadius
    const yDown = y + Sizes.LineArrowRadius

    const xStart = xStartOverride ?? line.mStart * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth

    const xTip = line.boards.length * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.LineArrowShaftLength

    const yUpTip = yUp - Sizes.LineArrowTip
    const yDownTip = yDown + Sizes.LineArrowTip
    const xEnd = xTip + Sizes.LineArrowRadius + Sizes.LineArrowTip

    return [
      [xStart, yUp],
      [xTip, yUp],
      [xTip, yUpTip],
      [xEnd, y],
      [xTip, yDownTip],
      [xTip, yDown],
      [xStart, yDown],
    ]
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
    const [[boardRectX, boardRectY]] = this.getBoardRect(l, m)
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

    const layers = this.getBoardRenderLayers(options.animatedLayer === true)

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

    this.renderMoveFormationArrow(board, alpha)
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

    const points = this.getMoveArrowPolygon(
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
      fill: this.getMoveArrowMaskFill(
        Color4.withAlpha(Colors.MoveArrowFill, alpha),
        geometry.from,
        geometry.control1,
      ),
      stroke: this.getMoveArrowMaskFill(
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
    const from = this.getSquareCenter(move.from.l, fromM, move.from)
    const to = this.getSquareCenter(move.to.l, toM, move.to)
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

  private getMoveArrowPolygon(from: Vec2, control1: Vec2, control2: Vec2, tip: Vec2): Vec2[] {
    const tangentAtTip = CubicBezier.tangent(from, control1, control2, tip, 1)
    const tangentLength = Vec2.length(tangentAtTip)
    if (tangentLength === 0) return []

    const unit = Vec2.scale(tangentAtTip, 1 / tangentLength)
    const normal: Vec2 = [-unit[1], unit[0]]
    const headBaseCenter = Vec2.sub(tip, Vec2.scale(unit, Sizes.MoveArrowHeadLength))
    const left: Vec2[] = []
    const right: Vec2[] = []
    const halfShaft = Sizes.MoveArrowShaftWidth / 2

    for (let i = 0; i <= Sizes.MoveArrowCurveSamples; i ++) {
      const t = i / Sizes.MoveArrowCurveSamples
      const center = CubicBezier.point(from, control1, control2, headBaseCenter, t)
      const tangent = CubicBezier.tangent(from, control1, control2, headBaseCenter, t)
      const length = Vec2.length(tangent)
      if (length === 0) continue

      const tangentUnit = Vec2.scale(tangent, 1 / length)
      const n: Vec2 = [-tangentUnit[1], tangentUnit[0]]
      left.push(Vec2.add(center, Vec2.scale(n, halfShaft)))
      right.push(Vec2.sub(center, Vec2.scale(n, halfShaft)))
    }

    return [
      ...left,
      Vec2.add(headBaseCenter, Vec2.scale(normal, Sizes.MoveArrowHeadWidth)),
      tip,
      Vec2.sub(headBaseCenter, Vec2.scale(normal, Sizes.MoveArrowHeadWidth)),
      ...right.reverse(),
    ]
  }

  private getMoveArrowMaskFill(color: Color4, from: Vec2, control1: Vec2): LinearGradientFill {
    const tangent = Vec2.sub(control1, from)
    const length = Vec2.length(tangent)
    const unit: Vec2 = length === 0 ? [1, 0] : Vec2.scale(tangent, 1 / length)
    return {
      type: 'linear-gradient',
      from,
      to: Vec2.add(from, Vec2.scale(unit, Sizes.MoveArrowFadeLength)),
      stops: [
        { offset: 0, color: Color4.withAlpha(color, 0) },
        { offset: 1, color },
      ],
    }
  }

  private getSquareCenter(l: number, m: number, coord: CoordSpacelike): Vec2 {
    const [borderPos] = this.getBoardRect(l, m)
    return Vec2.add(borderPos, [
      Sizes.BoardBorder + (coord.x + 0.5) * Sizes.PieceWidth,
      Sizes.BoardBorder + (coord.y + 0.5) * Sizes.PieceWidth,
    ])
  }

  private getBoardRenderLayers(animated: boolean): {
    shadowBase: RenderLayer
    shadowHigh: RenderLayer
    border: RenderLayer
    board: RenderLayer
    piece: RenderLayer
  } {
    return animated
      ? {
          shadowBase: RenderLayer.BoardShadowBase,
          shadowHigh: RenderLayer.BoardShadowHigh,
          border: RenderLayer.AnimatedBoardBorder,
          board: RenderLayer.AnimatedBoard,
          piece: RenderLayer.AnimatedPiece,
        }
      : {
          shadowBase: RenderLayer.BoardShadowBase,
          shadowHigh: RenderLayer.BoardShadowHigh,
          border: RenderLayer.BoardBorder,
          board: RenderLayer.Board,
          piece: RenderLayer.Piece,
        }
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
    layers = this.getBoardRenderLayers(false),
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
