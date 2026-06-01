import { Piece } from '@5dcol/core'

export const TEXTURE_NAME_LIST = [
  'pieces/BB.svg',
  'pieces/KB.svg',
  'pieces/NB.svg',
  'pieces/PB.svg',
  'pieces/QB.svg',
  'pieces/RB.svg',
  'pieces/BW.svg',
  'pieces/KW.svg',
  'pieces/NW.svg',
  'pieces/PW.svg',
  'pieces/QW.svg',
  'pieces/RW.svg',
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

  [Piece.PW, TEXTURE_NAME_TO_ID.get('pieces/PW.svg')!],
  [Piece.RW, TEXTURE_NAME_TO_ID.get('pieces/RW.svg')!],
  [Piece.NW, TEXTURE_NAME_TO_ID.get('pieces/NW.svg')!],
  [Piece.BW, TEXTURE_NAME_TO_ID.get('pieces/BW.svg')!],
  [Piece.QW, TEXTURE_NAME_TO_ID.get('pieces/QW.svg')!],
  [Piece.KW, TEXTURE_NAME_TO_ID.get('pieces/KW.svg')!],
])