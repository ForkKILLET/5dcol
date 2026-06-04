import { Line, Multiverse, type CoordSpacelike } from '@5dcol/core'
import { Rect, Vec2, type Rect as RectType, type Vec2 as Vec2Type } from '@engine/basic'
import { Sizes } from '@engine/constant'
import { type Renderer } from '@engine/renderer'

export interface VerticalBounds {
  top: number
  bottom: number
}

export class GameLayout {
  constructor(private readonly renderer: Renderer) {}

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
    return l * Sizes.TurnHeight
  }

  getLineY(l: number): number {
    return l * (Sizes.BoardWidth + Sizes.BoardGap)
  }

  getSquareCenter(l: number, m: number, coord: CoordSpacelike): Vec2Type {
    const [borderPos] = this.getBoardRect(l, m)
    return Vec2.add(borderPos, [
      Sizes.BoardBorder + (coord.x + 0.5) * Sizes.PieceWidth,
      Sizes.BoardBorder + (coord.y + 0.5) * Sizes.PieceWidth,
    ])
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

  getScreenWorldSize(): Vec2Type {
    const { widthCss, heightCss } = this.renderer.getScreen()
    const topLeft = this.renderer.screenToWorld([0, 0])
    const bottomRight = this.renderer.screenToWorld([widthCss, heightCss])
    return [
      Math.abs(bottomRight[0] - topLeft[0]),
      Math.abs(bottomRight[1] - topLeft[1]),
    ]
  }

  getValidViewportRect(multiverse: Multiverse, extraRects: RectType[] = []): RectType | null {
    const boardViewport = this.getBoardViewportRect(multiverse, extraRects)
    if (! boardViewport) return null

    const center = Rect.center(boardViewport)
    const screenWorldSize = this.getScreenWorldSize()
    const padding = this.getValidViewportPadding(screenWorldSize)
    const size: Vec2Type = [
      Math.max(boardViewport[1][0] + padding[0] * 2, screenWorldSize[0]),
      Math.max(boardViewport[1][1] + padding[1] * 2, screenWorldSize[1]),
    ]
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

    const screenWorldSize = this.getScreenWorldSize()
    return [
      Vec2.sub(validViewport[0], screenWorldSize),
      Vec2.add(validViewport[1], Vec2.scale(screenWorldSize, 2)),
    ]
  }

  getRenderViewportRect(multiverse: Multiverse): RectType | null {
    return this.getTimeTileViewportRect(multiverse)
  }

  clampCameraCenterToViewport(center: Vec2Type, viewport: RectType): Vec2Type {
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
}
