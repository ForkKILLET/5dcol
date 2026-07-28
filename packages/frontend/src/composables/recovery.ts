import { readonly, ref, shallowRef } from 'vue'

const SAFE_MODE_QUERY_KEY = 'safe'
const CRASH_STATE_STORAGE_KEY = '5dcol.recovery.crashState'
const CRASH_STATE_VERSION = 1
const AUTO_SAFE_MODE_FAILURE_COUNT = 2

const RECOVERABLE_UI_STORAGE_KEYS = [
  '5dcol.lastRoom',
  '5dcol.panelLayout',
  '5dcol.settings',
  '5dcol.studyWorkspaces',
  '5dcol.viewPlayer',
] as const

interface StoredCrashState {
  count: number
  lastFailure: RecoveryFailure
  version: typeof CRASH_STATE_VERSION
}

export interface RecoveryFailure {
  context?: string
  message: string
  source: 'render' | 'startup' | 'vue' | 'window'
  stack?: string
  timestamp: number
}

export interface StorageReadFailure {
  key: string
  message: string
}

const fatalErrorState = shallowRef<RecoveryFailure | null>(null)
const safeModeActiveState = ref(false)
const safeModeNoticeOpenState = ref(false)
const storageReadFailuresState = ref<StorageReadFailure[]>([])

let initialized = false
let healthyTimer: number | null = null

export const fatalRecoveryError = readonly(fatalErrorState)
export const safeModeActive = readonly(safeModeActiveState)
export const safeModeNoticeOpen = readonly(safeModeNoticeOpenState)
export const storageReadFailures = readonly(storageReadFailuresState)

export function initializeRecovery() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const requested = new URLSearchParams(window.location.search).get(SAFE_MODE_QUERY_KEY) === '1'
  const crashState = readCrashState()
  const crashLoopDetected = (crashState?.count ?? 0) >= AUTO_SAFE_MODE_FAILURE_COUNT

  safeModeActiveState.value = requested || crashLoopDetected
  safeModeNoticeOpenState.value = safeModeActiveState.value

  window.addEventListener('error', event => {
    if (! event.error) return
    reportFatalRecoveryError(event.error, {
      context: event.filename
        ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}`
        : undefined,
      source: 'window',
    })
  })
}

export function isRecoveryStorageBypassed(key: string): boolean {
  return safeModeActiveState.value
    && RECOVERABLE_UI_STORAGE_KEYS.some(recoverableKey => recoverableKey === key)
}

export function reportStorageReadFailure(key: string, error: unknown) {
  const message = getErrorMessage(error)
  const existing = storageReadFailuresState.value.find(failure => failure.key === key)
  if (existing?.message === message) return

  storageReadFailuresState.value = [
    ...storageReadFailuresState.value.filter(failure => failure.key !== key),
    { key, message },
  ]
  console.warn(`[5dcol] Ignoring invalid persisted value for ${key}: ${message}`)
}

export function reportFatalRecoveryError(
  error: unknown,
  details: Pick<RecoveryFailure, 'source'> & { context?: string },
) {
  if (fatalErrorState.value) return

  clearHealthyTimer()
  const normalized = normalizeFailure(error, details)
  fatalErrorState.value = normalized

  const previous = readCrashState()
  writeCrashState({
    count: (previous?.count ?? 0) + 1,
    lastFailure: normalized,
    version: CRASH_STATE_VERSION,
  })
}

export function markRecoveryHealthy() {
  if (fatalErrorState.value) return
  clearHealthyTimer()
  removeSessionValue(CRASH_STATE_STORAGE_KEY)
}

export function scheduleRecoveryHealthy(delayMs = 1500) {
  clearHealthyTimer()
  healthyTimer = window.setTimeout(() => {
    healthyTimer = null
    markRecoveryHealthy()
  }, delayMs)
}

export function clearFatalRecoveryError() {
  clearHealthyTimer()
  fatalErrorState.value = null
  removeSessionValue(CRASH_STATE_STORAGE_KEY)
}

export function dismissSafeModeNotice() {
  safeModeNoticeOpenState.value = false
}

export function restartInSafeMode() {
  const url = new URL(window.location.href)
  url.searchParams.set(SAFE_MODE_QUERY_KEY, '1')
  window.location.assign(url)
}

export function restartNormally() {
  removeSessionValue(CRASH_STATE_STORAGE_KEY)
  const url = new URL(window.location.href)
  url.searchParams.delete(SAFE_MODE_QUERY_KEY)
  window.location.assign(url)
}

export function resetRecoverableUIState() {
  const storage = getLocalStorage()
  for (const key of RECOVERABLE_UI_STORAGE_KEYS) {
    try {
      storage?.removeItem(key)
    }
    catch {
      // Continue resetting the remaining independent settings.
    }
  }
}

export function resetRecoverableUIStateAndRestart() {
  resetRecoverableUIState()
  restartNormally()
}

export function resetAllLocalDataAndRestart() {
  try {
    getLocalStorage()?.clear()
  }
  catch {
    // Reload even when browser storage is unavailable.
  }
  try {
    window.sessionStorage.clear()
  }
  catch {
    // Reload even when browser storage is unavailable.
  }
  restartNormally()
}

export function getRecoveryDiagnostics(extra: Record<string, unknown> = {}): string {
  const url = new URL(window.location.href)
  url.hash = ''
  return JSON.stringify({
    url: url.href,
    userAgent: navigator.userAgent,
    safeMode: safeModeActiveState.value,
    fatalError: fatalErrorState.value,
    invalidStorageKeys: storageReadFailuresState.value,
    ...extra,
  }, null, 2)
}

function normalizeFailure(
  error: unknown,
  details: Pick<RecoveryFailure, 'source'> & { context?: string },
): RecoveryFailure {
  if (error instanceof Error) {
    return {
      ...details,
      message: error.message || error.name,
      stack: error.stack,
      timestamp: Date.now(),
    }
  }
  return {
    ...details,
    message: String(error),
    timestamp: Date.now(),
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readCrashState(): StoredCrashState | null {
  try {
    const raw = window.sessionStorage.getItem(CRASH_STATE_STORAGE_KEY)
    if (! raw) return null
    const value = JSON.parse(raw) as Partial<StoredCrashState>
    if (
      value.version !== CRASH_STATE_VERSION
      || ! Number.isInteger(value.count)
      || value.count! < 1
      || ! value.lastFailure
    ) return null
    return value as StoredCrashState
  }
  catch {
    return null
  }
}

function writeCrashState(state: StoredCrashState) {
  try {
    window.sessionStorage.setItem(CRASH_STATE_STORAGE_KEY, JSON.stringify(state))
  }
  catch {
    // Crash recovery remains available in the current page without persistence.
  }
}

function removeSessionValue(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  }
  catch {
    // Session persistence is best-effort.
  }
}

function clearHealthyTimer() {
  if (healthyTimer === null) return
  window.clearTimeout(healthyTimer)
  healthyTimer = null
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage
  }
  catch {
    return null
  }
}
