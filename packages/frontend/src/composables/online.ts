import { z } from 'zod'
import { useStorageRef } from './storage'

export const ONLINE_USER_ID_STORAGE_KEY = '5dcol.matchUserId'
export const ONLINE_NICKNAME_STORAGE_KEY = '5dcol.matchNickname'
export const ONLINE_CUSTOM_SERVERS_STORAGE_KEY = '5dcol.onlineCustomServers'
export const ONLINE_SERVER_ORDER_STORAGE_KEY = '5dcol.onlineServerOrder'
export const ONLINE_SERVER_INFO_CACHE_STORAGE_KEY = '5dcol.onlineServerInfoCache'

export const DEFAULT_ONLINE_SERVERS: Record<string, { name: string }> = {
  'https://genshin.asm.ms:5161': { name: 'Server (China)' },
  'http://localhost:5161': { name: 'Debug Server' },
}

export const DEFAULT_ONLINE_SERVER_IDS = new Set(Object.keys(DEFAULT_ONLINE_SERVERS))

const CustomOnlineServersSchema = z.array(z.string())
const OnlineServerOrderSchema = z.array(z.string())
const OnlineServerInfoCacheEntrySchema = z.object({
  buildDate: z.string().catch(''),
  commitHash: z.string().catch(''),
  name: z.string().catch(''),
  version: z.string().catch(''),
})
const OnlineServerInfoCacheSchema = z.record(z.string(), OnlineServerInfoCacheEntrySchema)

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

export const onlineCustomServerAddresses = useStorageRef<string[]>(
  ONLINE_CUSTOM_SERVERS_STORAGE_KEY,
  [],
  {
    deep: true,
    parse: raw => normalizeOnlineCustomServerAddresses(CustomOnlineServersSchema.parse(JSON.parse(raw) as unknown)),
    serialize: value => {
      const addresses = normalizeOnlineCustomServerAddresses(value)
      return addresses.length > 0 ? JSON.stringify(addresses) : null
    },
  },
)

export const onlineServerOrder = useStorageRef<string[]>(
  ONLINE_SERVER_ORDER_STORAGE_KEY,
  [],
  {
    deep: true,
    parse: raw => normalizeOnlineServerOrder(OnlineServerOrderSchema.parse(JSON.parse(raw) as unknown)),
    serialize: value => {
      const addresses = normalizeOnlineServerOrder(value)
      return addresses.length > 0 ? JSON.stringify(addresses) : null
    },
  },
)

export const onlineServerInfoCache = useStorageRef<Record<string, OnlineServerInfoCacheEntry>>(
  ONLINE_SERVER_INFO_CACHE_STORAGE_KEY,
  {},
  {
    deep: true,
    parse: raw => normalizeOnlineServerInfoCache(OnlineServerInfoCacheSchema.parse(JSON.parse(raw) as unknown)),
    serialize: value => {
      const cache = normalizeOnlineServerInfoCache(value)
      return Object.keys(cache).length > 0 ? JSON.stringify(cache) : null
    },
  },
)

export interface OnlineServerEntry {
  address: string
  builtIn: boolean
  buildDate: string
  commitHash: string
  name: string
  version: string
}

export interface OnlineServerInfoCacheEntry {
  buildDate: string
  commitHash: string
  name: string
  version: string
}

export function useOnlineIdentity() {
  return {
    onlineNickname,
    onlineUserId,
  }
}

export function useOnlineServers() {
  return {
    addOnlineCustomServer,
    getOnlineServerEntries,
    isDefaultOnlineServerAddress,
    onlineCustomServerAddresses,
    onlineServerInfoCache,
    onlineServerOrder,
    moveOnlineServer,
    removeOnlineCustomServer,
    setCachedOnlineServerInfo,
  }
}

export function normalizeOnlineServerAddress(address: string) {
  const trimmed = address.trim()
  if (! trimmed) return ''
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
}

