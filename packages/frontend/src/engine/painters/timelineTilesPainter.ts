import { type Multiverse } from '@5dcol/core'
import { Color4, Mat3, Scalar, Vec2 } from '@engine/basic'
import { Colors, RenderLayer, Sizes } from '@engine/constant'
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
    const l0 = Math.floor(- (y + h) / Sizes.TurnHeight - 0.5)
    const l1 = Math.ceil(- y / Sizes.TurnHeight - 0.5)
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
      for (let l = l0; l < l1; l ++) {
        const [turnPos, turnSize] = this.layout.getTurnRect(l, t)

        this.renderer.submit({
          type: RenderItemType.Quad,
          layer: RenderLayer.BoardTime,
          mat: Mat3.transform(
            Vec2.sub(turnPos, [tileOverdraw / 2, tileOverdraw / 2]),
            Vec2.add(turnSize, [tileOverdraw, tileOverdraw]),
          ),
          color: (t + l) % 2 === 0
            ? Color4.mix(Colors.BoardTimeWhite, endedWhite, endedProgress)
            : Color4.mix(Colors.BoardTimeBlack, endedBlack, endedProgress),
        })
      }
    }
  }
}
