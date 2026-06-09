import { z } from 'zod'
import type { Action, Move, Player } from '@5dcol/core'

export const MATCH_PROTOCOL_VERSION = 1
export const MATCH_STORAGE_VERSION = 1
export const MATCH_ROOM_SETTINGS_STORAGE_VERSION = 1

const PlayerSchema: z.ZodType<Player> = z.union([z.literal(0), z.literal(1)])
const NullablePlayerSchema = PlayerSchema.nullable()
const ActionSchema = z.custom<Action>()
const MoveSchema = z.custom<Move>()

export const MatchRoomStatusSchema = z.enum(['waiting', 'playing', 'finished'])
export const MatchRoomFinishReasonSchema = z.enum(['checkmate', 'stalemate', 'forfeit'])
export const MatchPresenceStatusSchema = z.enum(['online', 'offline', 'none'])
export const MatchRoomCreatorPlayerSchema = z.enum(['white', 'black', 'random'])

export type MatchRoomStatus = z.infer<typeof MatchRoomStatusSchema>
export type MatchRoomFinishReason = z.infer<typeof MatchRoomFinishReasonSchema>
export type MatchPresenceStatus = z.infer<typeof MatchPresenceStatusSchema>
export type MatchRoomCreatorPlayer = z.infer<typeof MatchRoomCreatorPlayerSchema>

const MatchRoomSettingsObjectSchema = z.object({
  canReplay: z.boolean().catch(true),
  creatorPlayer: MatchRoomCreatorPlayerSchema.catch('random'),
  saveRecordToServer: z.boolean().catch(true),
  showOpponentMoves: z.boolean().catch(false),
  showOpponentMoveRange: z.boolean().catch(true),
})

export const MatchRoomSettingsSchema = z.preprocess((value) => {
  if (! value || typeof value !== 'object') return value
  const settings = value as Record<string, unknown>
  if ('canReplay' in settings || ! ('canSpectate' in settings)) return settings
  return {
    ...settings,
    canReplay: settings.canSpectate,
  }
}, MatchRoomSettingsObjectSchema)

export type MatchRoomSettings = z.infer<typeof MatchRoomSettingsSchema>

export const DEFAULT_MATCH_ROOM_SETTINGS: MatchRoomSettings = MatchRoomSettingsSchema.parse({})

export const MatchServerInfoSchema = z.object({
  protocolVersion: z.literal(MATCH_PROTOCOL_VERSION),
  name: z.string(),
})

export type MatchServerInfo = z.infer<typeof MatchServerInfoSchema>

export const MatchRoomSeatSchema = z.object({
  player: PlayerSchema,
  nickname: z.string().nullable(),
  online: z.boolean(),
})

export type MatchRoomSeat = z.infer<typeof MatchRoomSeatSchema>

export const MatchUserSchema = z.object({
  id: z.string(),
  nickname: z.string().nullable(),
})

export type MatchUser = z.infer<typeof MatchUserSchema>

export const MatchSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  roomId: z.string(),
  player: PlayerSchema,
  nickname: z.string().nullable(),
})

export type MatchSession = z.infer<typeof MatchSessionSchema>

export const MatchRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  players: z.number(),
  maxPlayers: z.number(),
  seats: z.tuple([MatchRoomSeatSchema.nullable(), MatchRoomSeatSchema.nullable()]),
  status: MatchRoomStatusSchema,
  winner: NullablePlayerSchema,
  finishReason: MatchRoomFinishReasonSchema.nullable(),
  settings: MatchRoomSettingsSchema,
  private: z.boolean(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  updatedAt: z.number(),
  actionCount: z.number(),
  ownSession: MatchSessionSchema.nullable(),
})

export type MatchRoom = z.infer<typeof MatchRoomSchema>

export const MatchClockSchema = z.object({
  playerTotalsMs: z.tuple([z.number(), z.number()]),
  turnStartedAt: z.number().nullable(),
  currentPlayer: NullablePlayerSchema,
})

export type MatchClock = z.infer<typeof MatchClockSchema>

export const MatchPresenceSchema = z.object({
  self: z.enum(['online', 'offline']),
  opponent: MatchPresenceStatusSchema,
})

export type MatchPresence = z.infer<typeof MatchPresenceSchema>

export const MatchGameStateSchema = z.object({
  room: MatchRoomSchema,
  session: MatchSessionSchema.nullable(),
  presence: MatchPresenceSchema.nullable(),
  actions: z.array(ActionSchema),
  currentPlayer: PlayerSchema,
  clock: MatchClockSchema,
  updatedAt: z.number(),
})

export type MatchGameState = z.infer<typeof MatchGameStateSchema>

export const MatchRoomsResponseSchema = z.object({
  rooms: z.array(MatchRoomSchema),
})

export type MatchRoomsResponse = z.infer<typeof MatchRoomsResponseSchema>

export const MatchRoomsRequestQuerySchema = z.object({
  password: z.string().optional(),
  userId: z.string().optional(),
})

export type MatchRoomsRequestQuery = z.infer<typeof MatchRoomsRequestQuerySchema>

export const CreateMatchRoomRequestSchema = z.object({
  userId: z.string().optional(),
  name: z.string().optional(),
  nickname: z.string().optional(),
  password: z.string().optional(),
  settings: z.custom<Partial<MatchRoomSettings>>().optional(),
}).nullish()

