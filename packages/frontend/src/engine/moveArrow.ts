import { Color4, CubicBezier, Vec2, type Vec2 as Vec2Type } from '@engine/basic'
import { Sizes } from '@engine/constant'
import { type LinearGradientFill } from '@engine/renderer'

export const getMoveArrowPolygon = (
  from: Vec2Type,
  control1: Vec2Type,
  control2: Vec2Type,
  tip: Vec2Type,
): Vec2Type[] => {
  const tangentAtTip = CubicBezier.tangent(from, control1, control2, tip, 1)
  const tangentLength = Vec2.length(tangentAtTip)
  if (tangentLength === 0) return []

  const unit = Vec2.scale(tangentAtTip, 1 / tangentLength)
  const normal: Vec2Type = [-unit[1], unit[0]]
  const headBaseCenter = Vec2.sub(tip, Vec2.scale(unit, Sizes.MoveArrowHeadLength))
  const left: Vec2Type[] = []
  const right: Vec2Type[] = []
  const halfShaft = Sizes.MoveArrowShaftWidth / 2

  for (let i = 0; i <= Sizes.MoveArrowCurveSamples; i ++) {
    const t = i / Sizes.MoveArrowCurveSamples
    const center = CubicBezier.point(from, control1, control2, headBaseCenter, t)
    const tangent = CubicBezier.tangent(from, control1, control2, headBaseCenter, t)
    const length = Vec2.length(tangent)
    if (length === 0) continue

    const tangentUnit = Vec2.scale(tangent, 1 / length)
    const n: Vec2Type = [-tangentUnit[1], tangentUnit[0]]
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

export const getStraightMoveArrowPolygon = (
  from: Vec2Type,
  tip: Vec2Type,
): Vec2Type[] => {
  const direction = Vec2.sub(tip, from)
  const length = Vec2.length(direction)
  if (length === 0) return []

  const unit = Vec2.scale(direction, 1 / length)
  const normal: Vec2Type = [-unit[1], unit[0]]
  const headBaseCenter = Vec2.sub(tip, Vec2.scale(unit, Sizes.MoveArrowHeadLength))
  const halfShaft = Sizes.MoveArrowShaftWidth / 2

  return [
    Vec2.add(from, Vec2.scale(normal, halfShaft)),
    Vec2.add(headBaseCenter, Vec2.scale(normal, halfShaft)),
    Vec2.add(headBaseCenter, Vec2.scale(normal, Sizes.MoveArrowHeadWidth)),
    tip,
    Vec2.sub(headBaseCenter, Vec2.scale(normal, Sizes.MoveArrowHeadWidth)),
    Vec2.sub(headBaseCenter, Vec2.scale(normal, halfShaft)),
    Vec2.sub(from, Vec2.scale(normal, halfShaft)),
  ]
}

export const getMoveArrowMaskFill = (
  color: Color4,
  from: Vec2Type,
  control1: Vec2Type,
): LinearGradientFill => {
  const tangent = Vec2.sub(control1, from)
  const length = Vec2.length(tangent)
  const unit: Vec2Type = length === 0 ? [1, 0] : Vec2.scale(tangent, 1 / length)
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
