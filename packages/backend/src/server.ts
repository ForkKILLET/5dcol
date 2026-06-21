import { randomUUID } from 'node:crypto'

import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyReply } from 'fastify'
import { Action, GameState, Multiverse, Player } from '@5dcol/core'

import {
  CreateStudyRoomRequestSchema,
  ChatMessageSchema,
  MATCH_PROTOCOL_VERSION,
  MatchRoomClientEventSchema,
  MatchRoomSettingsSchema,
  CreateMatchRoomRequestSchema,
  JoinMatchRoomRequestSchema,
  LeaveMatchRoomRequestSchema,
  ForfeitMatchRoomRequestSchema,
  JoinStudyRoomRequestSchema,
  StudyRoomClientEventSchema,
  StudyRoomSchema,
  SubmitMatchActionRequestSchema,
  type ChatMessage,
  type CreateMatchRoomRequest,
  type CreateMatchRoomResponse,
  type CreateStudyRoomRequest,
  type CreateStudyRoomResponse,
  type ForfeitMatchRoomRequest,
  type ForfeitMatchRoomResponse,
  type GetMatchServerStatsResponse,
  type GetMatchRoomStateResponse,
  type GetMatchSessionResponse,
  type GetStudyRoomStateResponse,
  type JoinMatchRoomResponse,
  type JoinMatchRoomRequest,
  type JoinStudyRoomRequest,
  type JoinStudyRoomResponse,
  type LeaveMatchRoomRequest,
  type LeaveMatchRoomResponse,
  type MatchErrorResponse,
  type MatchGameState,
  type MatchClock,
  type MatchClearPendingActionEvent,
  type MatchPendingActionEvent,
  type MatchRoom,
  type MatchRoomClientEvent,
  type MatchRoomCreatorPlayer,
  type MatchRoomFinishReason,
  type MatchRoomSettings,
  type MatchRoomsRequestQuery,
  type MatchRoomStateEvent,
  type MatchRoomsResponse,
  type MatchServerInfo,
  type MatchSession,
  type MatchUser,
  type ParsedCreateStudyRoomRequest,
  type StudyCommand,
  type StudyActionNode,
  type StudyBranch,
  type StudyDocument,
  type StudyPatch,
  type StudyPresence,
  type StudyPosition,
  type StudyRoomClientEvent,
  type StudyRoomEvent,
  type StudyRoomsRequestQuery,
  type StudyRoomsResponse,
  type StudyRoom,
  type SubmitMatchActionRequest,
  type SubmitMatchActionResponse,
} from '@5dcol/shared/protocol'
import { createRoomStorage, type UserState } from './storage.ts'

export interface BackendServerOptions {
  port: number
  host?: string
  name?: string
}

export interface SessionState extends MatchSession {
  lastSeenAt: number
}

export interface RoomState {
  id: string
  name: string
  maxPlayers: number
  sessions: SessionState[]
  actions: Action[]
  winner: Player | null
  finishReason: MatchRoomFinishReason | null
  settings: MatchRoomSettings
  clock: RoomClockState
  createdAt: number
  startedAt: number | null
  updatedAt: number
}

export interface RoomClockState {
  playerTotalsMs: [number, number]
  turnStartedAt: number | null
}

interface RoomSubscriber {
  sessionId: string | null
  socket: WebSocketLike
}

interface StudySubscriber {
  userId: string
  socket: WebSocketLike
}

interface WebSocketLike {
  send(data: string): void
  close(): void
  on(event: 'close', listener: () => void): void
  on(event: 'message', listener: (data: unknown) => void): void
}

const DEFAULT_SERVER_NAME = 'Debug Server'
const FINISHED_ROOM_HISTORY_MS = 24 * 60 * 60 * 1000
const FINISHED_ROOM_HISTORY_LIMIT = 10
const STUDY_CHAT_HISTORY_LIMIT = 100
const STUDY_CHAT_MESSAGE_MAX_LENGTH = 1200