export function getOnlineServerEntries(): OnlineServerEntry[] {
  const entries = [
    ...Object.entries(DEFAULT_ONLINE_SERVERS).map(([address, { name }]) => {
      const cached = getCachedOnlineServerInfo(address)
      return {
        address,
        builtIn: true,
        buildDate: cached?.buildDate ?? '',
        commitHash: cached?.commitHash ?? '',
        name: cached?.name || name,
        version: cached?.version ?? '',
      }
    }),
    ...onlineCustomServerAddresses.value.map((address) => {
      const cached = getCachedOnlineServerInfo(address)
      return {
        address,
        builtIn: false,
        buildDate: cached?.buildDate ?? '',
        commitHash: cached?.commitHash ?? '',
        name: cached?.name ?? '',
        version: cached?.version ?? '',
      }
    }),
  ]

  const orderedAddresses = normalizeOnlineServerOrder(onlineServerOrder.value)
  const entryMap = new Map(entries.map(entry => [entry.address, entry]))
  return orderedAddresses
    .map(address => entryMap.get(address))
    .filter((entry): entry is OnlineServerEntry => Boolean(entry))
    .concat(entries.filter(entry => ! orderedAddresses.includes(entry.address)))
}

export function isDefaultOnlineServerAddress(address: string) {
  return DEFAULT_ONLINE_SERVER_IDS.has(address)
}

export function getOnlineServerDisplayAddress(address: string) {
  return address.replace(/^https?:\/\//, '')
}

export function getCachedOnlineServerInfo(address: string) {
  return onlineServerInfoCache.value[normalizeOnlineServerAddress(address)] ?? null
}

export function setCachedOnlineServerInfo(address: string, info: OnlineServerInfoCacheEntry) {
  const normalized = normalizeOnlineServerAddress(address)
  if (! normalized) return
  onlineServerInfoCache.value = normalizeOnlineServerInfoCache({
    ...onlineServerInfoCache.value,
    [normalized]: info,
  })
}

export function addOnlineCustomServer(address: string): string {
  const normalized = normalizeOnlineServerAddress(address)
  if (! normalized || isDefaultOnlineServerAddress(normalized)) return normalized

  const next = normalizeOnlineCustomServerAddresses([
    ...onlineCustomServerAddresses.value,
    normalized,
  ])
  onlineCustomServerAddresses.value = next
  if (! onlineServerOrder.value.includes(normalized)) {
    onlineServerOrder.value = normalizeOnlineServerOrder(getOnlineServerEntries()
      .map(entry => entry.address))
  }
  return normalized
}

export function removeOnlineCustomServer(address: string) {
  if (isDefaultOnlineServerAddress(address)) return
  onlineCustomServerAddresses.value = onlineCustomServerAddresses.value
    .filter(item => item !== address)
  onlineServerOrder.value = onlineServerOrder.value
    .filter(item => item !== address)
}

export function moveOnlineServer(address: string, direction: -1 | 1) {
  const entries = getOnlineServerEntries()
  const addresses = entries.map(entry => entry.address)
  const index = addresses.indexOf(address)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= addresses.length) return false

  const next = [...addresses]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item!)
  onlineServerOrder.value = normalizeOnlineServerOrder(next)
  return true
}

function normalizeOnlineCustomServerAddresses(addresses: readonly string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const address of addresses) {
    const value = normalizeOnlineServerAddress(address)
    if (! value || isDefaultOnlineServerAddress(value) || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

function normalizeOnlineServerOrder(addresses: readonly string[]) {
  const allAddresses = [
    ...Object.keys(DEFAULT_ONLINE_SERVERS),
    ...onlineCustomServerAddresses.value,
  ]
  const allAddressSet = new Set(allAddresses)
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const address of addresses) {
    const value = normalizeOnlineServerAddress(address)
    if (! allAddressSet.has(value) || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function normalizeOnlineServerInfoCache(cache: Record<string, OnlineServerInfoCacheEntry>) {
  const normalized: Record<string, OnlineServerInfoCacheEntry> = {}
  for (const [address, info] of Object.entries(cache)) {
    const value = normalizeOnlineServerAddress(address)
    if (! value) continue
    normalized[value] = {
      buildDate: info.buildDate,
      commitHash: info.commitHash,
      name: info.name,
      version: info.version,
    }
  }
  return normalized
}
