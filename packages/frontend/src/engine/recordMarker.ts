import type { CoordSpacelike } from '@5dcol/core'
import { Color4, Scalar } from '@engine/basic'
import { Colors } from '@engine/constant'
import { RECORD_ANNOTATION_COLORS } from '@engine/recordAnnotationColors'

const RECORD_MARKER_AUTHOR_COLORS = [
  RECORD_ANNOTATION_COLORS.purple,
  RECORD_ANNOTATION_COLORS.violet,
  RECORD_ANNOTATION_COLORS.green,
  RECORD_ANNOTATION_COLORS.yellow,
  RECORD_ANNOTATION_COLORS.red,
  RECORD_ANNOTATION_COLORS.teal,
  RECORD_ANNOTATION_COLORS.orange,
  RECORD_ANNOTATION_COLORS.gold,
]

export const DEFAULT_RECORD_MARKER_AUTHOR_ID = 'local'
export const DEFAULT_RECORD_MARKER_COLOR = RECORD_MARKER_AUTHOR_COLORS[0]!

export const getSpacelikeKey = ({ x, y }: CoordSpacelike): string => `${x}:${y}`

export const getRecordParticipantColor = (authorId: string): string => {
  if (! authorId || authorId === DEFAULT_RECORD_MARKER_AUTHOR_ID) return DEFAULT_RECORD_MARKER_COLOR

  let hash = 0
  for (const char of authorId) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return RECORD_MARKER_AUTHOR_COLORS[Math.abs(hash) % RECORD_MARKER_AUTHOR_COLORS.length] ?? DEFAULT_RECORD_MARKER_COLOR
}

export const getRecordMarkerAuthorColor = getRecordParticipantColor

export const parseRecordMarkerColor = (color: string): Color4 => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const value = hex[1]!
    const expanded = value.length === 3
      ? value.split('').map(char => `${char}${char}`).join('')
      : value
    return Color4.fromRgba(
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
      1,
    )
  }

  const rgba = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i.exec(color.trim())
  if (rgba) {
    return Color4.fromRgba(
      clampByte(Number(rgba[1])),
      clampByte(Number(rgba[2])),
      clampByte(Number(rgba[3])),
      rgba[4] === undefined ? 1 : Scalar.clamp(Number(rgba[4]), 0, 1),
    )
  }

  return Colors.Purple
}

export const getRecordMarkerTextColor = (color: Color4): Color4 => {
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
  return luminance > 0.55 ? Colors.ButtonText : Colors.ButtonTextInverted
}

const clampByte = (value: number): number => (
  Math.round(Scalar.clamp(Number.isFinite(value) ? value : 0, 0, 255))
)
