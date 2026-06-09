import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { GameState, type Action } from '@5dcol/core'
import {
  MATCH_STORAGE_VERSION,
  MatchRoomFinishReasonSchema,
  MatchRoomSettingsSchema,
  type MatchRoomSettings,
  type StoredMatchRoomsFile,
} from '@5dcol/shared/protocol'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { asc, eq } from 'drizzle-orm'
import type { RoomState } from './server.ts'
import {
  actionsTable,
  metadataTable,
  roomsTable,
  sessionsTable,
  storageSchema,
  usersTable,
  type ActionRow,
  type RoomRow,
  type SessionRow,
  type UserRow,
} from './storageSchema.ts'

type StoredRoomsFile = StoredMatchRoomsFile<RoomState>
export interface StorageState {
  rooms: RoomState[]
  users: UserState[]
}

export interface UserState {
  id: string
  nickname: string | null
  createdAt: number
  updatedAt: number
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATABASE_FILE = path.resolve(dirname, '../data/rooms.sqlite')
const DEFAULT_LEGACY_DATA_FILE = path.resolve(dirname, '../data/rooms.json')
const STORAGE_VERSION_KEY = 'storageVersion'

export function createRoomStorage(
  databasePath = process.env.MATCH_DATABASE_FILE ?? DEFAULT_DATABASE_FILE,
  legacyJsonPath = process.env.MATCH_LEGACY_DATA_FILE ?? process.env.MATCH_DATA_FILE ?? DEFAULT_LEGACY_DATA_FILE,
) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const sqlite = new DatabaseSync(databasePath)
  sqlite.exec('PRAGMA foreign_keys = ON')
  const db = drizzle({
    client: sqlite,
    schema: storageSchema,
  })
  initializeDatabase(sqlite)

  return {
    load(): RoomState[] {
      migrateLegacyJsonIfNeeded(db, legacyJsonPath)
      return loadState(db).rooms
    },

    loadState(): StorageState {
      migrateLegacyJsonIfNeeded(db, legacyJsonPath)
      return loadState(db)
    },

    save(rooms: RoomState[], users: UserState[] = []) {
      saveState(db, { rooms, users: mergeUsers(users, getSessionUsers(rooms)) })
    },

    saveState(state: StorageState) {
      saveState(db, state)
    },
  }
}

type RoomDatabase = ReturnType<typeof drizzle<typeof storageSchema>>

