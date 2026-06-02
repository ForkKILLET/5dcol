import { Board, Player, Players as CorePlayers, Coord, Line, Multiverse, Piece, Pieces, type CoordSpacelike, type Move } from '@5dcol/core'
import { Effect } from '@/utils'
import { Color4, Mat3, Rect, Scalar, Vec2, type Camera } from '@engine/basic'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, RenderLayer, Sizes, Animations } from '@engine/constant'
import { type Logger } from '@engine/logger'
import { CircleRenderItem, type FillStyle, type Renderer, RenderItemType } from '@engine/renderer'
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
}
interface PieceSelection {
  l: number
  m: number
  from: CoordSpacelike
  targets: CoordSpacelike[]
  piece: Piece
}
interface SquareHover {
  l: number
  m: number
  coord: CoordSpacelike
}
interface PendingMove {
  move: Move
  from: {
    l: number
    m: number
  }
  created: {
    l: number
    m: number
  }
}
interface MoveAnimation {
  startedAt: number
}
interface BoardRenderOptions {
  activeProgress?: number
  temporaryProgress?: number
  pos?: Vec2
  animatedLayer?: boolean
  basePlayer?: Player
}
interface PresentColors {
  border: Color4
  fill: Color4
  label: Color4
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
  effect?: 'submit-pulse'
  onClick: () => void
}

