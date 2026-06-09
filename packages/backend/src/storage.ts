import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { GameState } from '@5dcol/core'
import { MATCH_STORAGE_VERSION, MatchRoomSettingsSchema, type StoredMatchRoomsFile } from '@5dcol/shared/protocol'
import type { RoomState } from './server.ts'

type StoredRoomsFile = StoredMatchRoomsFile<RoomState>

const dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_FILE = path.resolve(dirname, '../data/rooms.json')

export function createRoomStorage(filePath = process.env.MATCH_DATA_FILE ?? DEFAULT_DATA_FILE) {
  return {
    load(): RoomState[] {
      try {
        const raw = fs.readFileSync(filePath, 'utf8')
        const data = JSON.parse(raw) as Partial<StoredRoomsFile>
        if (data.version !== MATCH_STORAGE_VERSION || ! Array.isArray(data.rooms)) return []

        const rooms = data.rooms.filter(isValidRoom)
        return rooms
      }
      catch (err) {
        if (isNotFoundError(err)) return []
        console.error(err)
        return []
      }
    },

    save(rooms: RoomState[]) {
      const data: StoredRoomsFile = {
        version: MATCH_STORAGE_VERSION,
        rooms: rooms.map(toStoredRoom),
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, `${JSON.stringify(data)}\n`, 'utf8')
    },
  }
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
  room.password = typeof room.password === 'string' && room.password.length > 0
    ? room.password
    : null
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