function initializeDatabase(sqlite: DatabaseSync) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      max_players INTEGER NOT NULL,
      winner INTEGER,
      finish_reason TEXT,
      settings_json TEXT NOT NULL,
      password TEXT,
      clock_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      player INTEGER NOT NULL,
      nickname TEXT,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      action_index INTEGER NOT NULL,
      action_json TEXT NOT NULL,
      PRIMARY KEY (room_id, action_index)
    );
  `)
  addColumnIfMissing(sqlite, 'sessions', 'user_id', 'TEXT')
}

function migrateLegacyJsonIfNeeded(db: RoomDatabase, legacyJsonPath: string) {
  const storageVersion = db
    .select()
    .from(metadataTable)
    .where(eq(metadataTable.key, STORAGE_VERSION_KEY))
    .get()
  if (storageVersion?.value === String(MATCH_STORAGE_VERSION)) return

  const existingRooms = db.select({ id: roomsTable.id }).from(roomsTable).limit(1).all()
  if (existingRooms.length === 0) {
    const rooms = loadLegacyRooms(legacyJsonPath)
    if (rooms.length > 0) saveState(db, { rooms, users: getSessionUsers(rooms) })
  }

  db.insert(metadataTable)
    .values({ key: STORAGE_VERSION_KEY, value: String(MATCH_STORAGE_VERSION) })
    .onConflictDoUpdate({
      target: metadataTable.key,
      set: { value: String(MATCH_STORAGE_VERSION) },
    })
    .run()
}

function addColumnIfMissing(sqlite: DatabaseSync, table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (columns.some(current => current.name === column)) return
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function loadLegacyRooms(filePath: string): RoomState[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw) as Partial<StoredRoomsFile>
    if (data.version !== MATCH_STORAGE_VERSION || ! Array.isArray(data.rooms)) return []
    return data.rooms.filter(isValidRoom)
  }
  catch (err) {
    if (isNotFoundError(err)) return []
    console.error(err)
    return []
  }
}

function loadState(db: RoomDatabase): StorageState {
  const roomRows = db.select().from(roomsTable).all()
  const userRows = db.select().from(usersTable).all()
  const sessionRows = db.select().from(sessionsTable).all()
  const actionRows = db
    .select()
    .from(actionsTable)
    .orderBy(asc(actionsTable.roomId), asc(actionsTable.actionIndex))
    .all()

  const sessionsByRoom = groupBy(sessionRows, row => row.roomId)
  const actionsByRoom = groupBy(actionRows, row => row.roomId)
  const rooms = roomRows.map(row => rowToRoom(row, sessionsByRoom.get(row.id) ?? [], actionsByRoom.get(row.id) ?? []))
  const validRooms = rooms.filter(isValidRoom)
  return {
    rooms: validRooms,
    users: mergeUsers(userRows.map(rowToUser), getSessionUsers(validRooms)),
  }
}

function saveState(db: RoomDatabase, state: StorageState) {
  const storedRooms = state.rooms.map(toStoredRoom)
  const users = mergeUsers(state.users, getSessionUsers(storedRooms))
  db.transaction((tx) => {
    tx.delete(actionsTable).run()
    tx.delete(sessionsTable).run()
    tx.delete(roomsTable).run()
    tx.delete(usersTable).run()

    tx.insert(metadataTable)
      .values({ key: STORAGE_VERSION_KEY, value: String(MATCH_STORAGE_VERSION) })
      .onConflictDoUpdate({
        target: metadataTable.key,
        set: { value: String(MATCH_STORAGE_VERSION) },
      })
      .run()

    for (const user of users) {
      tx.insert(usersTable).values({
        id: user.id,
        nickname: user.nickname,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }).run()
    }

    for (const room of storedRooms) {
      tx.insert(roomsTable).values(roomToRow(room)).run()
      for (const session of room.sessions) {
        tx.insert(sessionsTable).values({
          id: session.id,
          userId: session.userId,
          roomId: session.roomId,
          player: session.player,
          nickname: session.nickname,
          lastSeenAt: session.lastSeenAt,
        }).run()
      }
      room.actions.forEach((action, actionIndex) => {
        tx.insert(actionsTable).values({
          roomId: room.id,
          actionIndex,
          actionJson: JSON.stringify(action),
        }).run()
      })
    }
  })
}

function roomToRow(room: RoomState): typeof roomsTable.$inferInsert {
  return {
      id: room.id,
      name: room.name,
      maxPlayers: room.maxPlayers,
      winner: room.winner,
      finishReason: room.finishReason === null
        ? null
        : MatchRoomFinishReasonSchema.parse(room.finishReason),
      settingsJson: JSON.stringify(room.settings),
      password: null,
      clockJson: JSON.stringify(room.clock),
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    updatedAt: room.updatedAt,
  }
}

function rowToRoom(room: RoomRow, sessions: SessionRow[], actions: ActionRow[]): Partial<RoomState> {
  return {
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    sessions: sessions.map(session => ({
      id: session.id,
      userId: session.userId ?? createLegacyUserId(session.id),
      roomId: session.roomId,
      player: session.player,
      nickname: session.nickname,
      lastSeenAt: session.lastSeenAt,
    })),
    actions: actions.map(action => parseJson<Action>(action.actionJson)),
    winner: room.winner,
    finishReason: room.finishReason === null
      ? null
      : MatchRoomFinishReasonSchema.parse(room.finishReason),
    settings: parseRoomSettings(room),
    clock: parseJson(room.clockJson),
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    updatedAt: room.updatedAt,
  }
}

function rowToUser(row: UserRow): UserState {
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function getSessionUsers(rooms: RoomState[]): UserState[] {
  const now = Date.now()
  const users = new Map<string, UserState>()
  for (const room of rooms) {
    for (const session of room.sessions) {
      const existing = users.get(session.userId)
      users.set(session.userId, {
        id: session.userId,
        nickname: existing?.nickname ?? session.nickname,
        createdAt: existing?.createdAt ?? session.lastSeenAt ?? now,
        updatedAt: Math.max(existing?.updatedAt ?? 0, session.lastSeenAt ?? now),
      })
    }
  }
  return [...users.values()]
}

function mergeUsers(...sources: UserState[][]): UserState[] {
  const users = new Map<string, UserState>()
  for (const source of sources) {
    for (const user of source) {
      const existing = users.get(user.id)
      users.set(user.id, existing
        ? {
            ...existing,
            nickname: user.nickname ?? existing.nickname,
            createdAt: Math.min(existing.createdAt, user.createdAt),
            updatedAt: Math.max(existing.updatedAt, user.updatedAt),
          }
        : user)
    }
  }
  return [...users.values()]
}

function createLegacyUserId(sessionId: string): string {
  return `legacy-${sessionId || randomUUID()}`
}

function toStoredRoom(room: RoomState): RoomState {
  if (room.finishReason === null || room.settings.saveRecordToServer) return room
  return {
    ...room,
    actions: [],
  }
}

function isValidRoom(room: Partial<RoomState>): room is RoomState {
  if (
    typeof room.id !== 'string'
    || typeof room.name !== 'string'
    || room.maxPlayers !== 2
    || ! Array.isArray(room.sessions)
    || ! Array.isArray(room.actions)
    || typeof room.updatedAt !== 'number'
  ) return false

  const now = Date.now()
  if (room.sessions.some(session => {
    if (
      typeof session.id !== 'string'
      || typeof session.userId !== 'string'
      || session.roomId !== room.id
      || (session.player !== 0 && session.player !== 1)
    ) return true

    session.lastSeenAt ??= now
    session.nickname ??= null
    return typeof session.lastSeenAt !== 'number'
      || (session.nickname !== null && typeof session.nickname !== 'string')
  })) return false

  room.winner ??= null
  room.finishReason ??= null
  room.settings = MatchRoomSettingsSchema.parse(room.settings)
  room.createdAt ??= room.updatedAt
  room.startedAt ??= null
  room.clock = getValidRoomClock(room)
  if (room.winner !== null && room.winner !== 0 && room.winner !== 1) return false
  if (typeof room.createdAt !== 'number') return false
  if (room.startedAt !== null && typeof room.startedAt !== 'number') return false
  if (
    room.finishReason !== null
    && room.finishReason !== 'checkmate'
    && room.finishReason !== 'stalemate'
    && room.finishReason !== 'forfeit'
  ) return false

  try {
    GameState.create(room.actions)
    return true
  }
  catch {
    return false
  }
}

function parseRoomSettings(room: RoomRow): MatchRoomSettings {
  const settings = parseJson<Record<string, unknown>>(room.settingsJson)
  if (typeof room.password === 'string' && room.password.length > 0) {
    settings.private = true
  }
  return MatchRoomSettingsSchema.parse(settings)
}

function getValidRoomClock(room: Partial<RoomState>): RoomState['clock'] {
  const totals = getValidPlayerTotals(room.clock?.playerTotalsMs)
  const inferredTotals = inferPlayerTotals(room.actions ?? [])
  const playerTotalsMs: [number, number] = [
    Math.max(totals[0], inferredTotals[0]),
    Math.max(totals[1], inferredTotals[1]),
  ]
  const isPlaying = room.finishReason === null
    && room.sessions?.length === room.maxPlayers
    && room.startedAt !== null
  const turnStartedAt = typeof room.clock?.turnStartedAt === 'number'
    ? room.clock.turnStartedAt
    : isPlaying ? room.updatedAt! : null
  return { playerTotalsMs, turnStartedAt }
}

function getValidPlayerTotals(value: unknown): [number, number] {
  if (! Array.isArray(value)) return [0, 0]
  return [
    getValidDuration(value[0]),
    getValidDuration(value[1]),
  ]
}

function inferPlayerTotals(actions: RoomState['actions']): [number, number] {
  return actions.reduce<[number, number]>((totals, action, index) => {
    totals[index % 2] += getValidDuration(action.clock?.elapsedMs)
    return totals
  }, [0, 0])
}

function getValidDuration(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && 'code' in err && err.code === 'ENOENT'
}
