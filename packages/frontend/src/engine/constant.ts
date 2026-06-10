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
  MoveHighlight,
  PieceGhost,
  AnimatedBoardBorder,
  AnimatedBoard,
  AnimatedPiece,
  CheckArrow,
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
  export const CheckBadgeRadius = 8
  export const CheckBadgeOffset = 8
  export const CheckBadgeFontSize = 14
  export const MoveArrowStrokeWidth = 1
  export const MoveArrowShaftWidth = 5
  export const MoveArrowHeadLength = 8
  export const MoveArrowHeadWidth = 6
  export const MoveArrowCurveOffset = 30
  export const MoveArrowCurveSamples = 32
  export const MoveArrowFadeLength = 4

  export const TurnHeight = BoardMarginWidth
  export const TurnWidth = BoardMarginWidth * 2
  export const TurnSize: Vec2 = [TurnWidth, TurnHeight]
  export const BoardTimeOverdrawDevicePixels = 1
  export const TimelikeLabelFontSize = 36
  export const TimelikeLabelInset = 9
  export const SpacelikeLabelFontSize = 4
  export const SpacelikeLabelInset = 0.5

  export const LineArrowRadius = 20
  export const LineArrowShaftLength = 20
  export const LineArrowTip = 23
  export const LineBorderWidth = 1
  export const LineStartSegmentLength = BoardWidth + BoardGap
  export const LineBranchRadius = (BoardWidth + BoardGap) / 2
  export const LineBranchWidth = LineArrowRadius * 2
  export const LineBranchCurveSamples = 32
  export const LineBranchOverlapOffset = (LineBranchWidth + LineBorderWidth * 2) / 3

  export const LineShadowOffset: Vec2 = [-6, 5]
  export const BoardShadowOffset: Vec2 = [-13, 13]
  export const ShadowShrink = 5

  export const PointerDebugWidth = 10

  export const ButtonWidth = 230
  export const SecondaryButtonWidth = 230
  export const ButtonHeight = 56
  export const ButtonTop = 18
  export const ButtonShadowOffset = 5
  export const SmallButtonShadowOffset = 3
  export const ButtonBorder = 3
  export const ButtonFontSize = 32
  export const ButtonIconSize = 28
  export const ButtonContentGap = 8
  export const RecordPanelWidth = 300

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

export namespace LabelVisibility {
  export const TimelikeScaleStart = 0.45
  export const TimelikeScaleEnd = 0.65
  export const SpacelikeScaleStart = 1.8
  export const SpacelikeScaleEnd = 2
}

export namespace CameraControl {
  export const WheelZoomStep = 0.1
  export const KeyboardZoomStep = 0.18
  export const ZoomMin = 0.3
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
  export const MoveHighlight2DBlack = Color4.fromRgba(220, 206, 96, 1)
  export const MoveHighlight2DWhite = Color4.fromRgba(237, 222, 124, 1)
  export const MoveHighlight5DBlack = Color4.fromRgba(140, 136, 219, 1)
  export const MoveHighlight5DWhite = Color4.fromRgba(158, 153, 226, 1)
  export const MoveArrowFill = Color4.fromRgba(150, 144, 223, 1)
  export const CheckArrowFill = Color4.fromRgba(212, 107, 84, 1)
  export const CheckBadgeBorder = Color4.fromRgba(184, 84, 61, 1)
  export const CheckBadgeFill = Color4.fromRgba(212, 105, 80, 1)
  export const CheckBadgeHover = Color4.fromRgba(92, 135, 95, 1)
  export const CheckBadgeText = Color4.fromRgba(244, 245, 237, 1)

  export const BoardTimeBlack = Color4.fromRgba(191, 191, 187, 1)
  export const BoardTimeWhite = Color4.fromRgba(200, 200, 195, 1)
  export const BoardTimeEndedBlack = Color4.fromRgba(155, 161, 171, 1)
  export const BoardTimeEndedWhite = Color4.fromRgba(162, 167, 176, 1)
  export const BoardTimeDrawBlack = Color4.fromRgba(162, 158, 151, 1)
  export const BoardTimeDrawWhite = Color4.fromRgba(168, 164, 157, 1)