export function createBackendServer(options: BackendServerOptions) {
  const storage = createRoomStorage()
  const storageState = storage.loadState()
  const rooms: RoomState[] = storageState.rooms
  const studyRooms = storageState.studyRooms ?? []
  const chatMessages = storageState.chatMessages ?? []
  const users: UserState[] = storageState.users
  const roomSubscribers = new Map<string, Set<RoomSubscriber>>()
  const studySubscribers = new Map<string, Set<StudySubscriber>>()
  const studyPresence = new Map<string, Map<string, StudyPresence>>()
  const onlineSessionCounts = new Map<string, number>()
  const app = Fastify()
  const saveAll = () => storage.saveState({ rooms, studyRooms, chatMessages, users })

  void app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
  void app.register(websocket)

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof Error && err.name === 'ZodError') {
      reply.code(400).send({ error: 'Invalid request' } satisfies MatchErrorResponse)
      return
    }
    console.error(err)
    reply.code(500).send({ error: 'Internal server error' } satisfies MatchErrorResponse)
  })

  app.get('/health', async (): Promise<MatchServerInfo> => ({
    protocolVersion: MATCH_PROTOCOL_VERSION,
    name: options.name ?? DEFAULT_SERVER_NAME,
    version: __5DCOL_VERSION__,
    commitHash: __5DCOL_COMMIT_HASH__,
    buildDate: __5DCOL_BUILD_DATE__,
  }))

  app.get('/stats', async (): Promise<GetMatchServerStatsResponse> => ({
    stats: getServerStats(rooms, users, roomSubscribers, onlineSessionCounts),
  }))

  app.get<{ Querystring: MatchRoomsRequestQuery }>('/rooms', async (request): Promise<MatchRoomsResponse> => ({
    rooms: getListedRooms(rooms, request.query.userId, onlineSessionCounts),
  }))

  app.post<{ Body: CreateMatchRoomRequest }>('/rooms', async (request, reply): Promise<CreateMatchRoomResponse> => {
    const body = CreateMatchRoomRequestSchema.parse(request.body) ?? {}
    const settings = MatchRoomSettingsSchema.parse(body.settings)
    const room: RoomState = {
      id: randomUUID(),
      name: body?.name?.trim() || `Room ${rooms.length + 1}`,
      maxPlayers: 2,
      sessions: [],
      actions: [],
      winner: null,
      finishReason: null,
      settings,
      clock: createInitialClock(),
      createdAt: Date.now(),
      startedAt: null,
      updatedAt: Date.now(),
    }
    rooms.push(room)
    const user = getOrCreateUser(users, body.userId, body?.nickname)
    const session = createSession(room, user, getCreatorPlayer(settings.creatorPlayer), body?.nickname)
    saveAll()
    reply.code(201)
    return {
      user: toUserView(user),
      state: toGameStateView(room, session, onlineSessionCounts, {
        spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
      }),
    }
  })

  app.get<{ Params: { sessionId: string }, Querystring: { userId?: string } }>(
    '/sessions/:sessionId',
    async (request, reply): Promise<GetMatchSessionResponse | MatchErrorResponse> => {
      const user = findUser(users, request.query.userId)
      if (! user) return sendError(reply, 403, 'Invalid user')
      const sessionLookup = findSession(rooms, request.params.sessionId, user.id)
      if (! sessionLookup) return sendError(reply, 404, 'Session not found')
      return {
        state: toGameStateView(sessionLookup.room, sessionLookup.session, onlineSessionCounts, {
          spectatorCount: getRoomSpectatorCount(roomSubscribers, sessionLookup.room),
        }),
      }
    },
  )

  app.get<{ Params: { id: string }, Querystring: { sessionId?: string, userId?: string } }>(
    '/rooms/:id/state',
    async (request, reply): Promise<GetMatchRoomStateResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')
      const session = request.query.sessionId && request.query.userId
        ? room.sessions.find(session => session.id === request.query.sessionId && session.userId === request.query.userId) ?? null
        : null
      if (request.query.sessionId && ! session) return sendError(reply, 403, 'Invalid session')
      if (! session && ! canViewRoom(room)) {
        return sendError(reply, 403, 'Room is not viewable')
      }
      return {
        state: toGameStateView(room, session, onlineSessionCounts, {
          userId: request.query.userId,
          spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
        }),
      }
    },
  )

  void app.register(async routeApp => {
    routeApp.get<{ Params: { id: string }, Querystring: { sessionId?: string, userId?: string } }>(
      '/rooms/:id/events',
      { websocket: true },
      (socket, request) => {
        const room = rooms.find(room => room.id === request.params.id)
        if (! room) {
          socket.close()
          return
        }

        const session = request.query.sessionId && request.query.userId
          ? room.sessions.find(session => session.id === request.query.sessionId && session.userId === request.query.userId) ?? null
          : null
        if (request.query.sessionId && ! session) {
          socket.close()
          return
        }
        if (! session && ! canSubscribeRoom(room)) {
          socket.close()
          return
        }
        subscribeRoomState(
          socket,
          roomSubscribers,
          onlineSessionCounts,
          rooms,
          () => saveAll(),
          room,
          session,
        )
      },
    )

    routeApp.get<{ Params: { id: string }, Querystring: { userId?: string, nickname?: string } }>(
      '/studies/:id/events',
      { websocket: true },
      (socket, request) => {
        const room = studyRooms.find(room => room.id === request.params.id)
        const user = findUser(users, request.query.userId)
        if (! room || ! user) {
          socket.close()
          return
        }

        addStudyMember(room, user, request.query.nickname)
        saveAll()
        subscribeStudyRoomState({
          socket,
          studySubscribers,
          studyPresence,
          chatMessages,
          room,
          user,
          saveAll,
        })
      },
    )
  })

  app.post<{ Params: { id: string }, Body: JoinMatchRoomRequest }>(
    '/rooms/:id/join',
    async (request, reply): Promise<JoinMatchRoomResponse | MatchErrorResponse> => {
      const body = JoinMatchRoomRequestSchema.parse(request.body) ?? {}
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')
      if (toRoomView(room).status !== 'waiting') return sendError(reply, 409, 'Room is not joinable')

      const player = getAvailablePlayer(room)
      if (player === null) return sendError(reply, 409, 'Room is full')

      const user = getOrCreateUser(users, body.userId, body.nickname)
      const session = createSession(room, user, player, body.nickname)
      saveAll()
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        user: toUserView(user),
        state: toGameStateView(room, session, onlineSessionCounts, {
          spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
        }),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: LeaveMatchRoomRequest }>(
    '/rooms/:id/leave',
    async (request, reply): Promise<LeaveMatchRoomResponse | MatchErrorResponse> => {
      const body = LeaveMatchRoomRequestSchema.parse(request.body)
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === body.sessionId && session.userId === body.userId)
      if (! session) return sendError(reply, 403, 'Invalid session')
      if (toRoomView(room).status === 'playing') return sendError(reply, 409, 'Use forfeit to leave a playing room')

      leaveRoom(room, session)
      onlineSessionCounts.delete(session.id)
      pruneUnrecordedRooms(rooms)
      saveAll()
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, null, onlineSessionCounts, {
          spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
        }),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: ForfeitMatchRoomRequest }>(
    '/rooms/:id/forfeit',
    async (request, reply): Promise<ForfeitMatchRoomResponse | MatchErrorResponse> => {
      const body = ForfeitMatchRoomRequestSchema.parse(request.body)
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === body.sessionId && session.userId === body.userId)
      if (! session) return sendError(reply, 403, 'Invalid session')

      forfeitRoom(room, session)
      saveAll()
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts, {
          spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
        }),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: SubmitMatchActionRequest }>(
    '/rooms/:id/actions',
    async (request, reply): Promise<SubmitMatchActionResponse | MatchErrorResponse> => {
      const body = SubmitMatchActionRequestSchema.parse(request.body)
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === body.sessionId && session.userId === body.userId)
      if (! session) return sendError(reply, 403, 'Invalid session')
      if (toRoomView(room).status !== 'playing') return sendError(reply, 409, 'Room is not ready')

      const state = GameState.create(room.actions)
      if (state.player !== session.player) return sendError(reply, 409, 'Not your turn')

      let nextState: GameState
      const action = sanitizeAction(body.action)
      try {
        // This replays the full authoritative action list and validates every move
        // in the submitted action against core rules before mutating room state.
        nextState = GameState.create([...room.actions, action])
      }
      catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Illegal action')
      }

      const now = Date.now()
      room.actions.push(applyClockToAction(room, action, session.player, now))
      finishRoomIfGameEnded(room, nextState, session.player)
      if (room.finishReason === null) room.clock.turnStartedAt = now
      else room.clock.turnStartedAt = null
      room.updatedAt = now
      saveAll()
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts, {
          spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
        }),
      }
    },
  )

  app.get<{ Querystring: StudyRoomsRequestQuery }>('/studies', async (request): Promise<StudyRoomsResponse> => ({
    rooms: getListedStudyRooms(studyRooms, request.query.userId),
  }))

  app.post<{ Body: CreateStudyRoomRequest }>('/studies', async (request, reply): Promise<CreateStudyRoomResponse> => {
    const body = CreateStudyRoomRequestSchema.parse(request.body ?? {}) as ParsedCreateStudyRoomRequest
    const user = getOrCreateUser(users, body.userId, body.nickname)
    const now = Date.now()
    const roomId = randomUUID()
    const name = body.name?.trim() || getDefaultStudyRoomName(roomId)
    const document = createStudyDocument({
      document: body.document,
      id: randomUUID(),
      title: name,
      now,
    })
    const room = StudyRoomSchema.parse({
      id: roomId,
      name,
      ownerUserId: user.id,
      visibility: body.visibility,
      document,
      members: [{
        userId: user.id,
        nickname: user.nickname,
        role: 'owner',
        joinedAt: now,
      }],
      version: 0,
      createdAt: now,
      updatedAt: now,
    })
    studyRooms.push(room)
    saveAll()
    reply.code(201)
    return {
      user: toUserView(user),
      room,
    }
  })

  app.get<{ Params: { id: string } }>(
    '/studies/:id/state',
    async (request, reply): Promise<GetStudyRoomStateResponse | MatchErrorResponse> => {
      const room = studyRooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Study not found')
      return {
        room,
        presence: [],
        chat: getStudyChatMessages(chatMessages, room.id),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: JoinStudyRoomRequest }>(
    '/studies/:id/join',
    async (request, reply): Promise<JoinStudyRoomResponse | MatchErrorResponse> => {
      const body = JoinStudyRoomRequestSchema.parse(request.body) ?? {}
      const room = studyRooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Study not found')

      const user = getOrCreateUser(users, body.userId, body.nickname)
      addStudyMember(room, user, body.nickname)
      saveAll()
      return {
        user: toUserView(user),
        room,
      }
    },
  )

  return {
    listen() {
      void app.listen({ port: options.port, host: options.host }).then(() => {
        const host = options.host ?? 'localhost'
        console.log(`${options.name ?? DEFAULT_SERVER_NAME} listening on http://${host}:${options.port}`)
      })
    },
    close() {
      for (const subscribers of roomSubscribers.values()) {
        for (const subscriber of subscribers) {
          subscriber.socket.close()
        }
      }
      for (const subscribers of studySubscribers.values()) {
        for (const subscriber of subscribers) {
          subscriber.socket.close()
        }
      }
      roomSubscribers.clear()
      studySubscribers.clear()
      studyPresence.clear()
      void app.close()
    },
  }
}

function getDefaultStudyRoomName(roomId: string) {
  return roomId.split('-')[0] || roomId.slice(0, 8)
}

function createStudyDocument({
  document,
  id,
  title,
  now,
}: {
  document?: StudyDocument
  id: string
  title: string
  now: number
}): StudyDocument {
  if (document) {
    return {
      ...document,
      title: document.title.trim() || title,
      updatedAt: now,
    }
  }

  return {
    id,
    title,
    initialMultiverse: Multiverse.createInitial(),
    rootBranchId: 'branch:0',
    branches: [{
      id: 'branch:0',
      parent: null,
      actionIds: [],
      createdAt: now,
    }],
    actions: [],
    annotations: [],
    createdAt: now,
    updatedAt: now,
  }
}

function getListedStudyRooms(rooms: StudyRoom[], userId: string | null | undefined): StudyRoom[] {
  const ownUserId = userId ?? null
  return rooms
    .filter(room => room.visibility === 'public' || isStudyMember(room, ownUserId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function isStudyMember(room: StudyRoom, userId: string | null): boolean {
  return userId !== null && room.members.some(member => member.userId === userId)
}

function addStudyMember(room: StudyRoom, user: UserState, nickname: string | null | undefined) {
  const normalizedNickname = normalizeNickname(nickname) ?? user.nickname
  const now = Date.now()
  const existing = room.members.find(member => member.userId === user.id)
  user.nickname = normalizedNickname
  user.updatedAt = now
  if (existing) {
    existing.nickname = normalizedNickname
    room.updatedAt = now
    return
  }

  room.members.push({
    userId: user.id,
    nickname: normalizedNickname,
    role: room.ownerUserId === user.id ? 'owner' : 'editor',
    joinedAt: now,
  })
  room.updatedAt = now
}

function getStudyChatMessages(messages: ChatMessage[], roomId: string): ChatMessage[] {
  return messages
    .filter(message => message.roomKind === 'study' && message.roomId === roomId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-STUDY_CHAT_HISTORY_LIMIT)
}

function leaveRoom(room: RoomState, session: SessionState) {
  room.sessions = room.sessions.filter(current => current.id !== session.id)
  room.updatedAt = Date.now()
}

function forfeitRoom(room: RoomState, session: SessionState) {
  if (toRoomView(room).status !== 'finished') {
    room.winner = getOpponentPlayer(session.player)
    room.finishReason = 'forfeit'
    room.clock.turnStartedAt = null
  }
  session.lastSeenAt = 0
  room.updatedAt = Date.now()
}

function createSession(
  room: RoomState,
  user: UserState,
  player: Player,
  nickname: string | null | undefined,
): SessionState {
  const normalizedNickname = normalizeNickname(nickname) ?? user.nickname
  const session = {
    id: randomUUID(),
    userId: user.id,
    roomId: room.id,
    player,
    nickname: normalizedNickname,
    lastSeenAt: Date.now(),
  }
  user.nickname = normalizedNickname
  user.updatedAt = session.lastSeenAt
  room.sessions.push(session)
  if (room.startedAt === null && room.sessions.length >= room.maxPlayers) {
    const now = Date.now()
    room.startedAt = now
    room.clock.turnStartedAt = now
  }
  room.updatedAt = Date.now()
  return session
}

function getOrCreateUser(users: UserState[], userId: string | null | undefined, nickname: string | null | undefined): UserState {
  const normalizedNickname = normalizeNickname(nickname)
  const existing = findUser(users, userId)
  if (existing) {
    if (normalizedNickname) existing.nickname = normalizedNickname
    existing.updatedAt = Date.now()
    return existing
  }

  const now = Date.now()
  const user: UserState = {
    id: randomUUID(),
    nickname: normalizedNickname,
    createdAt: now,
    updatedAt: now,
  }
  users.push(user)
  return user
}

function findUser(users: UserState[], userId: string | null | undefined): UserState | null {
  if (! userId) return null
  return users.find(user => user.id === userId) ?? null
}

function toUserView(user: UserState): MatchUser {
  return {
    id: user.id,
    nickname: user.nickname,
  }
}

function createInitialClock(): RoomClockState {
  return {
    playerTotalsMs: [0, 0],
    turnStartedAt: null,
  }
}

function sanitizeAction(action: Action): Action {
  return {
    moves: action.moves,
  }
}

function applyClockToAction(room: RoomState, action: Action, player: Player, now: number): Action {
  const elapsedMs = Math.max(0, now - (room.clock.turnStartedAt ?? room.startedAt ?? now))
  room.clock.playerTotalsMs[player] += elapsedMs
  return {
    ...action,
    clock: {
      elapsedMs,
      totalMs: room.clock.playerTotalsMs[player],
    },
  }
}

function normalizeNickname(nickname: string | null | undefined): string | null {
  const trimmed = nickname?.trim()
  return trimmed ? trimmed.slice(0, 32) : null
}

function canViewRoom(room: RoomState): boolean {
  const status = getRoomStatus(room)
  if (status === 'waiting') return true
  if (! room.settings.canReplay) return false
  if (status === 'playing') return true
  return status === 'finished'
    && room.settings.saveRecordToServer
    && room.actions.length > 0
}

function canSubscribeRoom(room: RoomState): boolean {
  const status = getRoomStatus(room)
  if (! room.settings.canReplay) return false
  if (status === 'playing') return true
  return status === 'finished'
    && room.settings.saveRecordToServer
    && room.actions.length > 0
}

function getCreatorPlayer(setting: MatchRoomCreatorPlayer): Player {
  switch (setting) {
    case 'black':
      return Player.B
    case 'random':
      return Math.random() < 0.5 ? Player.W : Player.B
    case 'white':
      return Player.W
  }
}

function getAvailablePlayer(room: RoomState): Player | null {
  const used = new Set(room.sessions.map(session => session.player))
  if (! used.has(Player.W)) return Player.W
  if (! used.has(Player.B)) return Player.B
  return null
}

function getOpponentPlayer(player: Player): Player {
  return player === Player.W ? Player.B : Player.W
}

function findSession(
  rooms: RoomState[],
  sessionId: string,
  userId: string,
): { room: RoomState, session: SessionState } | null {
  for (const room of rooms) {
    const session = room.sessions.find(session => session.id === sessionId && session.userId === userId)
    if (session) return { room, session }
  }
  return null
}

function toRoomView(
  room: RoomState,
  userId: string | null = null,
  onlineSessionCounts = new Map<string, number>(),
): MatchRoom {
  const players = room.sessions.length
  return {
    id: room.id,
    name: room.name,
    players,
    maxPlayers: room.maxPlayers,
    seats: getRoomSeats(room, onlineSessionCounts),
    status: getRoomStatus(room),
    winner: room.winner,
    finishReason: room.finishReason,
    settings: room.settings,
    private: room.settings.private,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    updatedAt: room.updatedAt,
    actionCount: room.actions.length,
    ownSession: userId
      ? room.sessions.find(session => session.userId === userId) ?? null
      : null,
  }
}

function getRoomSeats(room: RoomState, onlineSessionCounts: Map<string, number>): MatchRoom['seats'] {
  const white = room.sessions.find(session => session.player === Player.W) ?? null
  const black = room.sessions.find(session => session.player === Player.B) ?? null
  return [
    white ? { player: white.player, nickname: white.nickname, online: isSessionOnline(white, onlineSessionCounts) } : null,
    black ? { player: black.player, nickname: black.nickname, online: isSessionOnline(black, onlineSessionCounts) } : null,
  ]
}

function getListedRooms(
  rooms: RoomState[],
  userId: string | null | undefined,
  onlineSessionCounts: Map<string, number>,
): MatchRoom[] {
  const now = Date.now()
  const ownUserId = userId ?? null
  const activeRooms = rooms
    .filter(room => canListRoom(room, ownUserId))
    .filter(room => getRoomStatus(room) !== 'finished')
    .map(room => toRoomView(room, ownUserId, onlineSessionCounts))
  const finishedRooms = rooms
    .filter(room => canListRoom(room, ownUserId))
    .filter(room => getRoomStatus(room) === 'finished')
    .filter(room => room.actions.length > 0)
    .filter(room => room.settings.saveRecordToServer)
    .filter(room => now - room.updatedAt <= FINISHED_ROOM_HISTORY_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, FINISHED_ROOM_HISTORY_LIMIT)
    .map(room => toRoomView(room, ownUserId, onlineSessionCounts))

  return [...activeRooms, ...finishedRooms]
}

function getServerStats(
  rooms: RoomState[],
  users: UserState[],
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  onlineSessionCounts: Map<string, number>,
): GetMatchServerStatsResponse['stats'] {
  const roomViews = rooms.map(getRoomStatus)
  return {
    roomCount: rooms.length,
    waitingRoomCount: roomViews.filter(status => status === 'waiting').length,
    playingRoomCount: roomViews.filter(status => status === 'playing').length,
    finishedRoomCount: roomViews.filter(status => status === 'finished').length,
    recordedRoomCount: rooms.filter(room => room.actions.length > 0).length,
    actionCount: rooms.reduce((count, room) => count + room.actions.length, 0),
    userCount: users.length,
    onlineSessionCount: Array.from(onlineSessionCounts.values()).filter(count => count > 0).length,
    connectionCount: Array.from(roomSubscribers.values()).reduce((count, subscribers) => count + subscribers.size, 0),
    spectatorCount: Array.from(roomSubscribers.values()).reduce(
      (count, subscribers) => count + Array.from(subscribers).filter(subscriber => subscriber.sessionId === null).length,
      0,
    ),
  }
}

function canListRoom(room: RoomState, userId: string | null): boolean {
  return ! room.settings.private
    || (userId !== null && room.sessions.some(session => session.userId === userId))
}

function pruneUnrecordedRooms(rooms: RoomState[]) {
  for (let i = rooms.length - 1; i >= 0; i -= 1) {
    const room = rooms[i]!
    if (room.id === 'debug-room') continue
    if (room.sessions.length === 0 && room.actions.length === 0) {
      rooms.splice(i, 1)
    }
  }
}

function getRoomStatus(room: RoomState): MatchRoom['status'] {
  if (room.finishReason !== null) return 'finished'
  return room.sessions.length >= room.maxPlayers ? 'playing' : 'waiting'
}

function toGameStateView(
  room: RoomState,
  session: MatchSession | null,
  onlineSessionCounts: Map<string, number>,
  options: {
    userId?: string | null
    spectatorCount?: number
  } = {},
): MatchGameState {
  const state = GameState.create(room.actions)
  const viewUserId = session?.userId ?? options.userId ?? null
  return {
    room: toRoomView(room, viewUserId, onlineSessionCounts),
    session,
    presence: getMatchPresence(room, session, onlineSessionCounts),
    spectatorCount: options.spectatorCount ?? 0,
    actions: room.actions,
    currentPlayer: state.player,
    clock: getClockView(room, state),
    updatedAt: room.updatedAt,
  }
}

function getClockView(room: RoomState, state: GameState): MatchClock {
  return {
    playerTotalsMs: [...room.clock.playerTotalsMs],
    turnStartedAt: room.clock.turnStartedAt,
    currentPlayer: getRoomStatus(room) === 'playing' ? state.player : null,
  }
}

function getMatchPresence(
  room: RoomState,
  session: MatchSession | null,
  onlineSessionCounts: Map<string, number>,
): MatchGameState['presence'] {
  if (! session) return null

  const self = room.sessions.find(current => current.id === session.id)
  const opponent = room.sessions.find(current => current.player !== session.player)

  return {
    self: self && isSessionOnline(self, onlineSessionCounts) ? 'online' : 'offline',
    opponent: opponent
      ? (isSessionOnline(opponent, onlineSessionCounts) ? 'online' : 'offline')
      : 'none',
  }
}

function isSessionOnline(session: SessionState, onlineSessionCounts: Map<string, number>) {
  return (onlineSessionCounts.get(session.id) ?? 0) > 0
}

function finishRoomIfGameEnded(room: RoomState, state: GameState, actingPlayer: Player) {
  const status = GameState.getCheckmateStatus(state)
  if (status === 'not-checkmate') return

  room.winner = status === 'checkmate' ? actingPlayer : null
  room.finishReason = status
  room.clock.turnStartedAt = null
}

function subscribeRoomState(
  socket: WebSocketLike,
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  onlineSessionCounts: Map<string, number>,
  rooms: RoomState[],
  saveRooms: (rooms: RoomState[]) => void,
  room: RoomState,
  session: SessionState | null,
) {
  const subscriber: RoomSubscriber = {
    sessionId: session?.id ?? null,
    socket,
  }
  const subscribers = roomSubscribers.get(room.id) ?? new Set<RoomSubscriber>()
  subscribers.add(subscriber)
  roomSubscribers.set(room.id, subscribers)

  if (session) {
    onlineSessionCounts.set(session.id, (onlineSessionCounts.get(session.id) ?? 0) + 1)
    broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
    socket.on('message', (data) => {
      handleRoomClientEvent(roomSubscribers, room, session, data)
    })
  }
  else {
    broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
  }

  socket.on('close', () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) roomSubscribers.delete(room.id)
    if (session) {
      disconnectSession(
        rooms,
        roomSubscribers,
        onlineSessionCounts,
        saveRooms,
        room,
        session,
      )
      broadcastClearPendingAction(roomSubscribers, room, session)
    }
    else {
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
    }
  })
}

function handleRoomClientEvent(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
  session: SessionState,
  data: unknown,
) {
  const event = parseRoomClientEvent(data)
  if (! event) return

  switch (event.type) {
    case 'pending-action':
      broadcastPendingAction(roomSubscribers, room, session, event.moves)
      break
    case 'clear-pending-action':
      broadcastClearPendingAction(roomSubscribers, room, session)
      break
  }
}

function parseRoomClientEvent(data: unknown): MatchRoomClientEvent | null {
  try {
    const text = typeof data === 'string'
      ? data
      : data instanceof Buffer
        ? data.toString('utf8')
        : String(data)
    return MatchRoomClientEventSchema.parse(JSON.parse(text) as unknown)
  }
  catch {
    return null
  }
}

function subscribeStudyRoomState({
  socket,
  studySubscribers,
  studyPresence,
  chatMessages,
  room,
  user,
  saveAll,
}: {
  socket: WebSocketLike
  studySubscribers: Map<string, Set<StudySubscriber>>
  studyPresence: Map<string, Map<string, StudyPresence>>
  chatMessages: ChatMessage[]
  room: StudyRoom
  user: UserState
  saveAll: () => void
}) {
  const subscriber: StudySubscriber = {
    userId: user.id,
    socket,
  }
  const subscribers = studySubscribers.get(room.id) ?? new Set<StudySubscriber>()
  subscribers.add(subscriber)
  studySubscribers.set(room.id, subscribers)

  sendStudyState(socket, studyPresence, chatMessages, room)
  socket.on('message', (data) => {
    handleStudyClientEvent({
      socket,
      studySubscribers,
      studyPresence,
      chatMessages,
      room,
      user,
      data,
      saveAll,
    })
  })

  socket.on('close', () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) studySubscribers.delete(room.id)
    const presenceByUser = studyPresence.get(room.id)
    presenceByUser?.delete(user.id)
    if (presenceByUser?.size === 0) studyPresence.delete(room.id)
    broadcastStudyState(studySubscribers, studyPresence, chatMessages, room)
  })
}