export type CreateMatchRoomRequest = NonNullable<z.infer<typeof CreateMatchRoomRequestSchema>>

export const CreateMatchRoomResponseSchema = z.object({
  user: MatchUserSchema,
  state: MatchGameStateSchema,
})

export type CreateMatchRoomResponse = z.infer<typeof CreateMatchRoomResponseSchema>

export const JoinMatchRoomRequestSchema = z.object({
  userId: z.string().optional(),
  nickname: z.string().optional(),
  password: z.string().optional(),
}).nullish()

export type JoinMatchRoomRequest = NonNullable<z.infer<typeof JoinMatchRoomRequestSchema>>

export const JoinMatchRoomResponseSchema = z.object({
  user: MatchUserSchema,
  state: MatchGameStateSchema,
})

export type JoinMatchRoomResponse = z.infer<typeof JoinMatchRoomResponseSchema>

export const GetMatchSessionResponseSchema = z.object({
  state: MatchGameStateSchema,
})

export type GetMatchSessionResponse = z.infer<typeof GetMatchSessionResponseSchema>

export const GetMatchRoomStateResponseSchema = z.object({
  state: MatchGameStateSchema,
})

export type GetMatchRoomStateResponse = z.infer<typeof GetMatchRoomStateResponseSchema>

export const SubmitMatchActionRequestSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  action: ActionSchema,
})

export type SubmitMatchActionRequest = z.infer<typeof SubmitMatchActionRequestSchema>

export const SubmitMatchActionResponseSchema = z.object({
  state: MatchGameStateSchema,
})

export type SubmitMatchActionResponse = z.infer<typeof SubmitMatchActionResponseSchema>

export const LeaveMatchRoomRequestSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
})

export type LeaveMatchRoomRequest = z.infer<typeof LeaveMatchRoomRequestSchema>

export const LeaveMatchRoomResponseSchema = z.object({
  state: MatchGameStateSchema,
})

export type LeaveMatchRoomResponse = z.infer<typeof LeaveMatchRoomResponseSchema>

export const ForfeitMatchRoomRequestSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
})

export type ForfeitMatchRoomRequest = z.infer<typeof ForfeitMatchRoomRequestSchema>

export const ForfeitMatchRoomResponseSchema = z.object({
  state: MatchGameStateSchema,
})

export type ForfeitMatchRoomResponse = z.infer<typeof ForfeitMatchRoomResponseSchema>

export const MatchRoomStateEventSchema = z.object({
  type: z.literal('state'),
  state: MatchGameStateSchema,
})

export type MatchRoomStateEvent = z.infer<typeof MatchRoomStateEventSchema>

export const MatchPendingActionEventSchema = z.object({
  type: z.literal('pending-action'),
  sessionId: z.string(),
  player: PlayerSchema,
  moves: z.array(MoveSchema),
})

export type MatchPendingActionEvent = z.infer<typeof MatchPendingActionEventSchema>

export const MatchClearPendingActionEventSchema = z.object({
  type: z.literal('clear-pending-action'),
  sessionId: z.string(),
  player: PlayerSchema,
})

export type MatchClearPendingActionEvent = z.infer<typeof MatchClearPendingActionEventSchema>

export const MatchRoomEventSchema = z.discriminatedUnion('type', [
  MatchRoomStateEventSchema,
  MatchPendingActionEventSchema,
  MatchClearPendingActionEventSchema,
])

export type MatchRoomEvent = z.infer<typeof MatchRoomEventSchema>

export const MatchRoomClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pending-action'),
    moves: z.array(MoveSchema),
  }),
  z.object({
    type: z.literal('clear-pending-action'),
  }),
])

export type MatchRoomClientEvent = z.infer<typeof MatchRoomClientEventSchema>

export const MatchErrorResponseSchema = z.object({
  error: z.string(),
})

export type MatchErrorResponse = z.infer<typeof MatchErrorResponseSchema>

export const StoredMatchRoomSettingsSchema = z.object({
  version: z.literal(MATCH_ROOM_SETTINGS_STORAGE_VERSION),
  settings: MatchRoomSettingsSchema,
})

export type StoredMatchRoomSettings = z.infer<typeof StoredMatchRoomSettingsSchema>

export const LegacyStoredMatchRoomSettingsSchema = MatchRoomSettingsObjectSchema.partial()

export const StoredMatchRoomsFileSchema = <RoomSchema extends z.ZodType>(roomSchema: RoomSchema) => (
  z.object({
    version: z.literal(MATCH_STORAGE_VERSION),
    rooms: z.array(roomSchema),
  })
)

export type StoredMatchRoomsFile<Room> = {
  version: typeof MATCH_STORAGE_VERSION
  rooms: Room[]
}

export function parseStoredMatchRoomSettings(value: unknown): StoredMatchRoomSettings {
  const current = StoredMatchRoomSettingsSchema.safeParse(value)
  if (current.success) return current.data

  return {
    version: MATCH_ROOM_SETTINGS_STORAGE_VERSION,
    settings: MatchRoomSettingsSchema.parse(value),
  }
}

export function parseMatchRoomEvent(value: unknown): MatchRoomEvent {
  const data = typeof value === 'string'
    ? JSON.parse(value) as unknown
    : value

  return MatchRoomEventSchema.parse(data)
}
