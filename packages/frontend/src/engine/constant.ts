import { Color4, Vec2 } from '@engine/basic'

export const enum RenderLayer {
  BoardTime,
  BoardShadowBase,
  LineShadow,
  Line,
  PresentShadow,
  Present,
  BoardShadowHigh,
  BoardBorder,
  Board,
  Piece,
  PieceGhost,
  AnimatedBoardBorder,
  AnimatedBoard,
  AnimatedPiece,
  Debug,
  UIShadow,
  UI,
}

export namespace Sizes {
  export const PieceWidth = 16
  export const PieceSize: Vec2 = [PieceWidth, PieceWidth]

  export const BoardWidth = PieceWidth * 8
  export const BoardSize: Vec2 = [BoardWidth, BoardWidth]

  export const BoardMargin = PieceWidth
  export const BoardMarginWidth = BoardWidth + BoardMargin * 2

  export const BoardGap = BoardMargin * 2

  export const BoardBorder = 2
  export const BoardBorderWidth = BoardWidth + BoardBorder * 2
  export const BoardBorderSize: Vec2 = [BoardBorderWidth, BoardBorderWidth]
  export const ActiveBoardBorder = 7
  export const BoardBorderRadius = 2
  export const ActiveBoardBorderRadius = 8

  export const TurnHeight = BoardMarginWidth
  export const TurnWidth = BoardMarginWidth * 2
  export const TurnSize: Vec2 = [TurnWidth, TurnHeight]
  export const BoardTimeOverdrawDevicePixels = 1

  export const LineArrowRadius = 20
  export const LineArrowShaftLength = 20
  export const LineArrowTip = 23
  export const LineBorderWidth = 1

  export const LineShadowOffset: Vec2 = [-6, 5]
  export const BoardShadowOffset: Vec2 = [-13, 13]
  export const ShadowShrink = 5

  export const PointerDebugWidth = 10

  export const ButtonWidth = 230
  export const ButtonHeight = 52
  export const ButtonTop = 18
  export const ButtonShadowOffset = 5
  export const ButtonBorder = 3
  export const ButtonFontSize = 26
  export const ButtonIconSize = 28
  export const ButtonContentGap = 8

  export const PresentWidth = 104
  export const PresentBorder = 3
  export const PresentViewportMarginRatio = 0.25
  export const PresentLabelXRatio = 0.45
  export const PresentLabelOffsetTurns = 2.1
  export const PresentLabelFontSize = 64
  export const PresentIconOffsetTurns = 0.65
  export const PresentIconActiveRadius = 28
  export const PresentIconInactiveRadius = 18
  export const PresentArrowHalfShaftRatio = 0.3
  export const PresentArrowTipBaseRatio = 0.08
  export const PresentArrowTipRatio = 0.6
  export const PresentArrowStrokeWidth = 2.5
  export const PresentArrowTailInset = 2
  export const PresentArrowTailFillInset = 0.5
}

export namespace CameraControl {
  export const WheelZoomStep = 0.1
  export const KeyboardZoomStep = 0.18
  export const ZoomMin = 0.5
  export const ZoomMax = 4
  export const ZoomSmoothing = 0.12
  export const ZoomSnapEpsilon = 0.001
  export const BounceBackSmoothing = 0.08
  export const BounceBackSnapEpsilon = 0.1
  export const KeyboardPanStep = 120
}

export namespace Colors {
  export const Transparent = Color4.fromRgba(0, 0, 0, 0)

  export const Shadow = Color4.fromRgba(56, 56, 56, 1)

  export const BoardBlack = Color4.fromRgba(211, 169, 115, 1)
  export const BoardWhite = Color4.fromRgba(250, 212, 164, 1)

  export const BoardHighlightBlack = Color4.fromRgba(133, 156, 96, 1)
  export const BoardHighlightWhite = Color4.fromRgba(149, 170, 106, 1)

  export const BoardTimeBlack = Color4.fromRgba(191, 191, 187, 1)
  export const BoardTimeWhite = Color4.fromRgba(200, 200, 195, 1)

  export const BoardBorderWhite = Color4.fromRgba(249, 250, 246, 1)
  export const BoardBorderBlack = Color4.fromRgba(39, 39, 39, 1)

  export const BoardBorderWhiteDim = Color4.fromRgba(225, 226, 216, 1)
  export const BoardBorderBlackDim = Color4.fromRgba(64, 64, 74, 1)

  export const Purple = Color4.fromRgba(153, 113, 169, 1)
  export const PurpleDark = Color4.fromRgba(132, 93, 156, 1)

  export const ButtonText = Color4.fromRgba(39, 39, 39, 1)
  export const ButtonDisabledText = Color4.fromRgba(188, 188, 188, 1)
}

export namespace Animations {
  export const MoveAnimationDuration = 500
}

export interface ButtonColorPreset {
  border: Color4
  fill: Color4
}

export namespace ButtonColors {
  export const Board: ButtonColorPreset = {
    border: Color4.fromRgba(204, 161, 105, 1),
    fill: Color4.fromRgba(231, 191, 142, 1),
  }

  export const Yellow: ButtonColorPreset = {
    border: Color4.fromRgba(200, 182, 61, 1),
    fill: Color4.fromRgba(220, 206, 96, 1),
  }

  export const Green: ButtonColorPreset = {
    border: Color4.fromRgba(152, 180, 149, 1),
    fill: Color4.fromRgba(143, 173, 140, 1),
  }

  export const GreenBlack: ButtonColorPreset = {
    border: Color4.fromRgba(89, 134, 89, 1),
    fill: Color4.fromRgba(92, 135, 95, 1),
  }

  export const White: ButtonColorPreset = {
    border: Color4.fromRgba(249, 250, 246, 1),
    fill: Color4.fromRgba(241, 241, 236, 1),
  }

  export const DisabledWhite: ButtonColorPreset = {
    border: Color4.fromRgba(249, 250, 246, 1),
    fill: Color4.fromRgba(241, 241, 236, 1),
  }

  export const DisabledBlack: ButtonColorPreset = {
    border: Color4.fromRgba(166, 166, 166, 1),
    fill: Color4.fromRgba(169, 169, 172, 1),
  }
}
