import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import type { Action, Multiverse } from '@5dcol/core'
import {
  DEFAULT_MATCH_ROOM_SETTINGS,
  MATCH_ROOM_SETTINGS_STORAGE_VERSION,
  MatchRoomStatusSchema,
  parseStoredMatchRoomSettings,
  type StudyRoom,
  type MatchGameState,
  type MatchRoom,
  type MatchRoomSettings,
  type MatchRoomStatus,
  type StoredMatchRoomSettings,
} from '@5dcol/shared/protocol'
import { MatchClient, type MatchServerState } from '@engine/matchClient'
import {
  DEFAULT_ONLINE_SERVER_IDS,
  addOnlineCustomServer,
  getOnlineServerEntries,
  normalizeOnlineServerAddress,
  onlineCustomServerAddresses,
  onlineServerOrder,
  setCachedOnlineServerInfo,
  useOnlineIdentity,
  type OnlineServerEntry,
} from './online'
import { useStorageReactive, useStorageRef } from './storage'

const MATCH_ROOM_SETTINGS_STORAGE_KEY = '5dcol.matchRoomSettings'
const LAST_ONLINE_GAME_STORAGE_KEY = '5dcol.lastOnlineGame'
const MATCH_REFRESH_INTERVAL_MS = 5000

export const DEFAULT_MATCH_SERVER_IDS = DEFAULT_ONLINE_SERVER_IDS

export interface StoredOnlineSession {
  serverAddress: string
  roomId: string
  roomName: string
  sessionId: string
  userId: string
}
export interface StoredOnlineGame {
  serverAddress: string
  roomId: string
  roomName: string
  userId: string
  status: MatchRoomStatus
  updatedAt: number
}
export interface StoredOnlineRoom {
  serverAddress: string
  roomId: string
  roomName: string
}

export interface SharedMatchRoomState {
  kind: 'match'
  server: MatchServerState
  room: MatchRoom | null
  roomId: string
  loading: boolean
  error: string
}
export interface SharedStudyRoomState {
  kind: 'study'
  server: MatchServerState
  room: StudyRoom | null
  roomId: string
  loading: boolean
  error: string
}
export type SharedRoomState = SharedMatchRoomState | SharedStudyRoomState

export interface SharedRoomHashPayload {
  kind: 'match' | 'study'
  server: string
  room: string
}

const SharedRoomResourcePayloadSchema = z.object({
  server: z.string(),
  room: z.string(),
})
const StoredOnlineGameSchema = z.object({
  serverAddress: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  userId: z.string(),
  status: MatchRoomStatusSchema.extract(['waiting', 'playing']),
  updatedAt: z.number(),
})

export interface MatchRoomInitialSource {
  initialMultiverse: Multiverse
  actions: Action[]
}

interface UseMatchOptions {
  gameStarted: Readonly<Ref<boolean>>
  mainMenuMode: Readonly<Ref<'home' | 'versus' | 'study'>>
  setMainMenuMode?: (mode: 'home' | 'versus' | 'study') => void
  canStartOnlineGame: () => boolean
  playUISound: () => void
  startOnlineGame: (serverAddress: string, state: MatchGameState) => void
}

let activeMatchOptions: UseMatchOptions | null = null
const matchPanelMode = ref<'servers' | 'create-room'>('servers')
const matchRoomName = ref('')
const { onlineNickname: matchNickname, onlineUserId: matchUserId } = useOnlineIdentity()
const lastOnlineGame = useStorageRef<StoredOnlineGame | null>(
  LAST_ONLINE_GAME_STORAGE_KEY,
  null,
  {
    parse: raw => parseStoredOnlineGame(JSON.parse(raw) as unknown),
    serialize: game => game ? JSON.stringify(game) : null,
  },
)
const customRoomServerId = ref<string | null>(null)
const matchRoomSettings = useStorageReactive<MatchRoomSettings>(
  MATCH_ROOM_SETTINGS_STORAGE_KEY,
  DEFAULT_MATCH_ROOM_SETTINGS,
  {
    parse: raw => parseStoredMatchRoomSettings(JSON.parse(raw) as unknown).settings,
    serialize: settings => JSON.stringify({
      version: MATCH_ROOM_SETTINGS_STORAGE_VERSION,
      settings: { ...settings },
    } satisfies StoredMatchRoomSettings),
  },
)
const expandedMatchServerIds = reactive(new Set(DEFAULT_MATCH_SERVER_IDS))
const matchServers = reactive<MatchServerState[]>(getOnlineServerEntries()
  .map(entry => createMatchServerState(entry)))
const sharedRoom = ref<SharedRoomState | null>(null)
let matchRefreshTimer: number | null = null

watch([onlineCustomServerAddresses, onlineServerOrder], () => {
  syncMatchServerRegistry()
}, { deep: true })

