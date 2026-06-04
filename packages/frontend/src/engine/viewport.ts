import { Rect, type Vec2 } from '@engine/basic'
import { CameraControl } from '@engine/constant'

export const getScaleToContainRects = (
  rects: Rect[],
  screenSize: Vec2,
  currentScale: number,
  padding = 0,
): number => {
  const bounds = Rect.bounds(rects)
  if (! bounds) return currentScale

  const [, [w, h]] = bounds
  const paddedWidth = w + padding * 2
  const paddedHeight = h + padding * 2
  const xScale = paddedWidth > 0 ? screenSize[0] / paddedWidth : CameraControl.ZoomMax
  const yScale = paddedHeight > 0 ? screenSize[1] / paddedHeight : CameraControl.ZoomMax
  return Math.min(xScale, yScale, CameraControl.ZoomMax)
}

export const getMoveTravelTargetScale = (
  baseScale: number,
  rects: Rect[],
  screenSize: Vec2,
  padding = 0,
): number => (
  Math.min(baseScale, getScaleToContainRects(rects, screenSize, baseScale, padding))
)
