import { z } from 'zod'
import { normalizeOnlineServerAddress } from './online'
import { useStorageRef } from './storage'

export const LAST_ROOM_STORAGE_KEY = '5dcol.lastRoom'

const LastRoomSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local-versus'),
    id: z.string(),
    updatedAt: z.number(),
  }),
  z.object({
    kind: z.literal('local-study'),
    id: z.string(),
    updatedAt: z.number(),
  }),
  z.object({
    kind: z.literal('online-versus'),
    serverAddress: z.string(),
    roomId: z.string(),
    updatedAt: z.number(),
  }),
  z.object({
    kind: z.literal('online-study'),
    serverAddress: z.string(),
    roomId: z.string(),
    updatedAt: z.number(),
  }),
])

export type LastRoom = z.infer<typeof LastRoomSchema>

export function useLastRoom() {
  const lastRoom = useStorageRef<LastRoom | null>(
    LAST_ROOM_STORAGE_KEY,
    null,
    {
      parse: raw => parseLastRoom(JSON.parse(raw) as unknown),
      serialize: room => room ? JSON.stringify(room) : null,
    },
  )

  function setLastRoom(room: LastRoom) {
    lastRoom.value = normalizeLastRoom(room)
  }

  function clearLastRoom(room: LastRoom | null = null) {
    if (! room || isSameLastRoom(lastRoom.value, room)) lastRoom.value = null
  }

  return {
    clearLastRoom,
    lastRoom,
    setLastRoom,
  }
}

function parseLastRoom(value: unknown): LastRoom | null {
  const result = LastRoomSchema.safeParse(value)
  return result.success ? normalizeLastRoom(result.data) : null
}

function normalizeLastRoom(room: LastRoom): LastRoom {
  if (room.kind === 'online-versus' || room.kind === 'online-study') {
    return {
      ...room,
      serverAddress: normalizeOnlineServerAddress(room.serverAddress),
    }
  }
  return room
}

function isSameLastRoom(a: LastRoom | null, b: LastRoom): boolean {
  if (! a || a.kind !== b.kind) return false
  switch (b.kind) {
    case 'local-versus':
    case 'local-study':
      return 'id' in a && a.id === b.id
    case 'online-versus':
    case 'online-study':
      return 'serverAddress' in a && a.serverAddress === b.serverAddress && a.roomId === b.roomId
  }
}
