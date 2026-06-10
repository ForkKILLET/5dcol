import { reactive, ref, watch, type Ref, type UnwrapNestedRefs } from 'vue'
import { getLocalStorage } from '@engine/gameState'

interface StorageRefOptions<T> {
  deep?: boolean
  parse?: (raw: string) => T
  serialize?: (value: T) => string | null
}

export function useStorageRef<T>(
  key: string,
  fallback: T,
  options: StorageRefOptions<T> = {},
): Ref<T> {
  const value = ref(readStorageValue(key, fallback, options.parse)) as Ref<T>

  watch(value, (next) => {
    writeStorageValue(key, next, options.serialize)
  }, { deep: options.deep })

  return value
}

export function useStorageReactive<T extends object>(
  key: string,
  fallback: T,
  options: StorageRefOptions<T> = {},
): UnwrapNestedRefs<T> {
  const value = reactive(readStorageValue(key, fallback, options.parse))

  watch(value, (next) => {
    writeStorageValue(key, next as T, options.serialize)
  }, { deep: true })

  return value
}

export function removeStorageValue(key: string) {
  try {
    getLocalStorage()?.removeItem(key)
  }
  catch {
    // Storage persistence is best-effort.
  }
}

export function readStorageJson<T>(
  key: string,
  parse: (value: unknown) => T,
  fallback: T,
): T {
  return readStorageValue(
    key,
    fallback,
    raw => parse(JSON.parse(raw) as unknown),
  )
}

function readStorageValue<T>(
  key: string,
  fallback: T,
  parse: ((raw: string) => T) | undefined,
): T {
  try {
    const raw = getLocalStorage()?.getItem(key)
    if (raw === null || raw === undefined) return cloneFallback(fallback)
    return parse ? parse(raw) : JSON.parse(raw) as T
  }
  catch {
    return cloneFallback(fallback)
  }
}

function writeStorageValue<T>(
  key: string,
  value: T,
  serialize: ((value: T) => string | null) | undefined,
) {
  try {
    const storage = getLocalStorage()
    if (! storage) return

    const raw = serialize ? serialize(value) : JSON.stringify(value)
    if (raw === null) storage.removeItem(key)
    else storage.setItem(key, raw)
  }
  catch {
    // Storage persistence is best-effort.
  }
}

function cloneFallback<T>(fallback: T): T {
  if (fallback && typeof fallback === 'object') {
    return Array.isArray(fallback)
      ? fallback.map(item => cloneFallback(item)) as T
      : Object.fromEntries(
          Object.entries(fallback).map(([key, value]) => [key, cloneFallback(value)]),
        ) as T
  }
  return fallback
}
