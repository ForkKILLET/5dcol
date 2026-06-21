import { z } from 'zod'
import type { Action, Coord, Move, Multiverse, Player } from '@5dcol/core'

export const MATCH_PROTOCOL_VERSION = 1
export const MATCH_STORAGE_VERSION = 1
export const MATCH_ROOM_SETTINGS_STORAGE_VERSION = 1
export const STUDY_PROTOCOL_VERSION = 1
export const STUDY_STORAGE_VERSION = 1

const PlayerSchema: z.ZodType<Player> = z.union([z.literal(0), z.literal(1)])
const NullablePlayerSchema = PlayerSchema.nullable()
const ActionSchema = z.custom<Action>()
const MoveSchema = z.custom<Move>()
const MultiverseSchema = z.custom<Multiverse>()
const CoordSchema: z.ZodType<Coord> = z.object({
  l: z.number().int(),
  t: z.number().int(),
  x: z.number().int(),
  y: z.number().int(),
})

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
  private: z.boolean().catch(false),
  saveRecordToServer: z.boolean().catch(true),
  showOpponentMoves: z.boolean().catch(false),
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
  version: z.string().catch(''),
  commitHash: z.string().catch(''),
  buildDate: z.string().catch(''),
})

export type MatchServerInfo = z.infer<typeof MatchServerInfoSchema>

export const MatchServerStatsSchema = z.object({
  roomCount: z.number().int().nonnegative(),
  waitingRoomCount: z.number().int().nonnegative(),
  playingRoomCount: z.number().int().nonnegative(),
  finishedRoomCount: z.number().int().nonnegative(),
  recordedRoomCount: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  onlineSessionCount: z.number().int().nonnegative(),
  connectionCount: z.number().int().nonnegative().catch(0),
  spectatorCount: z.number().int().nonnegative(),
})

export type MatchServerStats = z.infer<typeof MatchServerStatsSchema>

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
  spectatorCount: z.number().int().nonnegative().catch(0),
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

export const GetMatchServerStatsResponseSchema = z.object({
  stats: MatchServerStatsSchema,
})

export type GetMatchServerStatsResponse = z.infer<typeof GetMatchServerStatsResponseSchema>

export const MatchRoomsRequestQuerySchema = z.object({
  userId: z.string().optional(),
})

export type MatchRoomsRequestQuery = z.infer<typeof MatchRoomsRequestQuerySchema>

export const CreateMatchRoomRequestSchema = z.object({
  userId: z.string().optional(),
  name: z.string().optional(),
  nickname: z.string().optional(),
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

export const RecordCursorSchema = z.object({
  recordLineId: z.number().int().nonnegative(),
  recordActionIndex: z.number().int().nonnegative(),
})

export type RecordCursor = z.infer<typeof RecordCursorSchema>

export const StoredRecordLineSchema = z.object({
  id: z.number().int().nonnegative(),
  branchId: z.string().optional(),
  createdAt: z.number().optional(),
  parent: z.object({
    lineId: z.number().int().nonnegative(),
    beforeActionIndex: z.number().int().nonnegative(),
  }).nullable(),
  actions: z.array(ActionSchema),
  actionIds: z.array(z.string()).optional(),
  actionCreatedAts: z.array(z.number()).optional(),
  actionAuthorIds: z.array(z.string().nullable()).optional(),
  branchLineIdsBeforeAction: z.array(z.tuple([
    z.number().int().nonnegative(),
    z.array(z.number().int().nonnegative()),
  ])),
  depth: z.number().int().nonnegative(),
})

export type StoredRecordLine = z.infer<typeof StoredRecordLineSchema>

export const StudyPositionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('head'),
    branchId: z.string(),
  }),
  z.object({
    type: z.literal('after'),
    actionId: z.string(),
  }),
])

export type StudyPosition = z.infer<typeof StudyPositionSchema>

export const RecordAnnotationTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('action'),
    actionId: z.string(),
    position: z.enum(['before', 'after']),
  }),
  z.object({
    type: z.literal('move'),
    actionId: z.string(),
    moveIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('square'),
    branchId: z.string(),
    m: z.number().int(),
    coord: CoordSchema,
  }),
  z.object({
    type: z.literal('arrow'),
    branchId: z.string(),
    from: CoordSchema,
    fromPlayer: PlayerSchema.optional(),
    to: CoordSchema,
    toPlayer: PlayerSchema.optional(),
  }),
  z.object({
    type: z.literal('cursor'),
    lineId: z.number().int().nonnegative(),
    actionIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('line'),
    lineId: z.number().int().nonnegative(),
  }),
])

export type RecordAnnotationTarget = z.infer<typeof RecordAnnotationTargetSchema>

export const RecordActionAnnotationTargetSchema = z.object({
  type: z.literal('action'),
  actionId: z.string(),
  position: z.enum(['before', 'after']),
})

export type RecordActionAnnotationTarget = z.infer<typeof RecordActionAnnotationTargetSchema>