function handleStudyClientEvent({
  socket,
  studySubscribers,
  studyPresence,
  chatMessages,
  room,
  user,
  data,
  saveAll,
}: {
  socket: WebSocketLike
  studySubscribers: Map<string, Set<StudySubscriber>>
  studyPresence: Map<string, Map<string, StudyPresence>>
  chatMessages: ChatMessage[]
  room: StudyRoom
  user: UserState
  data: unknown
  saveAll: () => void
}) {
  const event = parseStudyClientEvent(data)
  if (! event) return

  switch (event.type) {
    case 'command': {
      if (! canEditStudyRoom(room, user.id)) {
        sendStudyCommandRejected(socket, 'permission-denied', room)
        return
      }
      if (event.baseVersion > room.version) {
        sendStudyCommandRejected(socket, 'conflict', room)
        return
      }

      const result = createStudyPatchFromCommand(room, user.id, event.command)
      if ('reason' in result) {
        sendStudyCommandRejected(socket, result.reason, room)
        return
      }

      const { patch } = result
      applyStudyPatch(room, patch)
      saveAll()
      broadcastStudyEvent(studySubscribers, room.id, {
        type: 'study-patch',
        version: room.version,
        patch,
      })
      break
    }
    case 'presence': {
      const presence: StudyPresence = {
        userId: user.id,
        nickname: user.nickname,
        cursor: event.cursor,
        mode: event.mode,
        followingUserId: event.followingUserId,
        updatedAt: Date.now(),
      }
      const presenceByUser = studyPresence.get(room.id) ?? new Map<string, StudyPresence>()
      presenceByUser.set(user.id, presence)
      studyPresence.set(room.id, presenceByUser)
      broadcastStudyEvent(studySubscribers, room.id, {
        type: 'presence',
        presence,
      })
      break
    }
    case 'chat-message': {
      const text = event.text.trim().slice(0, STUDY_CHAT_MESSAGE_MAX_LENGTH)
      if (! text) return

      const message = ChatMessageSchema.parse({
        id: randomUUID(),
        roomKind: 'study',
        roomId: room.id,
        userId: user.id,
        nickname: user.nickname,
        text,
        createdAt: Date.now(),
      })
      chatMessages.push(message)
      pruneStudyChatMessages(chatMessages, room.id)
      saveAll()
      broadcastStudyEvent(studySubscribers, room.id, {
        type: 'chat-message',
        message,
      })
      break
    }
  }
}

