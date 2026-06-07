import { Player, type Piece } from '@5dcol/core'
import { getAssetUrl } from '@engine/assets'
import { Color4 } from '@engine/basic'
import { ButtonColors, type ButtonColorPreset } from '@engine/constant'
import { PIECE_TO_TEXTURE_ID, TEXTURE_ID_TO_NAME } from '@engine/texture'
import { type TranslationKey, type TranslationParams } from '@/i18n'

export interface ButtonConfig {
  id: string
  disabled: boolean
  colorPreset: ButtonColorPreset
  turnPlayer: Player
  labelKey: TranslationKey
  labelParams?: TranslationParams
  piece: Piece | null
  effect?: 'pulse'
  onClick: () => void
}

export interface GameToolbarButtonColors {
  border: string
  fill: string
  text: string
}

export interface GameToolbarButton {
  id: string
  disabled: boolean
  labelKey: TranslationKey
  labelParams: TranslationParams
  pieceImageUrl: string | null
  effect?: 'pulse'
  colors: GameToolbarButtonColors
  hoverColors: GameToolbarButtonColors
  pulseColors: GameToolbarButtonColors
}

export const isPrimaryGameToolbarButton = (id: string): boolean => (
  id === 'undo-move' || id === 'deselect-piece' || id === 'submit-moves'
)

export const getUndoMoveButtonColor = (is5D: boolean): ButtonColorPreset => (
  is5D ? ButtonColors.FiveD : ButtonColors.Yellow
)

export const getPlayerButtonColor = (player: Player): ButtonColorPreset => (
  player === Player.W ? ButtonColors.White : ButtonColors.Black
)

export const toToolbarButtonView = (button: ButtonConfig): GameToolbarButton => {
  const colors = button.disabled
    ? (button.turnPlayer === Player.W ? ButtonColors.DisabledWhite : ButtonColors.DisabledBlack)
    : button.colorPreset
  const hoverColors = getGreenButtonColors(button.turnPlayer)
  return {
    id: button.id,
    disabled: button.disabled,
    labelKey: button.labelKey,
    labelParams: button.labelParams ?? {},
    pieceImageUrl: button.piece === null ? null : getPieceImageUrl(button.piece),
    effect: button.disabled ? undefined : button.effect,
    colors: toToolbarButtonColors(colors),
    hoverColors: toToolbarButtonColors(hoverColors),
    pulseColors: toToolbarButtonColors(hoverColors),
  }
}

export const getGreenButtonColors = (player: Player): ButtonColorPreset => (
  player === Player.W ? ButtonColors.GreenWhite : ButtonColors.GreenBlack
)

export const toToolbarButtonColors = (
  colors: ButtonColorPreset,
): GameToolbarButtonColors => ({
  border: Color4.toRgbaString(colors.border),
  fill: Color4.toRgbaString(colors.fill),
  text: Color4.toRgbaString(colors.text),
})

const getPieceImageUrl = (piece: Piece): string => {
  const textureId = PIECE_TO_TEXTURE_ID.get(piece)
  if (textureId === undefined) return ''
  return getAssetUrl(`assets/canvas/textures/${TEXTURE_ID_TO_NAME.get(textureId)!}`)
}
