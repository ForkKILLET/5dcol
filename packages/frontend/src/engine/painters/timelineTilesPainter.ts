import { type Multiverse } from '@5dcol/core'
import { Mat3, Vec2 } from '@engine/basic'
import { Colors, RenderLayer, Sizes } from '@engine/constant'
import { type GameLayout } from '@engine/layout'
import { type Renderer, RenderItemType } from '@engine/renderer'

export class TimelineTilesPainter {
  constructor(
    private readonly renderer: Renderer,
    private readonly layout: GameLayout,
  ) {}

  render(multiverse: Multiverse): void {
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
          color: (t + l) % 2 === 0 ? Colors.BoardTimeWhite : Colors.BoardTimeBlack,
        })
      }
    }
  }
}
