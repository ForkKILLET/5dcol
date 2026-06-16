import { z } from 'zod'
import { Color4 } from '@engine/basic'
import {
  RECORD_ANNOTATION_COLORS,
  RECORD_ANNOTATION_DEFAULT_COLOR,
  RECORD_ANNOTATION_TEXT_COLOR,
} from '@engine/recordAnnotationColors'

export interface CustomRecordGlyphTemplate {
  glyph: string
  color: string
}

export interface RecordGlyphTemplate extends CustomRecordGlyphTemplate {
  builtIn: boolean
}

export const RECORD_GLYPH_TEMPLATE_STORAGE_KEY = '5dcol.recordGlyphTemplates'
export const RECORD_GLYPH_TEXT_COLOR = RECORD_ANNOTATION_TEXT_COLOR
export const RECORD_GLYPH_DEFAULT_COLOR = RECORD_ANNOTATION_DEFAULT_COLOR

export const BUILT_IN_RECORD_GLYPH_TEMPLATES: RecordGlyphTemplate[] = [
  { glyph: '!!', color: RECORD_ANNOTATION_COLORS.teal, builtIn: true },
  { glyph: '!', color: RECORD_ANNOTATION_COLORS.green, builtIn: true },
  { glyph: '!?', color: RECORD_ANNOTATION_COLORS.violet, builtIn: true },
  { glyph: '?!', color: RECORD_ANNOTATION_COLORS.yellow, builtIn: true },
  { glyph: '?', color: RECORD_ANNOTATION_COLORS.orange, builtIn: true },
  { glyph: '??', color: RECORD_ANNOTATION_COLORS.red, builtIn: true },
  { glyph: '-', color: RECORD_ANNOTATION_COLORS.gold, builtIn: true },
  { glyph: '5', color: RECORD_ANNOTATION_COLORS.purple, builtIn: true },
]

const BuiltInRecordGlyphColors = new Map(
  BUILT_IN_RECORD_GLYPH_TEMPLATES.map(template => [template.glyph, template.color]),
)

const StoredRecordGlyphTemplateSchema = z.object({
  glyph: z.string(),
  color: z.string(),
})

const StoredRecordGlyphTemplatesSchema = z.array(StoredRecordGlyphTemplateSchema)

export function normalizeRecordGlyphText(text: string): string {
  return text.trim().replace(/\s+/g, '').slice(0, 8)
}

export function normalizeRecordGlyphColor(color: string): string {
  return /^#[\da-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : RECORD_GLYPH_DEFAULT_COLOR
}

export function normalizeCustomRecordGlyphTemplate(
  template: CustomRecordGlyphTemplate,
): CustomRecordGlyphTemplate | null {
  const glyph = normalizeRecordGlyphText(template.glyph)
  if (! glyph || BuiltInRecordGlyphColors.has(glyph)) return null

  return {
    glyph,
    color: normalizeRecordGlyphColor(template.color),
  }
}

export function parseStoredRecordGlyphTemplates(raw: string): CustomRecordGlyphTemplate[] {
  const result = StoredRecordGlyphTemplatesSchema.safeParse(JSON.parse(raw))
  if (! result.success) return []
  return uniqueRecordGlyphTemplates(result.data)
}

export function uniqueRecordGlyphTemplates(
  templates: readonly CustomRecordGlyphTemplate[],
): CustomRecordGlyphTemplate[] {
  const seen = new Set(BUILT_IN_RECORD_GLYPH_TEMPLATES.map(template => template.glyph))
  const result: CustomRecordGlyphTemplate[] = []
  for (const raw of templates) {
    const template = normalizeCustomRecordGlyphTemplate(raw)
    if (! template || seen.has(template.glyph)) continue
    seen.add(template.glyph)
    result.push(template)
  }
  return result
}

export function getRecordGlyphColor(
  glyph: string,
  customTemplates: readonly CustomRecordGlyphTemplate[] = [],
): string {
  const normalized = normalizeRecordGlyphText(glyph)
  return BuiltInRecordGlyphColors.get(normalized)
    ?? customTemplates.find(template => template.glyph === normalized)?.color
    ?? RECORD_GLYPH_DEFAULT_COLOR
}

export function getRecordGlyphColor4(
  glyph: string,
  customTemplates: readonly CustomRecordGlyphTemplate[] = [],
): Color4 {
  return hexToColor4(getRecordGlyphColor(glyph, customTemplates))
}

export function getRecordGlyphDisplayText(glyphs: readonly string[]): string {
  return normalizeRecordGlyphText(glyphs.join(''))
}

function hexToColor4(hex: string): Color4 {
  const normalized = /^#[\da-f]{6}$/i.test(hex) ? hex.slice(1) : RECORD_GLYPH_DEFAULT_COLOR.slice(1)
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return Color4.fromRgba(r, g, b, 1)
}
