import { RenderLayer } from '@engine/constant'

export interface BoardRenderLayers {
  shadowBase: RenderLayer
  shadowHigh: RenderLayer
  border: RenderLayer
  board: RenderLayer
  piece: RenderLayer
}

export const getBoardRenderLayers = (animated: boolean): BoardRenderLayers => (
  animated
    ? {
        shadowBase: RenderLayer.BoardShadowBase,
        shadowHigh: RenderLayer.BoardShadowHigh,
        border: RenderLayer.AnimatedBoardBorder,
        board: RenderLayer.AnimatedBoard,
        piece: RenderLayer.AnimatedPiece,
      }
    : {
        shadowBase: RenderLayer.BoardShadowBase,
        shadowHigh: RenderLayer.BoardShadowHigh,
        border: RenderLayer.BoardBorder,
        board: RenderLayer.Board,
        piece: RenderLayer.Piece,
      }
)
