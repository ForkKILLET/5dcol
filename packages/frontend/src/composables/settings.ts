import { z } from 'zod'
import { RendererPreferenceSchema, type RendererPreference } from '@engine/rendererFactory'
import { SQUARE_MARKER_DISPLAY_MODES, type SquareMarkerDisplayMode } from '@engine/recordMarker'
import { useStorageReactive } from './storage'

export const SETTINGS_STORAGE_KEY = '5dcol.settings'

const BooleanWithDefault = (fallback: boolean) => z.boolean().catch(fallback)

export const ThemeColorSchema = z.enum(['white', 'black', 'view', 'system'])
export type ThemeColor = z.infer<typeof ThemeColorSchema>

export const SquareMarkerDisplayModeSchema = z.enum(SQUARE_MARKER_DISPLAY_MODES)

const VolumeSchema = (fallback: number) => z
  .number()
  .refine(Number.isFinite)
  .catch(fallback)
  .transform(value => Math.min(1, Math.max(0, value)))

const NumberRangeSchema = (fallback: number, min: number, max: number) => z
  .number()
  .refine(Number.isFinite)
  .catch(fallback)
  .transform(value => Math.min(max, Math.max(min, value)))

export const FiveDPGNSettingsSchema = z.preprocess(
  value => value && typeof value === 'object' ? value : {},
  z.object({
    includePieceSymbols: BooleanWithDefault(false),
    includeTravelMarkers: BooleanWithDefault(false),
    includeCaptureMarkers: BooleanWithDefault(false),
    includeCheckMarkers: BooleanWithDefault(false),
    includePromotionMarkers: BooleanWithDefault(false),
    includeBuiltInGlyphNAGs: BooleanWithDefault(false),
    omitUnnecessarySourceSquares: BooleanWithDefault(false),
    omitSingleMoveSourceBoards: BooleanWithDefault(false),
  }),
)

export type FiveDPGNSettings = z.infer<typeof FiveDPGNSettingsSchema>

export const DEFAULT_FIVE_DPGN_SETTINGS: FiveDPGNSettings = FiveDPGNSettingsSchema.parse({})

export const GameSettingsSchema = z.preprocess(
  value => {
    const settings = value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {}
    const legacySoundVolume = VolumeSchema(1).parse(settings.soundVolume)
    return {
      ...settings,
      ambienceVolume: settings.ambienceVolume ?? legacySoundVolume * 0.35,
      uiVolume: settings.uiVolume ?? legacySoundVolume,
      bellVolume: settings.bellVolume ?? legacySoundVolume,
    }
  },
  z.object({
    ambienceVolume: VolumeSchema(0.35),
    uiVolume: VolumeSchema(1),
    bellVolume: VolumeSchema(1),
    themeColor: ThemeColorSchema.catch('view' satisfies ThemeColor),
    renderer: RendererPreferenceSchema.catch('auto' satisfies RendererPreference),
    fiveDPGN: FiveDPGNSettingsSchema.catch(() => FiveDPGNSettingsSchema.parse({})),
    autoFullscreen: BooleanWithDefault(true),
    autoEnterLastRoom: BooleanWithDefault(false),
    autoSwitchViewPlayer: BooleanWithDefault(true),
    showClock: BooleanWithDefault(true),
    showMoveTravelAnimation: BooleanWithDefault(true),
    pointerDragThreshold: NumberRangeSchema(8, 0, 24),
    squareMarkerDisplayMode: SquareMarkerDisplayModeSchema.catch('highlight' satisfies SquareMarkerDisplayMode),
    turnAlertSound: BooleanWithDefault(true),
    turnAlertTitle: BooleanWithDefault(true),
    turnAlertNotification: BooleanWithDefault(false),
  }),
)

export type GameSettings = z.infer<typeof GameSettingsSchema>

export const DEFAULT_GAME_SETTINGS: GameSettings = GameSettingsSchema.parse({})

export function useGameSettings() {
  return useStorageReactive<GameSettings>(
    SETTINGS_STORAGE_KEY,
    DEFAULT_GAME_SETTINGS,
    {
      parse: raw => GameSettingsSchema.parse(JSON.parse(raw) as unknown),
    },
  )
}