function parseStudyClientEvent(data: unknown): StudyRoomClientEvent | null {
  try {
    const text = typeof data === 'string'
      ? data
      : data instanceof Buffer
        ? data.toString('utf8')
        : String(data)
    return StudyRoomClientEventSchema.parse(JSON.parse(text) as unknown)
  }
  catch {
    return null
  }
}

function canEditStudyRoom(room: StudyRoom, userId: string): boolean {
  const member = room.members.find(member => member.userId === userId)
  return member?.role === 'owner'
    || member?.role === 'moderator'
    || member?.role === 'editor'
}

type StudyCommandRejectedReason = 'permission-denied' | 'target-not-found' | 'conflict' | 'unsupported'

type StudyCommandPatchResult =
  | { patch: StudyPatch }
  | { reason: StudyCommandRejectedReason }

function createStudyPatchFromCommand(
  room: StudyRoom,
  authorId: string,
  command: StudyCommand,
): StudyCommandPatchResult {
  switch (command.type) {
    case 'submit-action':
      return createSubmitStudyActionPatch(room.document, authorId, command.position, command.action)
    case 'remove-future':
      return createRemoveStudyFuturePatch(room.document, command.position)
    case 'upsert-annotation':
      return {
        patch: {
          type: 'upsert-annotation',
          annotation: command.annotation,
        },
      }
    case 'delete-annotation':
      return {
        patch: {
          type: 'delete-annotation',
          annotationId: command.annotationId,
        },
      }
    case 'update-title': {
      const title = command.title.trim()
      if (! title || title === room.name) return { reason: 'conflict' }
      return {
        patch: {
          type: 'update-title',
          title,
        },
      }
    }
    case 'update-visibility':
      if (command.visibility === room.visibility) return { reason: 'conflict' }
      return {
        patch: {
          type: 'update-visibility',
          visibility: command.visibility,
        },
      }
  }
}