export const RecordMoveAnnotationTargetSchema = z.object({
  type: z.literal('move'),
  actionId: z.string(),
  moveIndex: z.number().int().nonnegative(),
})

export type RecordMoveAnnotationTarget = z.infer<typeof RecordMoveAnnotationTargetSchema>

export const StoredRecordAnnotationSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('comment'),
    target: RecordActionAnnotationTargetSchema,
    authorId: z.string().optional(),
    text: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('glyph'),
    target: RecordMoveAnnotationTargetSchema,
    authorId: z.string().optional(),
    glyph: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('marker'),
    target: RecordAnnotationTargetSchema,
    authorId: z.string(),
    color: z.string().optional(),
    label: z.string().optional(),
  }),
])

export type StoredRecordAnnotation = z.infer<typeof StoredRecordAnnotationSchema>

export const StudyActionNodeSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  action: ActionSchema,
  authorId: z.string().optional(),
  createdAt: z.number(),
})

export type StudyActionNode = z.infer<typeof StudyActionNodeSchema>

export const StudyBranchSchema = z.object({
  id: z.string(),
  parent: StudyPositionSchema.nullable(),
  actionIds: z.array(z.string()),
  createdAt: z.number(),
})

export type StudyBranch = z.infer<typeof StudyBranchSchema>

export const StudyDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  initialMultiverse: MultiverseSchema,
  rootBranchId: z.string(),
  branches: z.array(StudyBranchSchema),
  actions: z.array(StudyActionNodeSchema),
  annotations: z.array(StoredRecordAnnotationSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type StudyDocument = z.infer<typeof StudyDocumentSchema>

export const RoomKindSchema = z.enum(['match', 'study'])
export const StudyRoomVisibilitySchema = z.enum(['public', 'private'])
export const StudyMemberRoleSchema = z.enum(['owner', 'moderator', 'editor', 'viewer'])
export const StudyFollowModeSchema = z.enum(['free', 'following', 'broadcast'])

export type RoomKind = z.infer<typeof RoomKindSchema>
export type StudyRoomVisibility = z.infer<typeof StudyRoomVisibilitySchema>
export type StudyMemberRole = z.infer<typeof StudyMemberRoleSchema>
export type StudyFollowMode = z.infer<typeof StudyFollowModeSchema>

export const StudyMemberSchema = z.object({
  userId: z.string(),
  nickname: z.string().nullable(),
  role: StudyMemberRoleSchema,
  color: z.string().optional(),
  joinedAt: z.number(),
})

export type StudyMember = z.infer<typeof StudyMemberSchema>

export const StudyPresenceSchema = z.object({
  userId: z.string(),
  nickname: z.string().nullable(),
  cursor: StudyPositionSchema,
  mode: StudyFollowModeSchema,
  followingUserId: z.string().optional(),
  updatedAt: z.number(),
})

export type StudyPresence = z.infer<typeof StudyPresenceSchema>

export const StudyRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  visibility: StudyRoomVisibilitySchema,
  document: StudyDocumentSchema,
  members: z.array(StudyMemberSchema),
  version: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type StudyRoom = z.infer<typeof StudyRoomSchema>

export const ChatMessageSchema = z.object({
  id: z.string(),
  roomKind: RoomKindSchema,
  roomId: z.string(),
  userId: z.string(),
  nickname: z.string().nullable(),
  text: z.string(),
  createdAt: z.number(),
})

export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const StudyPatchSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('append-action'),
    branchId: z.string(),
    position: StudyPositionSchema,
    action: StudyActionNodeSchema,
  }),
  z.object({
    type: z.literal('create-branch'),
    branch: StudyBranchSchema,
    actions: z.array(StudyActionNodeSchema),
  }),
  z.object({
    type: z.literal('remove-future'),
    position: StudyPositionSchema,
    removedActionIds: z.array(z.string()),
    removedBranchIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal('upsert-annotation'),
    annotation: StoredRecordAnnotationSchema,
  }),
  z.object({
    type: z.literal('delete-annotation'),
    annotationId: z.string(),
  }),
  z.object({
    type: z.literal('update-title'),
    title: z.string(),
  }),
  z.object({
    type: z.literal('update-visibility'),
    visibility: StudyRoomVisibilitySchema,
  }),
])

export type StudyPatch = z.infer<typeof StudyPatchSchema>

export const StudyCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('submit-action'),
    position: StudyPositionSchema,
    action: ActionSchema,
  }),
  z.object({
    type: z.literal('remove-future'),
    position: StudyPositionSchema,
  }),
  z.object({
    type: z.literal('upsert-annotation'),
    annotation: StoredRecordAnnotationSchema,
  }),
  z.object({
    type: z.literal('delete-annotation'),
    annotationId: z.string(),
  }),
  z.object({
    type: z.literal('update-title'),
    title: z.string(),
  }),
  z.object({
    type: z.literal('update-visibility'),
    visibility: StudyRoomVisibilitySchema,
  }),
])

