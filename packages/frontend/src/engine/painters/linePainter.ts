import { Coord, Line, Multiverse } from '@5dcol/core'
import { Color4, CubicBezier, Scalar, Vec2, type Vec2 as Vec2Type } from '@engine/basic'
import { Colors, RenderLayer, Sizes } from '@engine/constant'
import { type GameLayout } from '@engine/layout'
import { getLineColors, getLineRenderOrder, type LineColors } from '@engine/line'
import { type Renderer, RenderItemType } from '@engine/renderer'

interface LineBranchGeometry {
  source: Vec2Type
  bend1Control1: Vec2Type
  bend1Control2: Vec2Type
  bend1End: Vec2Type
  lineEnd: Vec2Type
  bend2Control1: Vec2Type
  bend2Control2: Vec2Type
  target: Vec2Type
}

interface LineBranchBaseGeometry {
  baseBranchX: number
  sourceY: number
  targetY: number
  order: number
}

export class LinePainter {
  constructor(
    private readonly renderer: Renderer,
    private readonly layout: GameLayout,
  ) {}

  render(line: Line, l: number, alpha: number, multiverse: Multiverse): void {
    const branch = this.getLineBranchGeometry(multiverse, line, l)
    const order = getLineRenderOrder(line)
    const colors = getLineColors(multiverse, l)
    if (branch) {
      this.renderLineBranchArrow(line, l, branch, alpha, order, colors)
      return
    }

    this.renderLineStart(line, l, alpha, branch, order, colors)
    const points = this.getLinePoints(line, l)
    this.renderLinePolygon(points, alpha, order, colors)
  }

