import { z } from 'zod'
import { RendererPreferenceSchema, type RendererPreference } from '@engine/rendererFactory'
import { useStorageReactive } from './storage'

export const SETTINGS_STORAGE_KEY = '5dcol.settings'

const BooleanWithDefault = (fallback: boolean) => z.boolean().catch(fallback)

const VolumeSchema = z
  .number()
  .refine(Number.isFinite)
  .catch(1)
  .transform(value => Math.min(1, Math.max(0, value)))

export const FiveDPGNSettingsSchema = z.preprocess(
  value => value && typeof value === 'object' ? value : {},
  z.object({
    includePieceSymbols: BooleanWithDefault(false),
    includeTravelMarkers: BooleanWithDefault(false),
    includeCaptureMarkers: BooleanWithDefault(false),
    includeCheckMarkers: BooleanWithDefault(false),
    includePromotionMarkers: BooleanWithDefault(false),
  }),
)

export type FiveDPGNSettings = z.infer<typeof FiveDPGNSettingsSchema>

export const DEFAULT_FIVE_DPGN_SETTINGS: FiveDPGNSettings = FiveDPGNSettingsSchema.parse({})

export const GameSettingsSchema = z.preprocess(
  value => value && typeof value === 'object' ? value : {},
  z.object({
    soundVolume: VolumeSchema,
    renderer: RendererPreferenceSchema.catch('auto' satisfies RendererPreference),
    fiveDPGN: FiveDPGNSettingsSchema.catch(() => FiveDPGNSettingsSchema.parse({})),
    autoFullscreen: BooleanWithDefault(true),
    autoSwitchViewPlayer: BooleanWithDefault(true),
    showClock: BooleanWithDefault(true),
    showMoveTravelAnimation: BooleanWithDefault(true),
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
