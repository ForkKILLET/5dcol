import { computed, type Ref } from 'vue'
import { z } from 'zod'
import type { Action, Multiverse } from '@5dcol/core'
import * as FiveDPGN from '@5dcol/core/fiveDPGN'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState, type StoredGameState } from '@engine/gameState'
import { RecordDocument } from '@engine/recordTree'
import { readStorageJson, removeStorageValue, useStorageRef } from './storage'

export const LOCAL_VERSUS_STORAGE_KEY = '5dcol.localVersusGames'
export const LOCAL_VERSUS_STORAGE_VERSION = 1

const LOCAL_VERSUS_GAME_STORAGE_PREFIX = '5dcol.localVersusGame.'
const LEGACY_LOCAL_VERSUS_ID = 'legacy'

const StoredLocalVersusGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  storageKey: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const StoredLocalVersusSchema = z.object({
  version: z.literal(LOCAL_VERSUS_STORAGE_VERSION),
  games: z.array(StoredLocalVersusGameSchema),
})

export type StoredLocalVersusGame = z.infer<typeof StoredLocalVersusGameSchema>
export type StoredLocalVersus = z.infer<typeof StoredLocalVersusSchema>

export interface LocalVersusSummary extends StoredLocalVersusGame {
  actionCount: number
  annotationCount: number
}

export interface CreateLocalVersusFromTextOptions {
  title?: string
}

export interface VersusImportedSource {
  initialMultiverse: Multiverse
  actions: Action[]
  state: StoredGameState
  actionCount: number
  annotationCount: number
}

export interface CreateVersusSourceFromTextResult {
  source: VersusImportedSource | null
  error: string | null
}

export interface CreateLocalVersusFromTextResult {
  game: LocalVersusSummary | null
  error: string | null
}

const DEFAULT_LOCAL_VERSUS: StoredLocalVersus = {
  version: LOCAL_VERSUS_STORAGE_VERSION,
  games: [],
}

let storedLocalVersus: Ref<StoredLocalVersus> | null = null

export function useLocalVersus() {
  const stored = getStoredLocalVersus()
  migrateLegacyLocalGame(stored)

  const summaries = computed(() => (
    [...stored.value.games]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toLocalVersusSummary)
  ))

  function createGame(title = 'Local game'): LocalVersusSummary {
    const now = Date.now()
    const id = createLocalVersusId()
    const game: StoredLocalVersusGame = {
      id,
      title,
      storageKey: `${LOCAL_VERSUS_GAME_STORAGE_PREFIX}${id}`,
      createdAt: now,
      updatedAt: now,
    }
    stored.value.games.push(game)
    return toLocalVersusSummary(game)
  }

  function createGameFromText(
    input: string,
    {
      title = 'Imported game',
    }: CreateLocalVersusFromTextOptions = {},
  ): CreateLocalVersusFromTextResult {
    const result = createVersusSourceFromText(input)
    if (! result.source) {
      return {
        game: null,
        error: result.error,
      }
    }

    return createGameFromSource(result.source, title)
  }

  function createGameFromSource(
    source: VersusImportedSource | null,
    title = 'Imported game',
  ): CreateLocalVersusFromTextResult {
    try {
      const now = Date.now()
      const id = createLocalVersusId()
      const game: StoredLocalVersusGame = {
        id,
        title,
        storageKey: `${LOCAL_VERSUS_GAME_STORAGE_PREFIX}${id}`,
        createdAt: now,
        updatedAt: now,
      }
      const storage = getLocalStorage()
      if (! storage) throw new Error('Local storage is unavailable')
      if (source) storage.setItem(game.storageKey, JSON.stringify(source.state))
      stored.value.games.push(game)
      return {
        game: toLocalVersusSummary(game),
        error: null,
      }
    }
    catch (err) {
      return {
        game: null,
        error: err instanceof Error ? err.message : 'Failed to import game',
      }
    }
  }

  function renameGame(id: string, title: string): boolean {
    const game = stored.value.games.find(item => item.id === id)
    if (! game) return false
    game.title = title.trim() || game.title
    game.updatedAt = Date.now()
    return true
  }

  function touchGame(id: string): boolean {
    const game = stored.value.games.find(item => item.id === id)
    if (! game) return false
    game.updatedAt = Date.now()
    return true
  }

  function deleteGame(id: string): boolean {
    const index = stored.value.games.findIndex(item => item.id === id)
    if (index < 0) return false
    const [game] = stored.value.games.splice(index, 1)
    removeStorageValue(game.storageKey)
    return true
  }

  function getGame(id: string): LocalVersusSummary | null {
    const game = stored.value.games.find(item => item.id === id)
    return game ? toLocalVersusSummary(game) : null
  }

  return {
    summaries,
    createGame,
    createGameFromSource,
    createGameFromText,
    createVersusSourceFromText,
    deleteGame,
    getGame,
    renameGame,
    touchGame,
  }
}