const PRESENT_LABEL = 'The Present'
const PRESENT_LABEL_FONT = 'Georgia, Times New Roman, serif'
const UI_FONT = 'Georgia, Times New Roman, serif'
const POINTER_CLICK_THRESHOLD = 3
const PIECE_GHOST_ALPHA = 0.45

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
    const fill = this.getButtonFill(button, colors)
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
      fill,
      colors.border,
    )

    this.renderContent(renderer, button, bodyRect)
  }

  private getButtonAt(screen: Vec2): ButtonConfig | null {
    return this.buttons.find(button => this.contains(button.rect, screen)) ?? null
  }

  private getButtonColors(button: ButtonConfig, hovered: boolean): ButtonColorPreset {
    if (button.disabled) {
      return button.turnPlayer === Player.W ? ButtonColors.DisabledWhite : ButtonColors.DisabledBlack
    }
    if (hovered) return this.getGreenColors(button.turnPlayer)
    return button.colorPreset
  }

  private getButtonFill(button: ButtonConfig, colors: ButtonColorPreset): FillStyle {
    if (button.effect !== 'submit-pulse' || button.disabled) return colors.fill

    const phase = (Math.sin(performance.now() / 650) + 1) / 2
    const green = button.turnPlayer === Player.W ? ButtonColors.Green.fill : ButtonColors.GreenBlack.fill
    const pulseColor = Color4.mix(colors.fill, green, 0.18 + phase * 0.32)

    return {
      type: 'linear-gradient',
      from: [0, 0],
      to: [button.rect[1][0], button.rect[1][1]],
      stops: [
        { offset: 0, color: colors.fill },
        { offset: 0.45, color: pulseColor },
        { offset: 1, color: colors.fill },
      ],
    }
  }

  private getGreenColors(player: Player): ButtonColorPreset {
    return player === Player.W ? ButtonColors.Green : ButtonColors.GreenBlack
  }

  private renderContent(renderer: Renderer, button: ButtonConfig, [[x, y], [w, h]]: ScreenRect) {
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
      color: button.disabled ? Colors.ButtonDisabledText : Colors.ButtonText,
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
  private moveAnimation: MoveAnimation | null = null

  private animationFrame: number | null = null
  private resizeDirty = false
  private disposed = false

  public start() {
    this.renderer.start()
    this.focusInitialTurn()
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

    this.renderer.setCamera({
      center: Vec2.sub(camera.center, delta),
    })
    this.clampCameraToRenderViewport()
    this.syncCameraMotion()
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
    this.setCameraMotion({
      targetCenter: this.clampCameraCenterToValidViewportIfAvailable(
        Vec2.add(targetCenter, Vec2.scale(direction, step)),
      ),
    })
  }

  private zoomCameraByStep(step: number) {
    const camera = this.renderer.getCamera()
    const targetScale = this.cameraMotion?.targetScale ?? camera.scale
    this.setCameraMotion({
      targetScale: Scalar.clamp(
        targetScale + step,
        CameraControl.ZoomMin,
        CameraControl.ZoomMax,
      ),
    })
  }

  private setCameraMotion(motion: Partial<CameraMotion>) {
    const camera = this.renderer.getCamera()
    this.cameraMotion = {
      targetCenter: motion.targetCenter ?? this.cameraMotion?.targetCenter ?? camera.center,
      targetScale: motion.targetScale ?? this.cameraMotion?.targetScale ?? camera.scale,
      anchorScreen: motion.anchorScreen ?? this.cameraMotion?.anchorScreen ?? this.getViewportCenterScreen(),
    }
  }

  public focusTurn(l: number, m: number) {
    this.focusRect(this.getTurnRect(l, m))
  }

  public focusBoard(l: number, m: number) {
    this.focusRect(this.getBoardRect(l, m))
  }

  private focusInitialTurn() {
    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue
      this.focusTurn(l, line.mStart)
      return
    }
  }

  private focusRect(rect: Rect) {
    const [pos, size] = rect
    this.renderer.setCamera({
      center: Vec2.add(pos, Vec2.scale(size, 0.5)),
    })
    this.syncCameraMotion()
  }

  private getTurnRect(l: number, m: number): Rect {
    return [
      [
        Sizes.TurnWidth * m - Sizes.BoardMargin,
        - Sizes.TurnHeight * (l + 0.5),
      ],
      Sizes.TurnSize,
    ]
  }

  private getBoardRect(l: number, m: number): Rect {
    return [
      [
        m * (Sizes.BoardWidth + Sizes.BoardGap) - Sizes.BoardBorder,
        - l * (Sizes.BoardWidth + Sizes.BoardGap) - Sizes.BoardWidth * 0.5 - Sizes.BoardBorder,
      ],
      Sizes.BoardBorderSize,
    ]
  }

  private loop = () => {
    this.updateScreen()
    this.updateCameraMotion()
    this.updateCameraBounds()
    this.render()
    this.renderer.flush()
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

    const hit = this.getActiveBoardSquareAtScreen(this.pointer.screen)
    this.hoverSquare = hit ? { l: hit.l, m: hit.m, coord: hit.coord } : null
    this.hoverPiece = this.selectedPiece || this.pendingMove || ! hit ? null : this.getPieceSelectionFromHit(hit)
    this.buttonControl.set(this.getToolbarButtons())
  }

  private getToolbarButtons(): ButtonConfig[] {
    const { widthCss } = this.renderer.getScreen()
    const gap = Sizes.ButtonContentGap * 2
    const leftX = (widthCss - Sizes.ButtonWidth * 2 - gap) / 2
    const rightX = leftX + Sizes.ButtonWidth + gap

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
          disabled: this.pendingMove === null,
          colorPreset: ButtonColors.Yellow,
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
        disabled: ! this.canSubmitMoves() || this.isMoveAnimating(),
        colorPreset: ButtonColors.White,
        turnPlayer: this.player,
        text: 'Submit Moves',
        piece: null,
        effect: 'submit-pulse',
        onClick: () => {
          this.submitMoves()
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
    if (this.pendingMove) return
    const selection = this.getPieceSelectionAtScreen(screen)
    if (! selection) return
    this.selectedPiece = selection
  }

  private tryCreateMoveAt(screen: Vec2): boolean {
    if (! this.selectedPiece || this.pendingMove) return false

    const hit = this.getActiveBoardSquareAtScreen(screen)
    if (! hit) return false
    if (hit.l !== this.selectedPiece.l || hit.m !== this.selectedPiece.m) return false
    if (! this.selectedPiece.targets.some(target => Coord.isSameSpace(target, hit.coord))) return false

    const move: Move = {
      from: {
        ...this.selectedPiece.from,
        l: this.selectedPiece.l,
        t: Coord.turn(this.selectedPiece.m, this.player),
      },
      to: {
        ...hit.coord,
        l: hit.l,
        t: Coord.turn(hit.m, this.player),
      },
    }
    this.multiverse = Multiverse.applyMove(move, this.player, this.multiverseCommitted)
    this.pendingMove = {
      move,
      from: {
        l: this.selectedPiece.l,
        m: this.selectedPiece.m,
      },
      created: {
        l: hit.l,
        m: hit.m + 1,
      },
    }
    this.moveAnimation = { startedAt: performance.now() }
    this.selectedPiece = null
    return true
  }

  private undoMove() {
    if (! this.pendingMove) return
    this.multiverse = this.multiverseCommitted
    this.pendingMove = null
    this.moveAnimation = null
    this.deselectPiece()
  }

  private submitMoves() {
    if (this.isMoveAnimating()) return
    if (! this.canSubmitMoves()) return

    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.moveAnimation = null
    this.deselectPiece()
    this.player = CorePlayers.opponent(this.player)
    this.actionIndex += 1
  }

  private deselectPiece() {
    this.selectedPiece = null
  }

  private canSubmitMoves(): boolean {
    return this.pendingMove !== null && this.hasMovedEveryPresentBoard()
  }

  private isMoveAnimating(): boolean {
    return this.getMoveAnimationProgress() < 1
  }

  private getMoveAnimationProgress(): number {
    if (! this.moveAnimation) return 1
    return Scalar.clamp(
      (performance.now() - this.moveAnimation.startedAt) / Animations.MoveAnimationDuration,
      0,
      1,
    )
  }

  private getMoveAnimationEase(): number {
    const t = this.getMoveAnimationProgress()
    return t * t * (3 - 2 * t)
  }

  private hasMovedEveryPresentBoard(): boolean {
    const present = Multiverse.getPresent(this.multiverseCommitted, this.player)
    if (! present || ! this.pendingMove) return false
    return present.lines.every(l => (
      this.pendingMove?.from.l === l
      && this.pendingMove.from.m === present.m
    ))
  }

  private getPieceSelectionAtScreen(screen: Vec2): PieceSelection | null {
    const hit = this.getActiveBoardSquareAtScreen(screen)
    if (! hit) return null
    return this.getPieceSelectionFromHit(hit)
  }

  private getPieceSelectionFromHit(hit: {
    l: number
    m: number
    board: Board
    previousBoard: Board | null
    coord: CoordSpacelike
  }): PieceSelection | null {
    const piece = Board.getPiece(hit.coord, hit.board)
    if (Pieces.getPlayer(piece) !== this.player) return null

    return {
      l: hit.l,
      m: hit.m,
      from: hit.coord,
      targets: Board.getMoveTargets2D(hit.board, hit.coord, {
        previousBoard: hit.previousBoard,
      }),
      piece,
    }
  }

  private getActiveBoardSquareAtScreen(screen: Vec2): {
    l: number
    m: number
    board: Board
    previousBoard: Board | null
    coord: CoordSpacelike
  } | null {
    const world = this.renderer.screenToWorld(screen)

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue

      const m = Line.getLatestBoardIndex(line)
      if (m === null) continue

      const board = line.boards[m]
      if (! board) continue

      const [[borderX, borderY]] = this.getBoardRect(l, m)
      const x0 = borderX + Sizes.BoardBorder
      const y0 = borderY + Sizes.BoardBorder
      const x = Math.floor((world[0] - x0) / Sizes.PieceWidth)
      const y = Math.floor((world[1] - y0) / Sizes.PieceWidth)
      const coord = { x, y }
      if (! Coord.isInBoard(coord)) continue

      return { l, m, board, previousBoard: line.boards[m - 1] ?? null, coord }
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

    this.smoothCameraToValidViewport(CameraControl.BounceBackSmoothing)

    const cameraAfterBounds = this.renderer.getCamera()
    this.cameraMotion.targetCenter = this.clampCameraCenterToValidViewportIfAvailable(this.cameraMotion.targetCenter)

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

  private smoothCameraToValidViewport(smoothing: number) {
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
      center: Vec2.add(camera.center, Vec2.scale(delta, smoothing)),
    })
  }

  private clampCameraCenterToValidViewportIfAvailable(center: Vec2): Vec2 {
    const validViewport = this.getValidViewportRect()
    if (! validViewport) return center
    return this.clampCameraCenterToViewport(center, validViewport)
  }

  private renderMultiverse() {
    this.renderTimelineTiles()
    if (this.pendingMove && this.isMoveAnimating()) {
      this.renderMultiversePendingAnimation(this.pendingMove, this.getMoveAnimationEase())
      return
    }

    this.renderPresent(this.multiverse, this.getPresentDisplayColor())
    this.renderMultiverseStatic(this.multiverse)
  }

  private renderMultiverseStatic(multiverse: Multiverse) {
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      this.renderLine(line, l)
      const activeM = Line.getLatestBoardIndex(line)

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        this.renderBoard(board, l, m, m === activeM, this.isTemporaryBoard(l, m))
      }
    }
  }

  private renderMultiversePendingAnimation(pendingMove: PendingMove, progress: number) {
    this.followPendingBoardAnimation(pendingMove, progress)
    this.renderPresentAnimated(progress)

    for (const [l, lineCommitted] of Multiverse.getLineEntries(this.multiverseCommitted)) {
      if (! lineCommitted) continue

      const linePreview = Multiverse.getLine(this.multiverse, l)
      const isPendingLine = l === pendingMove.from.l
      const activeCommitted = Line.getLatestBoardIndex(lineCommitted)

      if (isPendingLine && activeCommitted !== null) {
        this.renderLineDuringMoveAnimation(lineCommitted, l, progress)
      }
      else {
        this.renderLine(linePreview ?? lineCommitted, l)
      }

      for (const [m, board] of Line.getBoardEntries(lineCommitted)) {
        if (! board) continue
        if (isPendingLine && m === pendingMove.from.m) {
          this.renderBoard(board, l, m, true, false, {
            activeProgress: 1 - progress,
          })
          continue
        }
        this.renderBoard(board, l, m, m === activeCommitted, false)
      }

      if (! isPendingLine || ! linePreview) continue

      const createdBoard = linePreview.boards[pendingMove.created.m]
      if (! createdBoard) continue

      const [fromPos] = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
      const [toPos] = this.getBoardRect(pendingMove.created.l, pendingMove.created.m)
      this.renderBoard(createdBoard, pendingMove.created.l, pendingMove.created.m, true, true, {
        activeProgress: 1,
        temporaryProgress: progress,
        pos: Vec2.mix(fromPos, toPos, progress),
        animatedLayer: true,
        basePlayer: pendingMove.from.m % 2,
      })
    }
  }

  private followPendingBoardAnimation(pendingMove: PendingMove, progress: number) {
    const [fromPos, fromSize] = this.getBoardRect(pendingMove.from.l, pendingMove.from.m)
    const [toPos] = this.getBoardRect(pendingMove.created.l, pendingMove.created.m)
    const center = Vec2.add(Vec2.mix(fromPos, toPos, progress), Vec2.scale(fromSize, 0.5))
    this.renderer.setCamera({
      center: this.clampCameraCenterToValidViewportIfAvailable(center),
    })
    this.syncCameraMotion()
  }

  private isTemporaryBoard(l: number, m: number): boolean {
    return this.pendingMove !== null
      && this.pendingMove.created.l === l
      && this.pendingMove.created.m === m
  }

  private renderPresent(multiverse: Multiverse, displayPlayer: Player) {
    const present = Multiverse.getPresent(multiverse, this.player)
    if (! present) return

    this.renderPresentAt(present.m, this.getPresentColors(displayPlayer))
  }

  private renderPresentAnimated(progress: number) {
    const presentCommitted = Multiverse.getPresent(this.multiverseCommitted, this.player)
    const presentPreview = Multiverse.getPresent(this.multiverse, this.player)
    if (! presentCommitted || ! presentPreview) return

    const [[x0]] = this.getPresentViewportRect(presentCommitted.m)
    const [[x1]] = this.getPresentViewportRect(presentPreview.m)
    const colors = this.mixPresentColors(
      this.getPresentColors(this.player),
      this.getPresentColors(CorePlayers.opponent(this.player)),
      progress,
    )
    this.renderPresentAt(presentPreview.m, colors, x0 + (x1 - x0) * progress)
  }

  private renderPresentAt(m: number, colors: PresentColors, xOverride?: number) {
    const [[xRect, y], [w, h]] = this.getPresentViewportRect(m)
    const x = xOverride ?? xRect
    const boardBounds = this.getBoardVerticalBounds()

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
    return this.pendingMove ? CorePlayers.opponent(this.player) : this.player
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

  private getBoardVerticalBounds(): VerticalBounds | null {
    let top = Infinity
    let bottom = -Infinity

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
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

  private getBoardViewportRect(): Rect | null {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
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

  private getValidViewportRect(): Rect | null {
    const boardViewport = this.getBoardViewportRect()
    if (! boardViewport) return null

    const center = Vec2.add(boardViewport[0], Vec2.scale(boardViewport[1], 0.5))
    const screenWorldSize = this.getScreenWorldSize()
    const horizontalPadding = this.getValidViewportHorizontalPadding(screenWorldSize[0])
    const size: Vec2 = [
      Math.max(boardViewport[1][0] + horizontalPadding * 2, screenWorldSize[0]),
      Math.max(boardViewport[1][1], screenWorldSize[1]),
    ]
    return [
      Vec2.sub(center, Vec2.scale(size, 0.5)),
      size,
    ]
  }

  private getValidViewportHorizontalPadding(screenWorldWidth: number): number {
    return Math.max(0, (screenWorldWidth - Sizes.TurnWidth / 2) / 2)
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

  private clampCameraToRenderViewport() {
    const renderViewport = this.getRenderViewportRect()
    if (! renderViewport) return

    const camera = this.renderer.getCamera()
    this.renderer.setCamera({
      center: this.clampCameraCenterToViewport(camera.center, renderViewport),
    })
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

  private renderLine(line: Line, l: number) {
    const points = this.getLinePoints(line, l)
    this.renderLinePolygon(points, 1)
  }

  private renderLineDuringMoveAnimation(line: Line, l: number, progress: number) {
    const latestM = Line.getLatestBoardIndex(line)
    if (latestM === null) {
      this.renderLine(line, l)
      return
    }

    this.renderLineStableSegment(line, l, latestM)
    const oldSegment = this.getLineLatestSegmentGeometry(latestM, l)
    this.renderLinePolygon(oldSegment.points, 1 - progress)
    this.renderLineBridgeSegment(latestM, l, oldSegment.xStart, progress)
    this.renderLinePolygon(this.getMovingLineLatestSegmentPoints(latestM, l, progress), progress)
  }

  private renderLinePolygon(points: Vec2[], alpha: number) {
    if (alpha <= 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.LineShadow,
      points: points.map(Vec2.curry.add(Sizes.LineShadowOffset)),
      fill: Color4.withAlpha(Colors.Shadow, alpha),
      stroke: null,
    })

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Line,
      points,
      fill: Color4.withAlpha(Colors.Purple, alpha),
      stroke: Color4.withAlpha(Colors.PurpleDark, alpha),
      strokeWidth: Sizes.LineBorderWidth,
    })
  }

  private renderLineStableSegment(line: Line, l: number, latestM: number) {
    const y = - l * (Sizes.BoardWidth + Sizes.BoardGap)
    const xStart = line.mStart * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEnd = latestM * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    if (xEnd <= xStart) return

    this.renderLinePolygon([
      [xStart, y - Sizes.LineArrowRadius],
      [xEnd, y - Sizes.LineArrowRadius],
      [xEnd, y + Sizes.LineArrowRadius],
      [xStart, y + Sizes.LineArrowRadius],
    ], 1)
  }

  private renderLineBridgeSegment(m: number, l: number, xStart: number, progress: number) {
    const y = - l * (Sizes.BoardWidth + Sizes.BoardGap)
    const xEndFrom = m * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEndTo = (m + 1) * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth
    const xEnd = Scalar.lerp(xEndFrom, xEndTo, progress)
    if (xEnd <= xStart) return

    this.renderLinePolygon([
      [xStart, y - Sizes.LineArrowRadius],
      [xEnd, y - Sizes.LineArrowRadius],
      [xEnd, y + Sizes.LineArrowRadius],
      [xStart, y + Sizes.LineArrowRadius],
    ], progress)
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
    const y = - l * (Sizes.BoardWidth + Sizes.BoardGap)
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

  private getLinePoints(line: Line, l: number): Vec2[] {
    const y = - l * (Sizes.BoardWidth + Sizes.BoardGap)
    const yUp = y - Sizes.LineArrowRadius
    const yDown = y + Sizes.LineArrowRadius

    const xStart = line.mStart * (Sizes.BoardWidth + Sizes.BoardGap) + Sizes.BoardWidth

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
    const borderColor = Color4.mix(baseBorderColor, ButtonColors.Yellow.border, temporaryProgress)
    const activeBorderFill = Color4.mix(baseActiveBorderFill, ButtonColors.Yellow.fill, temporaryProgress)
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

    this.renderBoardShadow(boardFrame, layers)

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
      const color = this.isHighlightedBoardSquare(l, m, coord)
        ? (isWhiteSquare ? Colors.BoardHighlightWhite : Colors.BoardHighlightBlack)
        : (isWhiteSquare ? Colors.BoardWhite : Colors.BoardBlack)

      this.renderer.submit({
        type: RenderItemType.Quad,
        layer: layers.board,
        mat: Mat3.transform(pos, Sizes.PieceSize),
        color,
      })

      const piece = board.pieces[x][y]
      if (piece !== Piece.E) this.renderPiece(piece, pos, layers.piece)
      if (this.shouldRenderPieceGhost(l, m, coord)) this.renderPieceGhost(this.selectedPiece!.piece, pos)
    }
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
    if (selection.l !== l || selection.m !== m) return false
    if (Coord.isSameSpace(selection.from, coord)) return true
    return selection.targets.some(target => Coord.isSameSpace(target, coord))
  }

  private shouldRenderPieceGhost(l: number, m: number, coord: CoordSpacelike): boolean {
    if (! this.selectedPiece || ! this.hoverSquare) return false
    if (! isSameLocatedSquare(this.hoverSquare, l, m, coord)) return false
    if (this.selectedPiece.l !== l || this.selectedPiece.m !== m) return false
    return this.selectedPiece.targets.some(target => Coord.isSameSpace(target, coord))
  }

  private renderBoardShadow(
    frame: BoardFrame,
    layers = this.getBoardRenderLayers(false),
  ) {
    const pos = Vec2.add(frame.pos, Sizes.BoardShadowOffset)
    const size = frame.size
    this.renderBoardShadowRect([pos, size], frame.radius, layers.shadowBase)

    this.renderBoardShadowRect(
      [
        Vec2.add(pos, [Sizes.ShadowShrink, 0]),
        Vec2.add(size, [-Sizes.ShadowShrink, -Sizes.ShadowShrink]),
      ],
      frame.radius,
      layers.shadowHigh,
    )
  }

  private renderBoardShadowRect([pos, size]: Rect, radius: number, layer: RenderLayer) {
    if (size[0] <= 0 || size[1] <= 0) return

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer,
      pos,
      size,
      radius,
      fill: Colors.Shadow,
      stroke: null,
    })
  }

  private renderPiece(piece: Piece, pos: Vec2, layer: RenderLayer = RenderLayer.Piece) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer,
      mat: Mat3.transform(pos, Sizes.PieceSize),
      textureId: PIECE_TO_TEXTURE_ID.get(piece)!,
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