interface StudyResolvedPosition {
  branch: StudyBranch
  actionIndex: number
}

function createSubmitStudyActionPatch(
  document: StudyDocument,
  authorId: string,
  position: StudyPosition,
  action: Action,
): StudyCommandPatchResult {
  const target = resolveStudyPosition(document, position)
  if (! target) return { reason: 'target-not-found' }

  const nextAction = getStudyActionAt(document, target.branch, target.actionIndex)
  if (nextAction) {
    if (Action.isSame(nextAction.action, action)) return { reason: 'conflict' }

    const matchingBranch = findMatchingStudyBranchAtPosition(document, position, action)
    if (matchingBranch) return { reason: 'conflict' }

    const branchId = createStudyEntityId('branch')
    const actionNode = createStudyActionNode(branchId, authorId, action)
    return {
      patch: {
        type: 'create-branch',
        branch: {
          id: branchId,
          parent: position,
          actionIds: [actionNode.id],
          createdAt: Date.now(),
        },
        actions: [actionNode],
      },
    }
  }

  const matchingBranch = findMatchingStudyBranchAtPosition(document, position, action)
  if (matchingBranch) return { reason: 'conflict' }

  const actionNode = createStudyActionNode(target.branch.id, authorId, action)
  return {
    patch: {
      type: 'append-action',
      branchId: target.branch.id,
      position,
      action: actionNode,
    },
  }
}

