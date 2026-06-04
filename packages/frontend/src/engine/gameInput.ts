import { Coord, type CoordSpacelike } from '@5dcol/core'

export interface LocatedSquare {
  l: number
  m: number
  coord: CoordSpacelike
}

export const isModifierKeyEvent = (e: KeyboardEvent): boolean => (
  e.ctrlKey || e.altKey || e.metaKey
)

export const isTextInputEvent = (e: KeyboardEvent): boolean => {
  const target = e.target
  if (! (target instanceof HTMLElement)) return false
  return target.isContentEditable
    || target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
}

export const isSameLocatedSquare = (
  square: LocatedSquare,
  l: number,
  m: number,
  coord: CoordSpacelike,
): boolean => (
  square.l === l && square.m === m && Coord.isSameSpace(square.coord, coord)
)
