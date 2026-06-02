import { Board, Color, Coord, Line, Multiverse, Piece, Pieces, type CoordSpacelike, type Move } from '@5dcol/core'
import { Effect, clamp } from '@/utils'
import { Color4, Mat3, Vec2, type Camera } from '@engine/basic'
import { ButtonColors, type ButtonColorPreset, CameraControl, Colors, RenderLayer, Sizes } from '@engine/constant'
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

type Rect = [pos: Vec2, size: Vec2]
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

type ScreenRect = [pos: Vec2, size: Vec2]

interface ButtonConfig {
  id: string
  rect: ScreenRect
  disabled: boolean
  colorPreset: ButtonColorPreset
  turnColor: Color
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
      return button.turnColor === Color.W ? ButtonColors.DisabledWhite : ButtonColors.DisabledBlack
    }
    if (hovered) return this.getGreenColors(button.turnColor)
    return button.colorPreset
  }

  private getButtonFill(button: ButtonConfig, colors: ButtonColorPreset): FillStyle {
    if (button.effect !== 'submit-pulse' || button.disabled) return colors.fill

    const phase = (Math.sin(performance.now() / 650) + 1) / 2
    const green = button.turnColor === Color.W ? ButtonColors.Green.fill : ButtonColors.GreenBlack.fill
    const pulseColor = this.mixColor(colors.fill, green, 0.18 + phase * 0.32)

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

  private mixColor(a: Color4, b: Color4, t: number): Color4 {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      1,
    ]
  }

  private getGreenColors(color: Color): ButtonColorPreset {
    return color === Color.W ? ButtonColors.Green : ButtonColors.GreenBlack
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
  private color: Color = Color.W
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

    this.collect(Effect.useListener(window, 'contextmenu', () => {
      this.clearPointerDrag()
    }))

    this.collect(Effect.useListener(window, 'wheel', e => {
      e.preventDefault()
      const camera = this.renderer.getCamera()
      const targetScale = this.cameraMotion?.targetScale ?? camera.scale
      this.cameraMotion = {
        targetScale: clamp(
          targetScale - Math.sign(e.deltaY) * CameraControl.ZoomStep,
          CameraControl.ZoomMin,
          CameraControl.ZoomMax,
        ),
        anchorScreen: this.getViewportCenterScreen(),
      }
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
          disabled: false,
          colorPreset: ButtonColors.Board,
          turnColor: this.color,
          text: 'Deselect',
          piece: this.selectedPiece.piece,
          onClick: () => {
            this.selectedPiece = null
          },
        }
      : {
          id: 'undo-move',
          rect: [[leftX, Sizes.ButtonTop], [Sizes.ButtonWidth, Sizes.ButtonHeight]],
          disabled: this.pendingMove === null,
          colorPreset: ButtonColors.Yellow,
          turnColor: this.color,
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
        disabled: ! this.canSubmitMoves(),
        colorPreset: ButtonColors.White,
        turnColor: this.color,
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
    if (! this.selectedPiece.targets.some(target => this.isSameSquare(target, hit.coord))) return false

    const move: Move = {
      from: {
        ...this.selectedPiece.from,
        l: this.selectedPiece.l,
        t: this.getTurnFromBoardIndex(this.selectedPiece.m, this.color),
      },
      to: {
        ...hit.coord,
        l: hit.l,
        t: this.getTurnFromBoardIndex(hit.m, this.color),
      },
    }
    this.multiverse = Multiverse.applyMove(move, this.color, this.multiverseCommitted)
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
    this.selectedPiece = null
    this.focusBoard(this.pendingMove.created.l, this.pendingMove.created.m)
    return true
  }

  private undoMove() {
    this.multiverse = this.multiverseCommitted
    this.pendingMove = null
    this.selectedPiece = null
  }

  private submitMoves() {
    if (! this.canSubmitMoves()) return

    this.multiverseCommitted = this.multiverse
    this.pendingMove = null
    this.selectedPiece = null
    this.color = this.getOpponentColor(this.color)
    this.actionIndex += 1
  }

  private canSubmitMoves(): boolean {
    return this.pendingMove !== null && this.hasMovedEveryPresentBoard()
  }

  private hasMovedEveryPresentBoard(): boolean {
    const present = Multiverse.getPresent(this.multiverseCommitted, this.color)
    if (! present || ! this.pendingMove) return false
    return present.lines.every(l => (
      this.pendingMove?.from.l === l
      && this.pendingMove.from.m === present.m
    ))
  }

  private getTurnFromBoardIndex(m: number, color: Color): number {
    return (m - color) / 2
  }

  private getOpponentColor(color: Color): Color {
    return color === Color.W ? Color.B : Color.W
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
    coord: CoordSpacelike
  }): PieceSelection | null {
    const piece = Board.getPiece(hit.coord, hit.board)
    if (Pieces.getColor(piece) !== this.color) return null

    return {
      l: hit.l,
      m: hit.m,
      from: hit.coord,
      targets: Board.getMoveTargets2D(hit.board, hit.coord),
      piece,
    }
  }

  private getActiveBoardSquareAtScreen(screen: Vec2): {
    l: number
    m: number
    board: Board
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

      return { l, m, board, coord }
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
    this.smoothCameraToValidViewport(CameraControl.ZoomSmoothing)

    if (scaleNext === this.cameraMotion.targetScale) {
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

  private renderMultiverse() {
    this.renderTimelineTiles()
    this.renderPresent()

    for (const [l, line] of Multiverse.getLineEntries(this.multiverse)) {
      if (! line) continue
      this.renderLine(line, l)
      const activeM = Line.getLatestBoardIndex(line)

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        this.renderBoard(board, l, m, m === activeM, this.isTemporaryBoard(l, m))
      }
    }
  }

  private isTemporaryBoard(l: number, m: number): boolean {
    return this.pendingMove !== null
      && this.pendingMove.created.l === l
      && this.pendingMove.created.m === m
  }

  private renderPresent() {
    const present = Multiverse.getPresent(this.multiverse, this.color)
    if (! present) return

    const [[x, y], [w, h]] = this.getPresentViewportRect(present.m)
    const boardBounds = this.getBoardVerticalBounds()
    const borderColor = this.color === Color.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack
    const fillColor = this.color === Color.W ? Colors.BoardBorderWhiteDim : Colors.BoardBorderBlackDim
    const labelColor = this.color === Color.W ? Colors.BoardBorderBlack : Colors.BoardBorderWhite

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
      color: fillColor,
    })

    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Present,
      mat: Mat3.transform([x, y], [Sizes.PresentBorder, h]),
      color: borderColor,
    })
    this.renderer.submit({
      type: RenderItemType.Quad,
      layer: RenderLayer.Present,
      mat: Mat3.transform([x + w - Sizes.PresentBorder, y], [Sizes.PresentBorder, h]),
      color: borderColor,
    })

    if (boardBounds) {
      this.renderPresentLabels(x, w, boardBounds, labelColor)
      this.renderPresentIcons(x, w, boardBounds)
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
      this.canCreateTimelinePresent(Color.B),
      Colors.BoardBorderBlack,
      Colors.BoardBorderBlackDim,
    )

    const lowerIconCenter: Vec2 = [cx, bounds.bottom + Sizes.TurnHeight * Sizes.PresentIconOffsetTurns]
    this.renderPresentIcon(
      lowerIconCenter,
      1,
      this.canCreateTimelinePresent(Color.W),
      Colors.BoardBorderWhite,
      Colors.BoardBorderWhiteDim,
    )
  }

  private canCreateTimelinePresent(color: Color): boolean {
    return Multiverse.canCreateActiveTimeline(this.multiverse, color)
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
    return this.clampPointToRect(center, [
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

  private clampPointToRect([x, y]: Vec2, [[rx, ry], [rw, rh]]: Rect): Vec2 {
    return [
      clamp(x, rx, rx + rw),
      clamp(y, ry, ry + rh),
    ]
  }

  private renderLine(line: Line, l: number) {
    const points = this.getLinePoints(line, l)

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.LineShadow,
      points: points.map(Vec2.curry.add(Sizes.LineShadowOffset)),
      fill: Colors.Shadow,
      stroke: null,
    })

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer: RenderLayer.Line,
      points,
      fill: Colors.Purple,
      stroke: Colors.PurpleDark,
      strokeWidth: Sizes.LineBorderWidth,
    })
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

  private renderBoard(board: Board, l: number, m: number, isActive: boolean, isTemporary: boolean) {
    const boardColor = m % 2
    const [[borderX, borderY]] = this.getBoardRect(l, m)
    const x0 = borderX + Sizes.BoardBorder
    const y0 = borderY + Sizes.BoardBorder
    const borderColor = isTemporary
      ? ButtonColors.Yellow.border
      : boardColor === Color.B ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
    const activeBorderFill = isTemporary
      ? ButtonColors.Yellow.fill
      : boardColor === Color.B ? Colors.BoardBorderBlackDim : Colors.BoardBorderWhiteDim
    const outerBorder = isActive ? Sizes.ActiveBoardBorder + Sizes.BoardBorder : Sizes.BoardBorder
    const outerBorderPos: Vec2 = [x0 - outerBorder, y0 - outerBorder]
    const outerBorderSize: Vec2 = [
      Sizes.BoardWidth + outerBorder * 2,
      Sizes.BoardWidth + outerBorder * 2,
    ]
    const innerBorderRadius = isActive ? Sizes.ActiveBoardBorderRadius : Sizes.BoardBorderRadius
    const outerBorderRadius = isActive
      ? Sizes.ActiveBoardBorderRadius + Sizes.BoardBorder
      : Sizes.BoardBorderRadius
    const boardFrame: BoardFrame = {
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
    }

    this.renderBoardShadow(boardFrame)

    this.renderer.submit({
      type: RenderItemType.RoundRect,
      layer: RenderLayer.BoardBorder,
      pos: outerBorderPos,
      size: outerBorderSize,
      radius: outerBorderRadius,
      fill: borderColor,
      stroke: null,
    })

    if (isActive) {
      this.renderer.submit({
        type: RenderItemType.RoundRect,
        layer: RenderLayer.BoardBorder,
        pos: [
          x0 - Sizes.ActiveBoardBorder,
          y0 - Sizes.ActiveBoardBorder,
        ],
        size: [
          Sizes.BoardWidth + Sizes.ActiveBoardBorder * 2,
          Sizes.BoardWidth + Sizes.ActiveBoardBorder * 2,
        ],
        radius: innerBorderRadius,
        fill: activeBorderFill,
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
        layer: RenderLayer.Board,
        mat: Mat3.transform(pos, Sizes.PieceSize),
        color,
      })

      const piece = board.pieces[x][y]
      if (piece !== Piece.E) this.renderPiece(piece, pos)
      if (this.shouldRenderPieceGhost(l, m, coord)) this.renderPieceGhost(this.selectedPiece!.piece, pos)
    }
  }

  private isHighlightedBoardSquare(l: number, m: number, coord: CoordSpacelike): boolean {
    if (this.hoverSquare && this.isSameLocatedSquare(this.hoverSquare, l, m, coord)) return true

    const selection = this.selectedPiece ?? this.hoverPiece
    if (! selection) return false
    if (selection.l !== l || selection.m !== m) return false
    if (this.isSameSquare(selection.from, coord)) return true
    return selection.targets.some(target => this.isSameSquare(target, coord))
  }

  private shouldRenderPieceGhost(l: number, m: number, coord: CoordSpacelike): boolean {
    if (! this.selectedPiece || ! this.hoverSquare) return false
    if (! this.isSameLocatedSquare(this.hoverSquare, l, m, coord)) return false
    if (this.selectedPiece.l !== l || this.selectedPiece.m !== m) return false
    return this.selectedPiece.targets.some(target => this.isSameSquare(target, coord))
  }

  private isSameLocatedSquare(square: SquareHover, l: number, m: number, coord: CoordSpacelike): boolean {
    return square.l === l && square.m === m && this.isSameSquare(square.coord, coord)
  }

  private isSameSquare(a: CoordSpacelike, b: CoordSpacelike): boolean {
    return a.x === b.x && a.y === b.y
  }

  private renderBoardShadow(frame: BoardFrame) {
    const pos = Vec2.add(frame.pos, Sizes.BoardShadowOffset)
    const size = frame.size
    this.renderBoardShadowRect([pos, size], frame.radius, RenderLayer.BoardShadowBase)

    this.renderBoardShadowRect(
      [
        Vec2.add(pos, [Sizes.ShadowShrink, 0]),
        Vec2.add(size, [-Sizes.ShadowShrink, -Sizes.ShadowShrink]),
      ],
      frame.radius,
      RenderLayer.BoardShadowHigh,
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

  private renderPiece(piece: Piece, pos: Vec2) {
    this.renderer.submit({
      type: RenderItemType.Texture,
      layer: RenderLayer.Piece,
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
