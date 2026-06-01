import { Board, Color, Coord, Line, Multiverse, Piece } from '@5dcol/core'
import { Effect, clamp } from '@/utils'
import { Color4, Mat3, Vec2, type Camera } from '@engine/basic'
import { Colors, RenderLayer, Sizes } from '@engine/constant'
import { type Logger } from '@engine/logger'
import { CircleRenderItem, type Renderer, RenderItemType } from '@engine/renderer'
import { PIECE_TO_TEXTURE_ID } from '@engine/texture'

export interface GameConfig {
  fps: number
  debug: boolean
  logger: Logger
  renderer: Renderer
}

interface PointerState {
  screen: Vec2
  dragStartScreen: Vec2 | null
  dragLastScreen: Vec2 | null
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

const PRESENT_LABEL = 'The Present'
const PRESENT_LABEL_FONT = 'Georgia, Times New Roman, serif'

export class Game {
  constructor(public readonly config: GameConfig) {
    this.logger = config.logger
    this.renderer = config.renderer
  }

  public readonly logger: Logger
  public readonly renderer: Renderer

  private readonly multiverse = Multiverse.createInitial()
  private color: Color = Color.W
  private readonly pointer: PointerState = {
    screen: [0, 0],
    dragStartScreen: null,
    dragLastScreen: null,
  }
  private readonly effects: Effect[] = []
  private cameraMotion: CameraMotion | null = null

  private animationFrame: number | null = null
  private lastLoopTime = 0
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
    this.collect(Effect.useListener(window, 'resize', () => this.renderer.resize()))

    this.collect(Effect.useListener(window, 'mousemove', e => {
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      this.panByPointerDrag(screen)
    }))

    this.collect(Effect.useListener(window, 'mousedown', e => {
      if (e.button !== 0) return
      const screen: Vec2 = [e.clientX, e.clientY]
      this.pointer.screen = screen
      this.pointer.dragStartScreen = screen
      this.pointer.dragLastScreen = screen
    }))

    this.collect(Effect.useListener(window, 'mouseup', () => {
      this.pointer.dragStartScreen = null
      this.pointer.dragLastScreen = null
    }))

    this.collect(Effect.useListener(window, 'wheel', e => {
      e.preventDefault()
      const camera = this.renderer.getCamera()
      const targetScale = this.cameraMotion?.targetScale ?? camera.scale
      this.cameraMotion = {
        targetScale: clamp(
          targetScale - Math.sign(e.deltaY) * Sizes.CameraZoomStep,
          Sizes.CameraZoomMin,
          Sizes.CameraZoomMax,
        ),
        anchorScreen: [e.clientX, e.clientY],
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

  private loop = (now: number) => {
    const interval = 1000 / this.config.fps

    if (now - this.lastLoopTime >= interval) {
      this.lastLoopTime = now
      this.updateCameraMotion()
      this.updateCameraBounds()
      this.render()
      this.renderer.flush()
    }

    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private render() {
    this.renderMultiverse()
    if (this.config.debug) {
      this.renderPointer()
    }
  }

  private updateCameraMotion() {
    if (! this.cameraMotion) return

    const camera = this.renderer.getCamera()
    const scaleDelta = this.cameraMotion.targetScale - camera.scale
    const scaleNext = Math.abs(scaleDelta) <= Sizes.CameraZoomSnapEpsilon
      ? this.cameraMotion.targetScale
      : camera.scale + scaleDelta * Sizes.CameraZoomSmoothing

    this.setCameraScaleAt(this.cameraMotion.anchorScreen, scaleNext)
    this.smoothCameraToValidViewport(Sizes.CameraZoomSmoothing)

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

  private updateCameraBounds() {
    if (this.cameraMotion) return
    if (this.pointer.dragLastScreen) return

    const validViewport = this.getValidViewportRect()
    if (! validViewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.clampCameraCenterToViewport(camera.center, validViewport)
    const delta = Vec2.sub(targetCenter, camera.center)

    if (Vec2.length(delta) <= Sizes.CameraBounceBackSnapEpsilon) {
      this.renderer.setCamera({ center: targetCenter })
      return
    }

    this.renderer.setCamera({
      center: Vec2.add(camera.center, Vec2.scale(delta, Sizes.CameraBounceBackSmoothing)),
    })
  }

  private smoothCameraToValidViewport(smoothing: number) {
    const validViewport = this.getValidViewportRect()
    if (! validViewport) return

    const camera = this.renderer.getCamera()
    const targetCenter = this.clampCameraCenterToViewport(camera.center, validViewport)
    const delta = Vec2.sub(targetCenter, camera.center)
    if (Vec2.length(delta) <= Sizes.CameraBounceBackSnapEpsilon) {
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
        this.renderBoard(board, l, m, m === activeM)
      }
    }
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
      return pointsModel.map((p) => Vec2.add(center, p))
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

    for (let t = t0; t < t1; t ++) {
      for (let l = l0; l < l1; l ++) {
        const [turnPos, turnSize] = this.getTurnRect(l, t)

        this.renderer.submit({
          type: RenderItemType.Quad,
          layer: RenderLayer.BoardTime,
          mat: Mat3.transform(turnPos, turnSize),
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
    const size: Vec2 = [
      Math.max(boardViewport[1][0], screenWorldSize[0]),
      Math.max(boardViewport[1][1], screenWorldSize[1]),
    ]
    return [
      Vec2.sub(center, Vec2.scale(size, 0.5)),
      size,
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
      points: points.map(point => Vec2.add(point, Sizes.LineShadowOffset)),
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

    const xTip = line.boards.length * (Sizes.BoardWidth + Sizes.BoardGap)

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

  private renderBoard(board: Board, l: number, m: number, isActive: boolean) {
    const color = m % 2
    const [[borderX, borderY]] = this.getBoardRect(l, m)
    const x0 = borderX + Sizes.BoardBorder
    const y0 = borderY + Sizes.BoardBorder
    const borderColor = color === Color.B ? Colors.BoardBorderBlack : Colors.BoardBorderWhite
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
        fill: color === Color.B ? Colors.BoardBorderBlackDim : Colors.BoardBorderWhiteDim,
        stroke: null,
      })
    }

    for (const [x, y] of Coord.spacelikes()) {
      const pos: Vec2 = [
        x0 + x * Sizes.PieceWidth,
        y0 + y * Sizes.PieceWidth,
      ]

      this.renderer.submit({
        type: RenderItemType.Quad,
        layer: RenderLayer.Board,
        mat: Mat3.transform(pos, Sizes.PieceSize),
        color: (x + y) % 2 === 0 ? Colors.BoardWhite : Colors.BoardBlack,
      })

      const piece = board.pieces[x][y]
      if (piece !== Piece.E) this.renderPiece(piece, pos)
    }
  }

  private renderBoardShadow(frame: BoardFrame) {
    const rect: Rect = [
      Vec2.add(frame.pos, Sizes.BoardShadowOffset),
      [...frame.size],
    ]
    this.renderBoardShadowRect(rect, frame.radius, RenderLayer.BoardShadowBase)

    this.renderBoardShadowRect(
      [
        rect[0],
        [
          rect[1][0],
          Math.max(0, rect[1][1] - Sizes.ShadowShrink),
        ],
      ],
      frame.radius,
      RenderLayer.BoardShadowPresent,
    )

    this.renderBoardShadowRect(
      [
        [
          rect[0][0] + Sizes.ShadowShrink,
          rect[0][1],
        ],
        [
          Math.max(0, rect[1][0] - Sizes.ShadowShrink),
          rect[1][1],
        ],
      ],
      frame.radius,
      RenderLayer.BoardShadowLine,
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