export type StudyCommand = z.infer<typeof StudyCommandSchema>

export const CreateStudyRoomRequestSchema = z.object({
  userId: z.string().optional(),
  name: z.string().optional(),
  nickname: z.string().optional(),
  document: StudyDocumentSchema.optional(),
  visibility: StudyRoomVisibilitySchema.optional().default('private'),
}).nullish()

export type CreateStudyRoomRequest = NonNullable<z.input<typeof CreateStudyRoomRequestSchema>>
export type ParsedCreateStudyRoomRequest = NonNullable<z.output<typeof CreateStudyRoomRequestSchema>>

export const CreateStudyRoomResponseSchema = z.object({
  user: MatchUserSchema,
  room: StudyRoomSchema,
})

export type CreateStudyRoomResponse = z.infer<typeof CreateStudyRoomResponseSchema>

export const StudyRoomsRequestQuerySchema = z.object({
  userId: z.string().optional(),
})

export type StudyRoomsRequestQuery = z.infer<typeof StudyRoomsRequestQuerySchema>

export const StudyRoomsResponseSchema = z.object({
  rooms: z.array(StudyRoomSchema),
})

export type StudyRoomsResponse = z.infer<typeof StudyRoomsResponseSchema>

export const GetStudyRoomStateResponseSchema = z.object({
  room: StudyRoomSchema,
  presence: z.array(StudyPresenceSchema),
  chat: z.array(ChatMessageSchema),
})

export type GetStudyRoomStateResponse = z.infer<typeof GetStudyRoomStateResponseSchema>

export const JoinStudyRoomRequestSchema = z.object({
  userId: z.string().optional(),
  nickname: z.string().optional(),
}).nullish()

export type JoinStudyRoomRequest = NonNullable<z.infer<typeof JoinStudyRoomRequestSchema>>

export const JoinStudyRoomResponseSchema = z.object({
  user: MatchUserSchema,
  room: StudyRoomSchema,
})

export type JoinStudyRoomResponse = z.infer<typeof JoinStudyRoomResponseSchema>

export const StudyDocumentPatchRequestSchema = z.object({
  userId: z.string(),
  baseVersion: z.number().int().nonnegative(),
  command: StudyCommandSchema,
})

export type StudyDocumentPatchRequest = z.infer<typeof StudyDocumentPatchRequestSchema>

export const StudyStateEventSchema = z.object({
  type: z.literal('study-state'),
  room: StudyRoomSchema,
  presence: z.array(StudyPresenceSchema),
  chat: z.array(ChatMessageSchema),
})

export type StudyStateEvent = z.infer<typeof StudyStateEventSchema>

export const StudyPatchEventSchema = z.object({
  type: z.literal('study-patch'),
  version: z.number().int().nonnegative(),
  patch: StudyPatchSchema,
})

export type StudyPatchEvent = z.infer<typeof StudyPatchEventSchema>

export const StudyCommandRejectedEventSchema = z.object({
  type: z.literal('command-rejected'),
  reason: z.enum(['permission-denied', 'target-not-found', 'conflict', 'unsupported']),
  currentVersion: z.number().int().nonnegative(),
})

export type StudyCommandRejectedEvent = z.infer<typeof StudyCommandRejectedEventSchema>

export const StudyPresenceEventSchema = z.object({
  type: z.literal('presence'),
  presence: StudyPresenceSchema,
})

export type StudyPresenceEvent = z.infer<typeof StudyPresenceEventSchema>

export const ChatMessageEventSchema = z.object({
  type: z.literal('chat-message'),
  message: ChatMessageSchema,
})

export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>

export const StudyRoomEventSchema = z.discriminatedUnion('type', [
  StudyStateEventSchema,
  StudyPatchEventSchema,
  StudyCommandRejectedEventSchema,
  StudyPresenceEventSchema,
  ChatMessageEventSchema,
])

export type StudyRoomEvent = z.infer<typeof StudyRoomEventSchema>

export const StudyRoomClientEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('command'),
    baseVersion: z.number().int().nonnegative(),
    command: StudyCommandSchema,
  }),
  z.object({
    type: z.literal('presence'),
    cursor: StudyPositionSchema,
    mode: StudyFollowModeSchema,
    followingUserId: z.string().optional(),
  }),
  z.object({
    type: z.literal('chat-message'),
    text: z.string(),
  }),
])

export type StudyRoomClientEvent = z.infer<typeof StudyRoomClientEventSchema>

export const StoredStudyRoomsFileSchema = z.object({
  version: z.literal(STUDY_STORAGE_VERSION),
  rooms: z.array(StudyRoomSchema),
  chatMessages: z.array(ChatMessageSchema),
})

export type StoredStudyRoomsFile = z.infer<typeof StoredStudyRoomsFileSchema>

export function parseStudyRoomEvent(value: unknown): StudyRoomEvent {
  const data = typeof value === 'string'
    ? JSON.parse(value) as unknown
    : value

  return StudyRoomEventSchema.parse(data)
}
