import { Line, Multiverse, Player, type CoordSpacelike } from '@5dcol/core'
import { Rect, Vec2, type Rect as RectType, type Vec2 as Vec2Type } from '@engine/basic'
import { Sizes } from '@engine/constant'
import { type Renderer } from '@engine/renderer'

export interface VerticalBounds {
  top: number
  bottom: number
}

export interface ViewportInsets {
  left: number
  right: number
  top: number
  bottom: number
}

const DEFAULT_VIEWPORT_INSETS: ViewportInsets = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
}

export class GameLayout {
  constructor(private readonly renderer: Renderer) {}

  private viewportInsets: ViewportInsets = { ...DEFAULT_VIEWPORT_INSETS }
  private viewPlayer: Player = Player.W
  private hasNegativeZeroLine = false

  setViewPlayer(player: Player) {
    this.viewPlayer = player
  }

  setMultiverse(multiverse: Multiverse) {
    this.hasNegativeZeroLine = Multiverse.hasNegativeZeroLine(multiverse)
  }

  getDisplayLine(l: number): number {
    return this.orientDisplayLine(this.getLineDisplayOffset(l))
  }

  getLogicalLine(displayLine: number): number {
    return this.getLineFromDisplayOffset(this.orientDisplayLine(displayLine))
  }

  setViewportInsets(insets: Partial<ViewportInsets>) {
    this.viewportInsets = {
      left: Math.max(0, insets.left ?? this.viewportInsets.left),
      right: Math.max(0, insets.right ?? this.viewportInsets.right),
      top: Math.max(0, insets.top ?? this.viewportInsets.top),
      bottom: Math.max(0, insets.bottom ?? this.viewportInsets.bottom),
    }
  }

  getTurnRect(l: number, m: number): RectType {
    return [
      [
        Sizes.TurnWidth * m - Sizes.BoardMargin,
        this.getTurnY(l) - Sizes.TurnHeight / 2,
      ],
      Sizes.TurnSize,
    ]
  }

  getBoardRect(l: number, m: number): RectType {
    return [
      [
        m * (Sizes.BoardWidth + Sizes.BoardGap) - Sizes.BoardBorder,
        this.getLineY(l) - Sizes.BoardWidth * 0.5 - Sizes.BoardBorder,
      ],
      Sizes.BoardBorderSize,
    ]
  }

  getTurnY(l: number): number {
    return this.getDisplayLine(l) * Sizes.TurnHeight
  }

  getLineY(l: number): number {
    return this.getDisplayLine(l) * (Sizes.BoardWidth + Sizes.BoardGap)
  }

  getSquareCenter(l: number, m: number, coord: CoordSpacelike): Vec2Type {
    const [borderPos] = this.getBoardRect(l, m)
    return Vec2.add(borderPos, [
      Sizes.BoardBorder + (coord.x + 0.5) * Sizes.PieceWidth,
      Sizes.BoardBorder + (coord.y + 0.5) * Sizes.PieceWidth,
    ])
  }

  getViewportScreenRect(): RectType {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const left = Math.min(this.viewportInsets.left, widthCss)
    const top = Math.min(this.viewportInsets.top, heightCss)
    const right = Math.min(this.viewportInsets.right, Math.max(0, widthCss - left))
    const bottom = Math.min(this.viewportInsets.bottom, Math.max(0, heightCss - top))
    return [
      [left, top],
      [
        Math.max(1, widthCss - left - right),
        Math.max(1, heightCss - top - bottom),
      ],
    ]
  }

  getViewportScreenSize(): Vec2Type {
    return this.getViewportScreenRect()[1]
  }

  getViewportCenterScreen(): Vec2Type {
    return Rect.center(this.getViewportScreenRect())
  }

  getViewportWorldCenter(cameraCenter: Vec2Type, scale: number): Vec2Type {
    return Vec2.add(cameraCenter, this.getViewportWorldOffset(scale))
  }

  getCameraCenterForViewportWorldCenter(worldCenter: Vec2Type, scale: number): Vec2Type {
    return Vec2.sub(worldCenter, this.getViewportWorldOffset(scale))
  }