export function createVersusSourceFromText(input: string): CreateVersusSourceFromTextResult {
  try {
    const gameState = FiveDPGN.importGameState(input)
    const recordDocument = RecordDocument.fromFiveDPGN(input)
    const recordLines = recordDocument.serializeLines()
    const recordAnnotations = recordDocument.serializeAnnotations()
    return {
      source: {
        initialMultiverse: gameState.initialMultiverse,
        actions: gameState.actions,
        state: {
          version: 1,
          initialMultiverse: gameState.initialMultiverse,
          actions: gameState.actions,
          multiverseCommitted: gameState.multiverseCommitted,
          multiverse: gameState.multiverse,
          player: gameState.player,
          actionIndex: gameState.actionIndex,
          pendingMoves: [],
          recordLines,
          recordAnnotations,
          activeRecordLineId: recordDocument.activeRecordLineId,
          nextRecordLineId: recordDocument.nextRecordLineId,
        },
        actionCount: recordLines.reduce((sum, line) => sum + line.actions.length, 0),
        annotationCount: recordAnnotations.length,
      },
      error: null,
    }
  }
  catch (err) {
    return {
      source: null,
      error: err instanceof Error ? err.message : 'Failed to import game',
    }
  }
}

function toLocalVersusSummary(game: StoredLocalVersusGame): LocalVersusSummary {
  const stats = getLocalVersusRecordStats(game.storageKey)
  return {
    ...game,
    actionCount: stats.actionCount,
    annotationCount: stats.annotationCount,
  }
}

function getLocalVersusRecordStats(storageKey: string): { actionCount: number, annotationCount: number } {
  const state = readStorageJson<StoredGameState | null>(
    storageKey,
    value => isStoredGameState(value as Partial<StoredGameState>) ? value as StoredGameState : null,
    null,
  )
  if (! state) return { actionCount: 0, annotationCount: 0 }

  return {
    actionCount: state.recordLines
      ? state.recordLines.reduce((sum, line) => sum + line.actions.length, 0)
      : (state.actions ?? []).length,
    annotationCount: state.recordAnnotations?.length ?? 0,
  }
}

function getStoredLocalVersus(): Ref<StoredLocalVersus> {
  storedLocalVersus ??= useStorageRef<StoredLocalVersus>(
    LOCAL_VERSUS_STORAGE_KEY,
    DEFAULT_LOCAL_VERSUS,
    {
      deep: true,
      parse: raw => StoredLocalVersusSchema.parse(JSON.parse(raw) as unknown),
      serialize: value => JSON.stringify(StoredLocalVersusSchema.parse(value)),
    },
  )
  return storedLocalVersus
}

function migrateLegacyLocalGame(stored: Ref<StoredLocalVersus>) {
  if (stored.value.games.some(game => game.storageKey === GAME_STORAGE_KEY)) return

  const legacy = readStorageJson<StoredGameState | null>(
    GAME_STORAGE_KEY,
    value => isStoredGameState(value as Partial<StoredGameState>) ? value as StoredGameState : null,
    null,
  )
  if (! legacy) return

  const now = Date.now()
  stored.value.games.push({
    id: LEGACY_LOCAL_VERSUS_ID,
    title: 'Local game',
    storageKey: GAME_STORAGE_KEY,
    createdAt: now,
    updatedAt: now,
  })
}

function createLocalVersusId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-versus-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
