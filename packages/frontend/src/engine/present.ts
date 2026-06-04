import { Player } from '@5dcol/core'
import { Color4 } from '@engine/basic'
import { Colors } from '@engine/constant'

export interface PresentColors {
  border: Color4
  fill: Color4
  label: Color4
}

export const getPresentColors = (player: Player): PresentColors => ({
  border: player === Player.W ? Colors.BoardBorderWhite : Colors.BoardBorderBlack,
  fill: player === Player.W ? Colors.BoardBorderWhiteDim : Colors.BoardBorderBlackDim,
  label: player === Player.W ? Colors.BoardBorderBlack : Colors.BoardBorderWhite,
})

export const mixPresentColors = (
  a: PresentColors,
  b: PresentColors,
  progress: number,
): PresentColors => ({
  border: Color4.mix(a.border, b.border, progress),
  fill: Color4.mix(a.fill, b.fill, progress),
  label: Color4.mix(a.label, b.label, progress),
})