const hasUnfinishedOnlineGame = computed(() => (
  lastOnlineGame.value !== null
  || matchServers.some(server => server.rooms.some(room => room.status !== 'finished' && room.ownSession !== null))
))
const customRoomServer = computed(() => (
  customRoomServerId.value === null
    ? null
    : matchServers.find(server => server.id === customRoomServerId.value) ?? null
))

export function useMatch(options?: UseMatchOptions) {
  if (options) activeMatchOptions = options
  const { t } = useI18n({ useScope: 'global' })

  function getOptions() {
    if (! activeMatchOptions) {
      throw new Error('Match runtime options are not configured.')
    }
    return activeMatchOptions
  }

  function getMatchRoomStatusText(status: MatchRoomStatus) {
    switch (status) {
      case 'waiting':
        return t('match.roomStatus.waiting')
      case 'playing':
        return t('match.roomStatus.playing')
      case 'finished':
        return t('match.roomStatus.finished')
    }
  }

  function getMatchRoomStatusSuffix(room: MatchRoom) {
    return t('match.roomStatusSuffix', {
      date: getMatchRoomDate(room),
      actions: String(room.actionCount),
      status: getMatchRoomStatusText(room.status),
    })
  }

  function getMatchRoomSettingsMeta(room: MatchRoom) {
    return t('match.roomSettingsMeta', {
      settings: getMatchRoomSettingsLabel(room),
    })
  }

  function getMatchRoomSettingsLabel(room: MatchRoom) {
    const enabled = [
      room.private ? t('match.setting.private') : '',
      room.settings.showOpponentMoves ? t('match.setting.liveMoves') : '',
      room.settings.canReplay ? t('match.setting.replay') : '',
    ].filter(Boolean)

    return enabled.length > 0 ? enabled.join(', ') : t('match.setting.default')
  }

  function canViewMatchRoom(room: MatchRoom) {
    if (! room.settings.canReplay) return false
    if (room.status === 'playing') return true
    return room.status === 'finished'
      && room.settings.saveRecordToServer
      && room.actionCount > 0
  }

  function getViewMatchRoomLabel(room: MatchRoom) {
    return room.status === 'finished'
      ? t('match.replay')
      : t('match.spectate')
  }

  function getMatchRoomDate(room: MatchRoom) {
    return new Date(room.startedAt ?? room.createdAt).toLocaleDateString()
  }

  function getMatchRoomSeatLabel(seat: MatchRoom['seats'][number]) {
    return seat?.nickname || t('match.anonymous')
  }

  function getMatchServerDisplayAddress(server: MatchServerState) {
    return server.address.replace(/^https?:\/\//, '')
  }

  function toggleMatchServerExpanded(server: MatchServerState) {
    getOptions().playUISound()
    if (expandedMatchServerIds.has(server.id)) {
      expandedMatchServerIds.delete(server.id)
    }
    else {
      expandedMatchServerIds.add(server.id)
    }
  }

  function normalizeMatchServerAddress(address: string) {
    return normalizeOnlineServerAddress(address)
  }

  function openVersusPage() {
    const options = getOptions()
    options.playUISound()
    options.setMainMenuMode?.('versus')
    matchPanelMode.value = 'servers'
    customRoomServerId.value = null
    void connectMatchServers()
    startMatchServerRefresh()
  }

  function closeVersusPage() {
    const options = getOptions()
    options.playUISound()
    stopMatchServerRefresh()
    matchPanelMode.value = 'servers'
    customRoomServerId.value = null
    options.setMainMenuMode?.('home')
  }

  function closeMatchCreateRoomPanel() {
    getOptions().playUISound()
    matchPanelMode.value = 'servers'
    customRoomServerId.value = null
  }

  async function connectMatchServers() {
    await Promise.all(matchServers.map(server => connectMatchServer(server)))
  }

  async function connectMatchServer(server: MatchServerState) {
    if (server.status === 'connecting') return

    server.status = 'connecting'
    server.error = ''
    try {
      const client = new MatchClient(server.address)
      const [{ info, pingMs }, rooms, stats] = await Promise.all([
        client.getInfoWithPing(),
        client.getRooms({
          userId: matchUserId.value,
        }),
        getOptionalMatchServerStats(client),
      ])
      server.name = info.name
      server.version = info.version
      server.commitHash = info.commitHash
      server.buildDate = info.buildDate
      setCachedOnlineServerInfo(server.address, info)
      server.pingMs = pingMs
      server.stats = stats
      server.rooms = rooms
      server.status = 'connected'
      syncLastOnlineGameFromServer(server)
    }
    catch (err) {
      server.rooms = []
      server.pingMs = null
      server.stats = null
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function refreshConnectedMatchServers() {
    await Promise.all(
      matchServers
        .filter(server => server.status === 'connected')
        .map(server => refreshMatchServerRooms(server)),
    )
  }

  async function refreshMatchServerRooms(server: MatchServerState) {
    try {
      const client = new MatchClient(server.address)
      const [{ info, pingMs }, rooms, stats] = await Promise.all([
        client.getInfoWithPing(),
        client.getRooms({
          userId: matchUserId.value,
        }),
        getOptionalMatchServerStats(client),
      ])
      server.name = info.name
      server.version = info.version
      server.commitHash = info.commitHash
      server.buildDate = info.buildDate
      setCachedOnlineServerInfo(server.address, info)
      server.pingMs = pingMs
      server.stats = stats
      server.rooms = rooms
      server.error = ''
      syncLastOnlineGameFromServer(server)
    }
    catch (err) {
      server.rooms = []
      server.pingMs = null
      server.stats = null
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function getOptionalMatchServerStats(client: MatchClient) {
    try {
      return await client.getStats()
    }
    catch {
      return null
    }
  }

  function startMatchServerRefresh() {
    stopMatchServerRefresh()
    matchRefreshTimer = window.setInterval(() => {
      if (getOptions().mainMenuMode.value !== 'versus' || getOptions().gameStarted.value) return
      void refreshConnectedMatchServers()
    }, MATCH_REFRESH_INTERVAL_MS)
  }

  function stopMatchServerRefresh() {
    if (matchRefreshTimer === null) return
    window.clearInterval(matchRefreshTimer)
    matchRefreshTimer = null
  }

  function clickConnectMatchServer(server: MatchServerState) {
    getOptions().playUISound()
    void connectMatchServer(server)
  }

  function clickRefreshMatchServers() {
    getOptions().playUISound()
    void connectMatchServers()
  }

  function openCustomRoomForm(server: MatchServerState) {
    getOptions().playUISound()
    if (server.status !== 'connected') return
    customRoomServerId.value = server.id
    matchPanelMode.value = 'create-room'
    expandedMatchServerIds.add(server.id)
  }

  async function createMatchRoom(
    source: MatchRoomInitialSource | null = null,
    server: MatchServerState | null = customRoomServer.value,
  ) {
    getOptions().playUISound()
    if (! server) return
    if (getOptions().gameStarted.value || server.status !== 'connected' || ! getOptions().canStartOnlineGame()) return

    try {
      const client = new MatchClient(server.address)
      const response = await client.createRoom({
        userId: matchUserId.value ?? undefined,
        name: matchRoomName.value,
        nickname: matchNickname.value,
        settings: matchRoomSettings,
        initialMultiverse: source?.initialMultiverse,
        actions: source?.actions,
      })
      matchUserId.value = response.user.id
      getOptions().startOnlineGame(server.address, response.state)
    }
    catch (err) {
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function joinMatchRoom(server: MatchServerState, roomId: string) {
    getOptions().playUISound()
    if (getOptions().gameStarted.value || server.status !== 'connected' || ! getOptions().canStartOnlineGame()) return

    try {
      const client = new MatchClient(server.address)
      const response = await client.joinRoom(roomId, {
        userId: matchUserId.value ?? undefined,
        nickname: matchNickname.value,
      })
      matchUserId.value = response.user.id
      getOptions().startOnlineGame(server.address, response.state)
    }
    catch (err) {
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function viewMatchRoom(server: MatchServerState, room: MatchRoom) {
    getOptions().playUISound()
    if (getOptions().gameStarted.value || server.status !== 'connected' || ! getOptions().canStartOnlineGame()) return

    try {
      const client = new MatchClient(server.address)
      const state = await client.getRoomState(room.id)
      getOptions().startOnlineGame(server.address, state)
    }
    catch (err) {
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  async function returnToMatchRoom(server: MatchServerState, room: MatchRoom) {
    getOptions().playUISound()
    if (! room.ownSession || getOptions().gameStarted.value || ! getOptions().canStartOnlineGame()) return

    try {
      const client = new MatchClient(server.address)
      const state = await client.getSession(room.ownSession.id, room.ownSession.userId)
      getOptions().startOnlineGame(server.address, state)
    }
    catch (err) {
      server.status = 'failed'
      server.error = err instanceof Error ? err.message : String(err)
    }
  }

  function parseSharedRoomHash(hash: string): SharedRoomHashPayload | null {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    const params = new URLSearchParams(raw)
    const match = parseSharedRoomResourceHash(params.get('versus'))
    if (match) return { kind: 'match', ...match }

    const study = parseSharedRoomResourceHash(params.get('study'))
    if (study) return { kind: 'study', ...study }

    return null
  }

  function parseSharedRoomResourceHash(encoded: string | null): Omit<SharedRoomHashPayload, 'kind'> | null {
    if (! encoded) return null
    try {
      const result = SharedRoomResourcePayloadSchema.safeParse(JSON.parse(encoded) as unknown)
      if (! result.success) return null
      const server = normalizeMatchServerAddress(result.data.server)
      if (! server) return null
      return {
        server,
        room: result.data.room,
      }
    }
    catch {
      return null
    }
  }

  function getOrAddMatchServer(address: string): MatchServerState {
    const normalized = normalizeMatchServerAddress(address)
    addOnlineCustomServer(normalized)
    syncMatchServerRegistry()

    const existing = matchServers.find(server => server.address === normalized)
    if (existing) return existing

    const server = createMatchServerState(getOnlineServerEntries()
      .find(entry => entry.address === normalized) ?? {
        address: normalized,
        builtIn: false,
        buildDate: '',
        commitHash: '',
        name: '',
        version: '',
      })
    matchServers.push(server)
    expandedMatchServerIds.add(server.id)
    return server
  }

  function storeLastOnlineGame(serverAddress: string, state: MatchGameState) {
    if (! state.session) return
    if (state.room.status === 'finished') {
      clearLastOnlineGame(state.session)
      return
    }

    lastOnlineGame.value = {
      serverAddress,
      roomId: state.room.id,
      roomName: state.room.name,
      userId: state.session.userId,
      status: state.room.status,
      updatedAt: state.room.updatedAt,
    }
  }

  function clearLastOnlineGame(session: Pick<StoredOnlineSession, 'roomId' | 'userId'> | null = null) {
    if (! session || (
      lastOnlineGame.value?.roomId === session.roomId
      && lastOnlineGame.value.userId === session.userId
    )) {
      lastOnlineGame.value = null
    }
  }

  function syncLastOnlineGameFromServer(server: MatchServerState) {
    const saved = lastOnlineGame.value
    if (! saved || saved.serverAddress !== server.address) return

    const room = server.rooms.find(room => (
      room.id === saved.roomId
      && room.ownSession?.userId === saved.userId
    ))
    if (! room || room.status === 'finished') {
      lastOnlineGame.value = null
      return
    }

    lastOnlineGame.value = {
      serverAddress: server.address,
      roomId: room.id,
      roomName: room.name,
      userId: saved.userId,
      status: room.status,
      updatedAt: room.updatedAt,
    }
  }

  return {
    DEFAULT_MATCH_SERVER_IDS,
    canViewMatchRoom,
    clearLastOnlineGame,
    clickConnectMatchServer,
    clickRefreshMatchServers,
    closeVersusPage,
    closeMatchCreateRoomPanel,
    connectMatchServers,
    customRoomServer,
    expandedMatchServerIds,
    getMatchRoomSeatLabel,
    getMatchRoomSettingsMeta,
    getMatchRoomStatusSuffix,
    getMatchServerDisplayAddress,
    getOrAddMatchServer,
    getViewMatchRoomLabel,
    hasUnfinishedOnlineGame,
    joinMatchRoom,
    lastOnlineGame,
    matchNickname,
    matchPanelMode,
    matchRoomName,
    matchRoomSettings,
    matchServers,
    matchUserId,
    normalizeMatchServerAddress,
    openCustomRoomForm,
    openVersusPage,
    parseSharedRoomHash,
    returnToMatchRoom,
    sharedRoom,
    startMatchServerRefresh,
    stopMatchServerRefresh,
    storeLastOnlineGame,
    syncLastOnlineGameFromServer,
    toggleMatchServerExpanded,
    viewMatchRoom,
    createMatchRoom,
  }
}

function parseStoredOnlineGame(value: unknown): StoredOnlineGame | null {
  const result = StoredOnlineGameSchema.safeParse(value)
  return result.success ? result.data : null
}

function createMatchServerState(entry: OnlineServerEntry): MatchServerState {
  return {
    id: entry.address,
    address: entry.address,
    name: entry.name,
    version: entry.version,
    commitHash: entry.commitHash,
    buildDate: entry.buildDate,
    pingMs: null,
    stats: null,
    status: 'idle',
    rooms: [],
    error: '',
  }
}

function syncMatchServerRegistry() {
  const entries = getOnlineServerEntries()
  const entryAddressSet = new Set(entries.map(entry => entry.address))
  for (const server of matchServers) {
    if (entryAddressSet.has(server.address)) continue
    expandedMatchServerIds.delete(server.id)
    if (customRoomServerId.value === server.id) {
      customRoomServerId.value = null
      matchPanelMode.value = 'servers'
    }
  }

  const nextServers = entries.map(entry => {
    const server = matchServers.find(item => item.address === entry.address)
    if (! server) return createMatchServerState(entry)
    if (server.status === 'idle' || ! server.name) {
      server.name = entry.name
      server.version = entry.version
      server.commitHash = entry.commitHash
      server.buildDate = entry.buildDate
    }
    return server
  })
  matchServers.splice(0, matchServers.length, ...nextServers)
}