function createRemoveStudyFuturePatch(
  document: StudyDocument,
  position: StudyPosition,
): StudyCommandPatchResult {
  const target = resolveStudyPosition(document, position)
  if (! target) return { reason: 'target-not-found' }

  const removedActionIds = new Set<string>()
  const removedBranchIds = new Set<string>()
  collectStudyFutureIds(document, target.branch, target.actionIndex, removedActionIds, removedBranchIds)
  if (removedActionIds.size === 0 && removedBranchIds.size === 0) return { reason: 'conflict' }

  return {
    patch: {
      type: 'remove-future',
      position,
      removedActionIds: [...removedActionIds],
      removedBranchIds: [...removedBranchIds],
    },
  }
}

function applyStudyPatch(room: StudyRoom, patch: StudyPatch) {
  const now = Date.now()
  switch (patch.type) {
    case 'append-action': {
      const branch = room.document.branches.find(branch => branch.id === patch.branchId)
      if (! branch) break
      branch.actionIds.push(patch.action.id)
      room.document.actions.push(patch.action)
      room.document.updatedAt = now
      break
    }
    case 'create-branch':
      room.document.branches.push(patch.branch)
      room.document.actions.push(...patch.actions)
      room.document.updatedAt = now
      break
    case 'remove-future': {
      const removedActionIds = new Set(patch.removedActionIds)
      const removedBranchIds = new Set(patch.removedBranchIds)
      room.document.branches = room.document.branches
        .filter(branch => ! removedBranchIds.has(branch.id))
        .map(branch => ({
          ...branch,
          actionIds: branch.actionIds.filter(actionId => ! removedActionIds.has(actionId)),
        }))
      room.document.actions = room.document.actions
        .filter(action => ! removedActionIds.has(action.id))
      room.document.annotations = room.document.annotations
        .filter(annotation => ! isStudyAnnotationRemovedByFuture(annotation, removedActionIds, removedBranchIds))
      room.document.updatedAt = now
      break
    }
    case 'upsert-annotation': {
      const index = room.document.annotations.findIndex(annotation => annotation.id === patch.annotation.id)
      if (index >= 0) room.document.annotations[index] = patch.annotation
      else room.document.annotations.push(patch.annotation)
      room.document.updatedAt = now
      break
    }
    case 'delete-annotation':
      room.document.annotations = room.document.annotations
        .filter(annotation => annotation.id !== patch.annotationId)
      room.document.updatedAt = now
      break
    case 'update-title':
      room.name = patch.title
      room.document.title = patch.title
      room.document.updatedAt = now
      break
    case 'update-visibility':
      room.visibility = patch.visibility
      break
  }
  room.version += 1
  room.updatedAt = now
}