  export const BoardBorderWhite = Color4.fromRgba(249, 250, 246, 1)
  export const BoardBorderBlack = Color4.fromRgba(39, 39, 39, 1)

  export const BoardBorderWhiteDim = Color4.fromRgba(225, 226, 216, 1)
  export const BoardBorderBlackDim = Color4.fromRgba(64, 64, 74, 1)

  export const InactiveLineWhiteBorder = Color4.fromRgba(244, 245, 237, 1)

  export const Purple = Color4.fromRgba(153, 113, 169, 1)
  export const PurpleDark = Color4.fromRgba(132, 93, 156, 1)

  export const ButtonText = Color4.fromRgba(39, 39, 39, 1)
  export const ButtonTextInverted = Color4.fromRgba(244, 245, 237, 1)
  export const ButtonDisabledText = Color4.fromRgba(188, 188, 188, 1)
  export const ButtonDisabledTextInverted = Color4.fromRgba(248, 249, 244, 1)

  export const OverlayMask = Color4.fromRgba(39, 39, 39, 0.38)
}

export namespace Animations {
  export const MoveAnimationDuration = 500
  export const MoveTravelViewportDuration = 260
  export const MoveTravelDuration = 380
  export const MoveTravelSpeed = Sizes.BoardMarginWidth / MoveTravelDuration
  export const BoardFocusPulseDuration = 720
  export const BoardFocusPulseReleaseDuration = 220
  export const BoardFocusPulseSettleDistance = 6
  export const BoardFocusPulseSettleScale = 0.02
  export const BoardFocusMaskAlpha = 0.42
  export const PulseEffectDuration = 1000
  export const GameEndBackgroundDuration = 600
  export const ViewFlipTransitionDuration = 360
}

export interface ButtonColorPreset {
  border: Color4
  fill: Color4
  text: Color4
}

export namespace ButtonColors {
  export const Board: ButtonColorPreset = {
    border: Color4.fromRgba(204, 161, 105, 1),
    fill: Color4.fromRgba(231, 191, 142, 1),
    text: Colors.ButtonText,
  }

  export const Yellow: ButtonColorPreset = {
    border: Color4.fromRgba(200, 182, 61, 1),
    fill: Color4.fromRgba(220, 206, 96, 1),
    text: Colors.ButtonText,
  }

  export const FiveD: ButtonColorPreset = {
    border: Color4.fromRgba(117, 106, 222, 1),
    fill: Color4.fromRgba(140, 136, 219, 1),
    text: Colors.ButtonText,
  }

  export const Red: ButtonColorPreset = {
    border: Colors.CheckBadgeBorder,
    fill: Colors.CheckBadgeFill,
    text: Colors.ButtonTextInverted,
  }

  export const GreenWhite: ButtonColorPreset = {
    border: Color4.fromRgba(152, 180, 149, 1),
    fill: Color4.fromRgba(143, 173, 140, 1),
    text: Colors.ButtonText,
  }

  export const GreenBlack: ButtonColorPreset = {
    border: Color4.fromRgba(89, 134, 89, 1),
    fill: Color4.fromRgba(92, 135, 95, 1),
    text: Colors.ButtonTextInverted,
  }

  export const White: ButtonColorPreset = {
    border: Color4.fromRgba(244, 245, 237, 1),
    fill: Color4.fromRgba(225, 226, 216, 1),
    text: Colors.ButtonText,
  }

  export const Black: ButtonColorPreset = {
    border: Color4.fromRgba(39, 39, 39, 1),
    fill: Color4.fromRgba(64, 64, 74, 1),
    text: Colors.ButtonTextInverted,
  }

  export const DisabledWhite: ButtonColorPreset = {
    border: Color4.fromRgba(249, 250, 246, 1),
    fill: Color4.fromRgba(241, 241, 236, 1),
    text: Colors.ButtonDisabledText,
  }

  export const DisabledBlack: ButtonColorPreset = {
    border: Color4.fromRgba(166, 166, 166, 1),
    fill: Color4.fromRgba(169, 169, 172, 1),
    text: Colors.ButtonDisabledTextInverted,
  }
}
