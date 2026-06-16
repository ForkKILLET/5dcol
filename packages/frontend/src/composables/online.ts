import { useStorageRef } from './storage'

export const ONLINE_USER_ID_STORAGE_KEY = '5dcol.matchUserId'
export const ONLINE_NICKNAME_STORAGE_KEY = '5dcol.matchNickname'

export const DEFAULT_ONLINE_SERVERS: Record<string, { name: string }> = {
  'https://genshin.asm.ms:5161': { name: 'Server (China)' },
  'http://localhost:5161': { name: 'Debug Server' },
}

export const DEFAULT_ONLINE_SERVER_IDS = new Set(Object.keys(DEFAULT_ONLINE_SERVERS))

const onlineNickname = useStorageRef(ONLINE_NICKNAME_STORAGE_KEY, '', {
  parse: raw => raw,
  serialize: value => {
    const trimmed = value.trim()
    return trimmed || null
  },
})

const onlineUserId = useStorageRef<string | null>(ONLINE_USER_ID_STORAGE_KEY, null, {
  parse: raw => raw || null,
  serialize: value => value,
})

export function useOnlineIdentity() {
  return {
    onlineNickname,
    onlineUserId,
  }
}

export function normalizeOnlineServerAddress(address: string) {
  const trimmed = address.trim()
  if (! trimmed) return ''
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
}