function isStudyAnnotationRemovedByFuture(
  annotation: StudyDocument['annotations'][number],
  removedActionIds: ReadonlySet<string>,
  removedBranchIds: ReadonlySet<string>,
): boolean {
  switch (annotation.target.type) {
    case 'action':
    case 'move':
      return removedActionIds.has(annotation.target.actionId)
    case 'square':
    case 'arrow':
      return removedBranchIds.has(annotation.target.branchId)
    case 'cursor':
    case 'line':
      return false
  }
}

function resolveStudyPosition(
  document: StudyDocument,
  position: StudyPosition,
): StudyResolvedPosition | null {
  if (position.type === 'head') {
    const branch = document.branches.find(branch => branch.id === position.branchId)
    return branch
      ? {
          branch,
          actionIndex: 0,
        }
      : null
  }

  const action = document.actions.find(action => action.id === position.actionId)
  if (! action) return null
  const branch = document.branches.find(branch => branch.id === action.branchId)
  const actionIndex = branch?.actionIds.indexOf(action.id) ?? -1
  if (! branch || actionIndex < 0) return null
  return {
    branch,
    actionIndex: actionIndex + 1,
  }
}

function getStudyActionAt(
  document: StudyDocument,
  branch: StudyBranch,
  actionIndex: number,
): StudyActionNode | null {
  const actionId = branch.actionIds[actionIndex]
  if (! actionId) return null
  return document.actions.find(action => action.id === actionId && action.branchId === branch.id) ?? null
}

function findMatchingStudyBranchAtPosition(
  document: StudyDocument,
  position: StudyPosition,
  action: Action,
): StudyBranch | null {
  return document.branches.find((branch) => {
    if (! branch.parent || ! isSameStudyPosition(branch.parent, position)) return false
    const firstAction = getStudyActionAt(document, branch, 0)
    return firstAction ? Action.isSame(firstAction.action, action) : false
  }) ?? null
}

function collectStudyFutureIds(
  document: StudyDocument,
  branch: StudyBranch,
  actionIndex: number,
  removedActionIds: Set<string>,
  removedBranchIds: Set<string>,
) {
  const shouldRemoveWholeBranch = branch.id !== document.rootBranchId && actionIndex === 0
  if (shouldRemoveWholeBranch) {
    collectStudyBranchTreeIds(document, branch.id, removedActionIds, removedBranchIds)
    return
  }

  for (const actionId of branch.actionIds.slice(actionIndex)) {
    removedActionIds.add(actionId)
  }

  for (const child of document.branches) {
    if (! child.parent || ! isStudyBranchChildInRemovedRange(branch, actionIndex, child, document)) continue
    collectStudyBranchTreeIds(document, child.id, removedActionIds, removedBranchIds)
  }
}

function collectStudyBranchTreeIds(
  document: StudyDocument,
  branchId: string,
  removedActionIds: Set<string>,
  removedBranchIds: Set<string>,
) {
  if (removedBranchIds.has(branchId)) return
  const branch = document.branches.find(branch => branch.id === branchId)
  if (! branch) return

  removedBranchIds.add(branch.id)
  for (const actionId of branch.actionIds) {
    removedActionIds.add(actionId)
  }

  for (const child of document.branches) {
    if (! child.parent) continue
    const childParentBranchId = getStudyPositionBranchId(document, child.parent)
    if (childParentBranchId === branch.id) {
      collectStudyBranchTreeIds(document, child.id, removedActionIds, removedBranchIds)
    }
  }
}

function isStudyBranchChildInRemovedRange(
  branch: StudyBranch,
  actionIndex: number,
  child: StudyBranch,
  document: StudyDocument,
): boolean {
  const parent = child.parent
  if (! parent) return false
  if (parent.type === 'head') return parent.branchId === branch.id && actionIndex <= 0

  const parentActionIndex = branch.actionIds.indexOf(parent.actionId)
  if (parentActionIndex >= 0) return parentActionIndex >= actionIndex

  return getStudyPositionBranchId(document, parent) === branch.id && actionIndex <= 0
}

function getStudyPositionBranchId(document: StudyDocument, position: StudyPosition): string | null {
  if (position.type === 'head') return position.branchId
  return document.actions.find(action => action.id === position.actionId)?.branchId ?? null
}