  getPresentViewportRect(m: number): RectType {
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

  getBoardVerticalBounds(multiverse: Multiverse): VerticalBounds | null {
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

  getBoardViewportRect(multiverse: Multiverse, extraRects: RectType[] = []): RectType | null {
    const rects: RectType[] = [...extraRects]

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue

      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue
        rects.push(this.getBoardRect(l, m))
      }
    }

    return Rect.bounds(rects)
  }

  getScreenWorldSize(scale = this.renderer.getCamera().scale): Vec2Type {
    const [, [w, h]] = this.getViewportScreenRect()
    return [w / scale, h / scale]
  }

  getFullScreenWorldSize(scale = this.renderer.getCamera().scale): Vec2Type {
    const { widthCss, heightCss } = this.renderer.getScreen()
    return [widthCss / scale, heightCss / scale]
  }

  getValidViewportRect(
    multiverse: Multiverse,
    extraRects: RectType[] = [],
    scale = this.renderer.getCamera().scale,
  ): RectType | null {
    const boardViewport = this.getBoardViewportRect(multiverse, extraRects)
    if (! boardViewport) return null

    const center = Rect.center(boardViewport)
    const screenWorldSize = this.getScreenWorldSize(scale)
    const padding = this.getValidViewportPadding(screenWorldSize)
    const size = Vec2.add(boardViewport[1], Vec2.scale(padding, 2))
    return [
      Vec2.sub(center, Vec2.scale(size, 0.5)),
      size,
    ]
  }

  getValidViewportPadding(screenWorldSize: Vec2Type): Vec2Type {
    return [
      Math.max(0, (screenWorldSize[0] - Sizes.BoardBorderSize[0]) / 2),
      Math.max(0, (screenWorldSize[1] - Sizes.BoardBorderSize[1]) / 2),
    ]
  }

  getTimeTileViewportRect(multiverse: Multiverse): RectType | null {
    const validViewport = this.getValidViewportRect(multiverse)
    if (! validViewport) return null

    const screenWorldSize = this.getFullScreenWorldSize()
    return [
      Vec2.sub(validViewport[0], screenWorldSize),
      Vec2.add(validViewport[1], Vec2.scale(screenWorldSize, 2)),
    ]
  }

  getRenderViewportRect(multiverse: Multiverse): RectType | null {
    return this.getTimeTileViewportRect(multiverse)
  }

  clampCameraCenterToViewport(center: Vec2Type, viewport: RectType, scale = this.renderer.getCamera().scale): Vec2Type {
    const screenWorldSize = this.getScreenWorldSize(scale)
    const viewportCenter = this.getViewportWorldCenter(center, scale)
    const [[x, y], [w, h]] = viewport
    const clampedViewportCenter = Rect.clampPoint(viewportCenter, [
      [
        x + screenWorldSize[0] / 2,
        y + screenWorldSize[1] / 2,
      ],
      [
        Math.max(0, w - screenWorldSize[0]),
        Math.max(0, h - screenWorldSize[1]),
      ],
    ])
    return this.getCameraCenterForViewportWorldCenter(clampedViewportCenter, scale)
  }

  private getViewportWorldOffset(scale: number): Vec2Type {
    const { widthCss, heightCss } = this.renderer.getScreen()
    return Vec2.scale(
      Vec2.sub(this.getViewportCenterScreen(), [widthCss / 2, heightCss / 2]),
      1 / scale,
    )
  }

  private getLineDisplayOffset(l: number): number {
    const offset = Multiverse.lineToIndexOffset(l)
    return ! this.hasNegativeZeroLine && offset < 0 ? offset + 1 : offset
  }

  private orientDisplayLine(displayLine: number): number {
    if (displayLine === 0) return 0
    return this.viewPlayer === Player.W ? displayLine : -displayLine
  }

  private getLineFromDisplayOffset(displayOffset: number): number {
    const offset = ! this.hasNegativeZeroLine && displayOffset < 0
      ? displayOffset - 1
      : displayOffset
    return Multiverse.indexOffsetToLine(offset)
  }
}
