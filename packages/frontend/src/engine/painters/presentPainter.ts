import { Player, Players as CorePlayers, Multiverse } from '@5dcol/core'
import { Color4, Mat3, Scalar, Vec2 } from '@engine/basic'
import { Colors, RenderLayer, Sizes } from '@engine/constant'
import { type VerticalBounds, type GameLayout } from '@engine/layout'
import { getPresentColors, mixPresentColors, type PresentColors } from '@engine/present'
import { CircleRenderItem, type Renderer, RenderItemType } from '@engine/renderer'
import { type PendingMove } from '@engine/gameState'

const PRESENT_LABEL = 'The Present'
const PRESENT_LABEL_FONT = 'Georgia, Times New Roman, serif'

interface PresentRenderContext {
  multiverse: Multiverse
  multiverseCommitted: Multiverse
  player: Player
}

interface PresentAnimationRenderContext extends PresentRenderContext {
  pendingMove: PendingMove | null
  progress: number
}

export class PresentPainter {
  constructor(
    private readonly renderer: Renderer,
    private readonly layout: GameLayout,
  ) {}

  render(context: PresentRenderContext, displayPlayer = this.getDisplayPlayer(context)): void {
    this.renderPresent(context.multiverse, context.player, displayPlayer)
  }

  renderAnimated(context: PresentAnimationRenderContext): void {
    const multiverseBefore = context.pendingMove?.multiverseBefore ?? context.multiverseCommitted
    const presentCommitted = Multiverse.getPresent(multiverseBefore, context.player)
    const presentPreview = Multiverse.getPresent(context.multiverse, context.player)
    if (! presentCommitted || ! presentPreview) return

    const beforeContext = { ...context, multiverse: multiverseBefore }
    const displayPlayerBefore = this.getDisplayPlayer(beforeContext)
    const displayPlayerPreview = this.getDisplayPlayer(context)
    const bounds = this.getAnimatedBoardVerticalBounds(
      multiverseBefore,
      context.multiverse,
      context.progress,
    )

    if (presentCommitted.m === presentPreview.m && displayPlayerBefore === displayPlayerPreview) {
      this.renderPresent(context.multiverse, context.player, displayPlayerPreview, bounds)
      return
    }

    const [[x0]] = this.layout.getPresentViewportRect(presentCommitted.m)
    const [[x1]] = this.layout.getPresentViewportRect(presentPreview.m)
    const colors = mixPresentColors(
      getPresentColors(displayPlayerBefore),
      getPresentColors(displayPlayerPreview),
      context.progress,
    )
    this.renderPresentAt(
      presentPreview.m,
      colors,
      context.multiverse,
      x0 + (x1 - x0) * context.progress,
      bounds,
    )
  }

  getDisplayPlayer(context: PresentRenderContext): Player {
    const committedPresent = Multiverse.getPresent(context.multiverseCommitted, context.player)
    const present = Multiverse.getPresent(context.multiverse, context.player)
    if (! committedPresent || ! present) return context.player
    return present.m > committedPresent.m ? CorePlayers.opponent(context.player) : context.player
  }

  private renderPresent(
    multiverse: Multiverse,
    player: Player,
    displayPlayer: Player,
    boundsOverride?: VerticalBounds | null,
  ) {
    const present = Multiverse.getPresent(multiverse, player)
    if (! present) return

    this.renderPresentAt(
      present.m,
      getPresentColors(displayPlayer),
      multiverse,
      undefined,
      boundsOverride,
    )
  }

  private renderPresentAt(
    m: number,
    colors: PresentColors,
    multiverse: Multiverse,
    xOverride?: number,
    boundsOverride?: VerticalBounds | null,
  ) {
    const [[xRect, y], [w, h]] = this.layout.getPresentViewportRect(m)
    const x = xOverride ?? xRect
    const boardBounds = boundsOverride ?? this.layout.getBoardVerticalBounds(multiverse)

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
      this.renderPresentIcons(x, w, boardBounds, multiverse)
    }
  }

  private getAnimatedBoardVerticalBounds(
    fromMultiverse: Multiverse,
    toMultiverse: Multiverse,
    progress: number,
  ): VerticalBounds | null {
    const from = this.layout.getBoardVerticalBounds(fromMultiverse)
    const to = this.layout.getBoardVerticalBounds(toMultiverse)
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

  private renderPresentIcons(
    x: number,
    w: number,
    bounds: VerticalBounds,
    multiverse: Multiverse,
  ) {
    const cx = x + w / 2

    const iconCenter: Vec2 = [cx, bounds.top - Sizes.TurnHeight * Sizes.PresentIconOffsetTurns]
    this.renderPresentIcon(
      iconCenter,
      -1,
      Multiverse.canCreateActiveTimeline(multiverse, Player.B),
      Colors.BoardBorderBlack,
      Colors.BoardBorderBlackDim,
    )

    const lowerIconCenter: Vec2 = [cx, bounds.bottom + Sizes.TurnHeight * Sizes.PresentIconOffsetTurns]
    this.renderPresentIcon(
      lowerIconCenter,
      1,
      Multiverse.canCreateActiveTimeline(multiverse, Player.W),
      Colors.BoardBorderWhite,
      Colors.BoardBorderWhiteDim,
    )
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
}