function isSameStudyPosition(a: StudyPosition, b: StudyPosition): boolean {
  if (a.type !== b.type) return false
  return a.type === 'head'
    ? b.type === 'head' && a.branchId === b.branchId
    : b.type === 'after' && a.actionId === b.actionId
}

function createStudyActionNode(
  branchId: string,
  authorId: string,
  action: Action,
): StudyActionNode {
  return {
    id: createStudyEntityId('action'),
    branchId,
    action,
    authorId,
    createdAt: Date.now(),
  }
}

function createStudyEntityId(prefix: 'action' | 'branch'): string {
  return `${prefix}:${randomUUID()}`
}

function pruneStudyChatMessages(chatMessages: ChatMessage[], roomId: string) {
  const keepMessages = getStudyChatMessages(chatMessages, roomId)
  if (keepMessages.length < STUDY_CHAT_HISTORY_LIMIT) return

  const keepIds = new Set(keepMessages.map(message => message.id))
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    const message = chatMessages[i]!
    if (message.roomKind === 'study' && message.roomId === roomId && ! keepIds.has(message.id)) {
      chatMessages.splice(i, 1)
    }
  }
}

function disconnectSession(
  rooms: RoomState[],
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  onlineSessionCounts: Map<string, number>,
  saveRooms: (rooms: RoomState[]) => void,
  room: RoomState,
  session: SessionState,
) {
  const count = onlineSessionCounts.get(session.id) ?? 0
  if (count > 1) {
    onlineSessionCounts.set(session.id, count - 1)
    return
  }

  onlineSessionCounts.delete(session.id)
  if (toRoomView(room).status === 'waiting') {
    leaveRoom(room, session)
    pruneUnrecordedRooms(rooms)
    saveRooms(rooms)
    if (rooms.includes(room)) broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
    return
  }

  room.updatedAt = Date.now()
  saveRooms(rooms)
  broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
}

function broadcastRoomState(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
  onlineSessionCounts: Map<string, number>,
) {
  const subscribers = roomSubscribers.get(room.id)
  if (! subscribers) return

  for (const subscriber of subscribers) {
    writeRoomStateEvent(roomSubscribers, subscriber, room, onlineSessionCounts)
  }
}

function broadcastStudyState(
  studySubscribers: Map<string, Set<StudySubscriber>>,
  studyPresence: Map<string, Map<string, StudyPresence>>,
  chatMessages: ChatMessage[],
  room: StudyRoom,
) {
  const subscribers = studySubscribers.get(room.id)
  if (! subscribers) return

  for (const subscriber of subscribers) {
    sendStudyState(subscriber.socket, studyPresence, chatMessages, room)
  }
}

function sendStudyState(
  socket: WebSocketLike,
  studyPresence: Map<string, Map<string, StudyPresence>>,
  chatMessages: ChatMessage[],
  room: StudyRoom,
) {
  const event: StudyRoomEvent = {
    type: 'study-state',
    room,
    presence: getStudyPresenceList(studyPresence, room.id),
    chat: getStudyChatMessages(chatMessages, room.id),
  }
  socket.send(JSON.stringify(event))
}

function sendStudyCommandRejected(
  socket: WebSocketLike,
  reason: 'permission-denied' | 'target-not-found' | 'conflict' | 'unsupported',
  room: StudyRoom,
) {
  const event: StudyRoomEvent = {
    type: 'command-rejected',
    reason,
    currentVersion: room.version,
  }
  socket.send(JSON.stringify(event))
}

function getStudyPresenceList(
  studyPresence: Map<string, Map<string, StudyPresence>>,
  roomId: string,
): StudyPresence[] {
  return [...(studyPresence.get(roomId)?.values() ?? [])]
    .sort((a, b) => a.updatedAt - b.updatedAt)
}

function broadcastStudyEvent(
  studySubscribers: Map<string, Set<StudySubscriber>>,
  roomId: string,
  event: StudyRoomEvent,
) {
  const subscribers = studySubscribers.get(roomId)
  if (! subscribers) return

  for (const subscriber of subscribers) {
    subscriber.socket.send(JSON.stringify(event))
  }
}

function broadcastPendingAction(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
  session: SessionState,
  moves: MatchPendingActionEvent['moves'],
) {
  const event: MatchPendingActionEvent = {
    type: 'pending-action',
    sessionId: session.id,
    player: session.player,
    moves,
  }
  broadcastRoomEventToOpponents(roomSubscribers, room, session, event)
}

function broadcastClearPendingAction(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
  session: SessionState,
) {
  const event: MatchClearPendingActionEvent = {
    type: 'clear-pending-action',
    sessionId: session.id,
    player: session.player,
  }
  broadcastRoomEventToOpponents(roomSubscribers, room, session, event)
}

function broadcastRoomEventToOpponents(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
  session: SessionState,
  event: MatchPendingActionEvent | MatchClearPendingActionEvent,
) {
  const subscribers = roomSubscribers.get(room.id)
  if (! subscribers) return

  for (const subscriber of subscribers) {
    if (subscriber.sessionId === session.id) continue
    subscriber.socket.send(JSON.stringify(event))
  }
}

function writeRoomStateEvent(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  subscriber: RoomSubscriber,
  room: RoomState,
  onlineSessionCounts: Map<string, number>,
) {
  const session = subscriber.sessionId
    ? room.sessions.find(session => session.id === subscriber.sessionId) ?? null
    : null
  const event: MatchRoomStateEvent = {
    type: 'state',
    state: toGameStateView(room, session, onlineSessionCounts, {
      spectatorCount: getRoomSpectatorCount(roomSubscribers, room),
    }),
  }
  subscriber.socket.send(JSON.stringify(event))
}

function getRoomSpectatorCount(
  roomSubscribers: Map<string, Set<RoomSubscriber>>,
  room: RoomState,
) {
  const subscribers = roomSubscribers.get(room.id)
  if (! subscribers) return 0

  let count = 0
  for (const subscriber of subscribers) {
    if (subscriber.sessionId === null) count += 1
  }
  return count
}

function sendError(reply: FastifyReply, status: number, error: string): MatchErrorResponse {
  reply.code(status)
  return { error }
}
