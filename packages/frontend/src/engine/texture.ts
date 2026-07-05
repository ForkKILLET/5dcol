import { Piece } from '@5dcol/core'

export const TEXTURE_NAME_LIST = [
  'pieces/BB.svg',
  'pieces/KB.svg',
  'pieces/NB.svg',
  'pieces/PB.svg',
  'pieces/QB.svg',
  'pieces/RB.svg',
  'pieces/UnicornB.svg',
  'pieces/DragonB.svg',
  'pieces/PrincessB.svg',
  'pieces/BrawnB.svg',
  'pieces/CommonKingB.svg',
  'pieces/RoyalQueenB.svg',
  'pieces/BW.svg',
  'pieces/KW.svg',
  'pieces/NW.svg',
  'pieces/PW.svg',
  'pieces/QW.svg',
  'pieces/RW.svg',
  'pieces/UnicornW.svg',
  'pieces/DragonW.svg',
  'pieces/PrincessW.svg',
  'pieces/BrawnW.svg',
  'pieces/CommonKingW.svg',
  'pieces/RoyalQueenW.svg',
] as const

export type TextureName = typeof TEXTURE_NAME_LIST[number]
export type TextureID = number

export const TEXTURE_NAME_TO_ID = new Map<TextureName, TextureID>(
  TEXTURE_NAME_LIST.map((name, index) => [name, index])
)
export const TEXTURE_ID_TO_NAME = new Map<TextureID, TextureName>(
  TEXTURE_NAME_LIST.map((name, index) => [index, name])
)

export const getTextureLabel = (id: TextureID): string => `${TEXTURE_ID_TO_NAME.get(id)!}#${id}`

export abstract class TextureManager<T> {
  abstract loadAll(): Promise<T[]>
  abstract load(id: TextureID, name: TextureName): Promise<T>
  abstract get(id: TextureID): T
  getByName(name: TextureName): T {
    const id = TEXTURE_NAME_TO_ID.get(name)!
    return this.get(id)
  }
}

export const PIECE_TO_TEXTURE_ID: Map<Piece, TextureID> = new Map([
  [Piece.PB, TEXTURE_NAME_TO_ID.get('pieces/PB.svg')!],
  [Piece.RB, TEXTURE_NAME_TO_ID.get('pieces/RB.svg')!],
  [Piece.NB, TEXTURE_NAME_TO_ID.get('pieces/NB.svg')!],
  [Piece.BB, TEXTURE_NAME_TO_ID.get('pieces/BB.svg')!],
  [Piece.QB, TEXTURE_NAME_TO_ID.get('pieces/QB.svg')!],
  [Piece.KB, TEXTURE_NAME_TO_ID.get('pieces/KB.svg')!],
  [Piece.UB, TEXTURE_NAME_TO_ID.get('pieces/UnicornB.svg')!],
  [Piece.DB, TEXTURE_NAME_TO_ID.get('pieces/DragonB.svg')!],
  [Piece.SB, TEXTURE_NAME_TO_ID.get('pieces/PrincessB.svg')!],
  [Piece.WB, TEXTURE_NAME_TO_ID.get('pieces/BrawnB.svg')!],
  [Piece.CB, TEXTURE_NAME_TO_ID.get('pieces/CommonKingB.svg')!],
  [Piece.YB, TEXTURE_NAME_TO_ID.get('pieces/RoyalQueenB.svg')!],

  [Piece.PW, TEXTURE_NAME_TO_ID.get('pieces/PW.svg')!],
  [Piece.RW, TEXTURE_NAME_TO_ID.get('pieces/RW.svg')!],
  [Piece.NW, TEXTURE_NAME_TO_ID.get('pieces/NW.svg')!],
  [Piece.BW, TEXTURE_NAME_TO_ID.get('pieces/BW.svg')!],
  [Piece.QW, TEXTURE_NAME_TO_ID.get('pieces/QW.svg')!],
  [Piece.KW, TEXTURE_NAME_TO_ID.get('pieces/KW.svg')!],
  [Piece.UW, TEXTURE_NAME_TO_ID.get('pieces/UnicornW.svg')!],
  [Piece.DW, TEXTURE_NAME_TO_ID.get('pieces/DragonW.svg')!],
  [Piece.SW, TEXTURE_NAME_TO_ID.get('pieces/PrincessW.svg')!],
  [Piece.WW, TEXTURE_NAME_TO_ID.get('pieces/BrawnW.svg')!],
  [Piece.CW, TEXTURE_NAME_TO_ID.get('pieces/CommonKingW.svg')!],
  [Piece.YW, TEXTURE_NAME_TO_ID.get('pieces/RoyalQueenW.svg')!],
])