  renderDuringMoveAnimation(
    line: Line,
    l: number,
    progress: number,
    multiverse: Multiverse,
  ): void {
    const branch = this.getLineBranchGeometry(multiverse, line, l)
    const order = getLineRenderOrder(line)
    const colors = getLineColors(multiverse, l)
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

  private renderLineStart(
    line: Line,
    l: number,
    alpha: number,
    branch: LineBranchGeometry | null,
    order: number,
    colors: LineColors,
  ) {
    if (branch) {
      this.renderLineBranch(branch, alpha, order, colors)
      return
    }

    this.renderLineInitialStartSegment(line, l, alpha, order, colors)
  }

  private renderLineInitialStartSegment(line: Line, l: number, alpha: number, order: number, colors: LineColors) {
    if (alpha <= 0) return

    const y = this.layout.getLineY(l)
    const xEnd = line.mStart * (Sizes.BoardWidth + Sizes.BoardGap)
    const xStart = xEnd - Sizes.LineStartSegmentLength
    const points: Vec2Type[] = [
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
      from: [xStart, y] satisfies Vec2Type,
      to: [xEnd, y] satisfies Vec2Type,
      stops: [
        { offset: 0, color: Color4.withAlpha(colors.fill, 0) },
        { offset: 1, color: Color4.withAlpha(colors.fill, alpha) },
      ],
    }
    const stroke = {
      type: 'linear-gradient' as const,
      from: [xStart, y] satisfies Vec2Type,
      to: [xEnd, y] satisfies Vec2Type,
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

  private renderLinePolygon(points: Vec2Type[], alpha: number, order: number, colors: LineColors) {
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

  private renderLineBranchArrow(
    line: Line,
    l: number,
    branch: LineBranchGeometry,
    alpha: number,
    order: number,
    colors: LineColors,
  ) {
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

  private getLineBranchArrowPoints(line: Line, l: number, branch: LineBranchGeometry): Vec2Type[] {
    const step = Sizes.BoardWidth + Sizes.BoardGap
    const y = this.layout.getLineY(l)
    const yUpTip = y - Sizes.LineArrowRadius - Sizes.LineArrowTip
    const yDownTip = y + Sizes.LineArrowRadius + Sizes.LineArrowTip
    const xTip = line.boards.length * step + Sizes.LineArrowShaftLength
    const xEnd = xTip + Sizes.LineArrowRadius + Sizes.LineArrowTip
    const centerline = this.getLineBranchArrowCenterline(branch, [xTip, y])
    if (centerline.length < 2) return []

    const upper: Vec2Type[] = []
    const lower: Vec2Type[] = []

    for (let i = 0; i < centerline.length; i ++) {
      const point = centerline[i]
      const previous = centerline[Math.max(0, i - 1)]
      const next = centerline[Math.min(centerline.length - 1, i + 1)]
      const tangent = Vec2.sub(next, previous)
      const length = Vec2.length(tangent)
      if (length === 0) continue

      const unit = Vec2.scale(tangent, 1 / length)
      const normal: Vec2Type = [-unit[1], unit[0]]
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

  private getLineBranchArrowCenterline(branch: LineBranchGeometry, end: Vec2Type): Vec2Type[] {
    const points: Vec2Type[] = []
    const pushPoint = (point: Vec2Type) => {
      const previous = points.at(-1)
      if (previous && Vec2.length(Vec2.sub(point, previous)) < 0.001) return
      points.push(point)
    }
    const pushCubic = (from: Vec2Type, control1: Vec2Type, control2: Vec2Type, to: Vec2Type) => {
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
      offset: Vec2Type
      stroke: Color4
      strokeWidth: number
    },
  ) {
    const color = Color4.withAlpha(stroke, alpha)
    const points = this.getLineBranchStrokePoints(geometry, offset, strokeWidth)
    if (points.length === 0) return

    this.renderer.submit({
      type: RenderItemType.Polygon,
      layer,
      order,
      points,
      fill: color,
      stroke: null,
    })
  }

  private getLineBranchStrokePoints(
    geometry: LineBranchGeometry,
    offset: Vec2Type,
    strokeWidth: number,
  ): Vec2Type[] {
    const centerline = this.getLineBranchCenterline(geometry)
    if (centerline.length < 2) return []

    const halfWidth = strokeWidth / 2
    const upper: Vec2Type[] = []
    const lower: Vec2Type[] = []

    for (let i = 0; i < centerline.length; i ++) {
      const point = Vec2.add(centerline[i], offset)
      const previous = centerline[Math.max(0, i - 1)]
      const next = centerline[Math.min(centerline.length - 1, i + 1)]
      const tangent = Vec2.sub(next, previous)
      const length = Vec2.length(tangent)
      if (length === 0) continue

      const unit = Vec2.scale(tangent, 1 / length)
      const normal: Vec2Type = [-unit[1], unit[0]]
      upper.push(Vec2.add(point, Vec2.scale(normal, halfWidth)))
      lower.push(Vec2.sub(point, Vec2.scale(normal, halfWidth)))
    }

    return [
      ...upper,
      ...lower.reverse(),
    ]
  }

  private getLineBranchCenterline(geometry: LineBranchGeometry): Vec2Type[] {
    const points: Vec2Type[] = []
    const pushPoint = (point: Vec2Type) => {
      const previous = points.at(-1)
      if (previous && Vec2.length(Vec2.sub(point, previous)) < 0.001) return
      points.push(point)
    }
    const pushCubic = (from: Vec2Type, control1: Vec2Type, control2: Vec2Type, to: Vec2Type) => {
      for (let i = 0; i <= Sizes.LineBranchCurveSamples; i ++) {
        pushPoint(CubicBezier.point(from, control1, control2, to, i / Sizes.LineBranchCurveSamples))
      }
    }

    pushCubic(geometry.source, geometry.bend1Control1, geometry.bend1Control2, geometry.bend1End)
    pushPoint(geometry.lineEnd)
    pushCubic(geometry.lineEnd, geometry.bend2Control1, geometry.bend2Control2, geometry.target)
    return points
  }

  private getLineBranchGeometry(multiverse: Multiverse, line: Line, l: number): LineBranchGeometry | null {
    const base = this.getLineBranchBaseGeometry(line, l)
    if (! base) return null

    const offsetIndex = this.getLineBranchOverlapCount(multiverse, base)
    const branchX = base.baseBranchX - offsetIndex * Sizes.LineBranchOverlapOffset
    const { sourceY, targetY } = base
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
    const source: Vec2Type = [sourceX, sourceY]
    const bend1End: Vec2Type = [branchX, sourceY + direction * radius]
    const lineEnd: Vec2Type = [branchX, targetY - direction * radius]
    const target: Vec2Type = [targetX, targetY]

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

  private getLineBranchBaseGeometry(line: Line, l: number): LineBranchBaseGeometry | null {
    const board = line.boards[line.mStart]
    if (! board?.createdBy || board.createdByPlayer === null) return null
    if (board.createdByRole !== 'target') return null
    if (Coord.isSameBoard(board.createdBy.from, board.createdBy.to)) return null
    if (board.createdBy.to.l === l) return null

    const step = Sizes.BoardWidth + Sizes.BoardGap
    const baseBranchX = Coord.boardIndex(board.createdBy.to, board.createdByPlayer) * step
      + Sizes.BoardWidth
      + Sizes.BoardGap / 2
    const sourceY = this.layout.getLineY(board.createdBy.to.l)
    const targetY = this.layout.getLineY(l)
    const dy = targetY - sourceY
    if (dy === 0) return null

    return {
      baseBranchX,
      sourceY,
      targetY,
      order: board.createdByOrder ?? 0,
    }
  }

  private getLineBranchOverlapCount(multiverse: Multiverse, branch: LineBranchBaseGeometry): number {
    let count = 0
    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      const existing = this.getLineBranchBaseGeometry(line, l)
      if (! existing) continue
      if (existing.order >= branch.order) continue
      if (existing.baseBranchX !== branch.baseBranchX) continue
      if (! this.doLineBranchRangesOverlap(existing, branch)) continue
      count += 1
    }
    return count
  }

  private doLineBranchRangesOverlap(a: LineBranchBaseGeometry, b: LineBranchBaseGeometry): boolean {
    const aMin = Math.min(a.sourceY, a.targetY)
    const aMax = Math.max(a.sourceY, a.targetY)
    const bMin = Math.min(b.sourceY, b.targetY)
    const bMax = Math.max(b.sourceY, b.targetY)
    return aMin < bMax && bMin < aMax
  }

  private renderLineStableSegment(
    line: Line,
    l: number,
    latestM: number,
    xStartOverride: number | undefined,
    order: number,
    colors: LineColors,
  ) {
    const y = this.layout.getLineY(l)
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
    const y = this.layout.getLineY(l)
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

  private getLineLatestSegmentGeometry(m: number, l: number): { points: Vec2Type[], xStart: number } {
    const points = this.getLineLatestSegmentPoints(m, l)
    return {
      points,
      xStart: points[0][0],
    }
  }

  private getMovingLineLatestSegmentPoints(m: number, l: number, progress: number): Vec2Type[] {
    const from = this.getLineLatestSegmentPoints(m, l)
    const to = this.getLineLatestSegmentPoints(m + 1, l)
    return from.map((point, index) => Vec2.mix(point, to[index], progress))
  }

  private getLineLatestSegmentPoints(m: number, l: number, xStartOverride?: number): Vec2Type[] {
    const y = this.layout.getLineY(l)
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

  private getLinePoints(line: Line, l: number, xStartOverride?: number): Vec2Type[] {
    const y = this.layout.getLineY(l)
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
}
