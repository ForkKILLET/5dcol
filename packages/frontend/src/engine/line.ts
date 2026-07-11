import { Coord, Line, Multiverse, Player } from '@5dcol/core'
import { type Color4 } from '@engine/basic'
import { Colors } from '@engine/constant'

export interface LineColors {
  border: Color4
  fill: Color4
}

export const getLineRenderOrder = (line: Line): number => {
  const board = line.boards[line.mStart]
  if (! board?.createdBy) return 0
  if (board.createdByRole !== 'target') return 0
  if (Coord.isSameBoard(board.createdBy.from, board.createdBy.to)) return 0
  return board.createdByOrder ?? 0
}

export const getLineColors = (multiverse: Multiverse, l: number): LineColors => {
  if (! Multiverse.isInactiveLine(multiverse, l)) {
    return {
      border: Colors.PurpleDark,
      fill: Colors.Purple,
    }
  }

  switch (Multiverse.getLinePlayerForMultiverse(multiverse, l)) {
    case Player.W:
      return {
        border: Colors.InactiveLineWhiteBorder,
        fill: Colors.BoardBorderWhiteDim,
      }
    case Player.B:
      return {
        border: Colors.BoardBorderBlack,
        fill: Colors.BoardBorderBlackDim,
      }
    case null:
      return {
        border: Colors.PurpleDark,
        fill: Colors.Purple,
      }
  }
}
