import { Line, Multiverse } from '@5dcol/core'
import { Color4, Mat3, Scalar, Vec2 } from '@engine/basic'
import { Colors, LabelVisibility, RenderLayer, Sizes } from '@engine/constant'
import { Easing } from '@engine/easing'
import { type GameLayout } from '@engine/layout'
import { type Renderer, RenderItemType } from '@engine/renderer'

interface TimelineTilesRenderOptions {
  ended?: boolean
  endedProgress?: number
  endedStatus?: 'checkmate' | 'stalemate'
}

export class TimelineTilesPainter {
  constructor(
    private readonly renderer: Renderer,
    private readonly layout: GameLayout,
  ) {}

  render(multiverse: Multiverse, options: TimelineTilesRenderOptions = {}): void {
    const tileViewport = this.layout.getTimeTileViewportRect(multiverse)
    if (! tileViewport) return

    const [[x, y], [w, h]] = tileViewport
    const t0 = Math.floor((x + Sizes.BoardMargin) / Sizes.TurnWidth)
    const t1 = Math.ceil((x + w + Sizes.BoardMargin) / Sizes.TurnWidth)
    const displayL0 = Math.floor((y - Sizes.TurnHeight / 2) / Sizes.TurnHeight)
    const displayL1 = Math.ceil((y + h + Sizes.TurnHeight / 2) / Sizes.TurnHeight)
    const tileOverdraw = Sizes.BoardTimeOverdrawDevicePixels
      / this.renderer.getScreen().dpr
      / this.renderer.getCamera().scale
    const endedProgress = Scalar.clamp(options.endedProgress ?? (options.ended ? 1 : 0), 0, 1)
    const endedWhite = options.endedStatus === 'stalemate'
      ? Colors.BoardTimeDrawWhite
      : Colors.BoardTimeEndedWhite
    const endedBlack = options.endedStatus === 'stalemate'
      ? Colors.BoardTimeDrawBlack
      : Colors.BoardTimeEndedBlack

    for (let t = t0; t < t1; t ++) {
      for (let displayL = displayL0; displayL < displayL1; displayL ++) {
        const l = this.layout.getLogicalLine(displayL)
        const [turnPos, turnSize] = this.layout.getTurnRect(l, t)

        this.renderer.submit({
          type: RenderItemType.Quad,
          layer: RenderLayer.BoardTime,
          mat: Mat3.transform(
            Vec2.sub(turnPos, [tileOverdraw / 2, tileOverdraw / 2]),
            Vec2.add(turnSize, [tileOverdraw, tileOverdraw]),
          ),
          color: this.getTileColor(t, l, endedProgress, endedWhite, endedBlack),
        })
      }
    }

    this.renderLabels(multiverse, {
      t0,
      t1,
      displayL0,
      displayL1,
      endedProgress,
      endedWhite,
      endedBlack,
    })
  }

  private renderLabels(
    multiverse: Multiverse,
    {
      t0,
      t1,
      displayL0,
      displayL1,
      endedProgress,
      endedWhite,
      endedBlack,
    }: {
      t0: number
      t1: number
      displayL0: number
      displayL1: number
      endedProgress: number
      endedWhite: Color4
      endedBlack: Color4
    },
  ) {
    const alpha = this.getLabelAlpha()
    if (alpha <= 0) return

    const grid = this.getBoardGridInfo(multiverse)
    if (! grid) return

    const bottomLabelDisplayLine = grid.displayLMax + 1
    const bottomLabelLine = this.layout.getLogicalLine(bottomLabelDisplayLine)
    if (bottomLabelDisplayLine >= displayL0 && bottomLabelDisplayLine < displayL1) {
      for (let t = Math.max(0, t0); t < t1; t ++) {
        if (! grid.occupiedTurns.has(t)) continue

        const [pos, size] = this.layout.getTurnRect(bottomLabelLine, t)
        this.renderer.submit({
          type: RenderItemType.Text,
          layer: RenderLayer.BoardTime,
          order: 1,
          pos: [
            pos[0] + size[0] / 2,
            pos[1] + size[1] - Sizes.TimelikeLabelInset,
          ],
          angle: 0,
          text: `T${t}`,
          fontSize: Sizes.TimelikeLabelFontSize,
          fontStyle: 'bold',
          color: Color4.withAlpha(
            this.getTileColor(t + 1, bottomLabelLine, endedProgress, endedWhite, endedBlack),
            alpha,
          ),
          align: 'center',
          baseline: 'bottom',
        })
      }
    }

    const rightLabelTurn = Math.floor((grid.mMax + 1) / 2)
    if (rightLabelTurn >= t0 && rightLabelTurn < t1) {
      for (let displayL = displayL0; displayL < displayL1; displayL ++) {
        if (! grid.occupiedDisplayLines.has(displayL)) continue

        const l = this.layout.getLogicalLine(displayL)
        const [pos, size] = this.layout.getTurnRect(l, rightLabelTurn)
        this.renderer.submit({
          type: RenderItemType.Text,
          layer: RenderLayer.BoardTime,
          order: 1,
          pos: [
            pos[0] + size[0] - Sizes.TimelikeLabelInset,
            pos[1] + size[1] / 2,
          ],
          angle: 0,
          text: this.formatLineLabel(l),
          fontSize: Sizes.TimelikeLabelFontSize,
          fontStyle: 'bold',
          color: Color4.withAlpha(
            this.getTileColor(rightLabelTurn + 1, l, endedProgress, endedWhite, endedBlack),
            alpha,
          ),
          align: 'right',
          baseline: 'middle',
        })
      }
    }
  }

  private getBoardGridInfo(multiverse: Multiverse): {
    displayLMax: number
    mMax: number
    occupiedDisplayLines: Set<number>
    occupiedTurns: Set<number>
  } | null {
    let displayLMax = -Infinity
    let mMax = -Infinity
    const occupiedDisplayLines = new Set<number>()
    const occupiedTurns = new Set<number>()

    for (const [l, line] of Multiverse.getLineEntries(multiverse)) {
      if (! line) continue
      for (const [m, board] of Line.getBoardEntries(line)) {
        if (! board) continue

        const displayL = this.layout.getDisplayLine(l)
        displayLMax = Math.max(displayLMax, displayL)
        mMax = Math.max(mMax, m)
        occupiedDisplayLines.add(displayL)
        occupiedTurns.add(Math.floor(m / 2))
      }
    }

    if (! Number.isFinite(displayLMax) || ! Number.isFinite(mMax)) return null
    return {
      displayLMax,
      mMax,
      occupiedDisplayLines,
      occupiedTurns,
    }
  }

  private getTileColor(
    t: number,
    l: number,
    endedProgress: number,
    endedWhite: Color4,
    endedBlack: Color4,
  ): Color4 {
    return (t + l) % 2 === 0
      ? Color4.mix(Colors.BoardTimeWhite, endedWhite, endedProgress)
      : Color4.mix(Colors.BoardTimeBlack, endedBlack, endedProgress)
  }

  private getLabelAlpha(): number {
    const scale = this.renderer.getCamera().scale
    const progress = Scalar.clamp(
      (scale - LabelVisibility.TimelikeScaleStart)
      / (LabelVisibility.TimelikeScaleEnd - LabelVisibility.TimelikeScaleStart),
      0,
      1,
    )
    return Easing.easeInOut(progress)
  }

  private formatLineLabel(l: number): string {
    return `${l > 0 ? '+' : ''}${l}L`
  }
}
