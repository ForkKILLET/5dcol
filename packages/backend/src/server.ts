import { randomUUID } from 'node:crypto'

import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyReply } from 'fastify'
import { GameState, type Action, Player } from '@5dcol/core'

import {
  MATCH_PROTOCOL_VERSION,
  MatchRoomClientEventSchema,
  MatchRoomSettingsSchema,
  CreateMatchRoomRequestSchema,
  JoinMatchRoomRequestSchema,
  LeaveMatchRoomRequestSchema,
  ForfeitMatchRoomRequestSchema,
  SubmitMatchActionRequestSchema,
  type CreateMatchRoomRequest,
  type CreateMatchRoomResponse,
  type ForfeitMatchRoomRequest,
  type ForfeitMatchRoomResponse,
  type GetMatchRoomStateResponse,
  type GetMatchSessionResponse,
  type JoinMatchRoomResponse,
  type JoinMatchRoomRequest,
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
  password: string | null
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

interface WebSocketLike {
  send(data: string): void
  close(): void
  on(event: 'close', listener: () => void): void
  on(event: 'message', listener: (data: unknown) => void): void
}

const DEFAULT_SERVER_NAME = '5DC OL Debug Server'
const FINISHED_ROOM_HISTORY_MS = 24 * 60 * 60 * 1000
const FINISHED_ROOM_HISTORY_LIMIT = 10

export function createBackendServer(options: BackendServerOptions) {
  const storage = createRoomStorage()
  const storageState = storage.loadState()
  const rooms: RoomState[] = storageState.rooms
  const users: UserState[] = storageState.users
  const roomSubscribers = new Map<string, Set<RoomSubscriber>>()
  const onlineSessionCounts = new Map<string, number>()
  const app = Fastify()

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
  }))

  app.get<{ Querystring: MatchRoomsRequestQuery }>('/rooms', async (request): Promise<MatchRoomsResponse> => ({
    rooms: getListedRooms(rooms, normalizePassword(request.query.password), request.query.userId),
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
      password: normalizePassword(body?.password),
      clock: createInitialClock(),
      createdAt: Date.now(),
      startedAt: null,
      updatedAt: Date.now(),
    }
    rooms.push(room)
    const user = getOrCreateUser(users, body.userId, body?.nickname)
    const session = createSession(room, user, getCreatorPlayer(settings.creatorPlayer), body?.nickname)
    storage.saveState({ rooms, users })
    reply.code(201)
    return {
      user: toUserView(user),
      state: toGameStateView(room, session, onlineSessionCounts),
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
        state: toGameStateView(sessionLookup.room, sessionLookup.session, onlineSessionCounts),
      }
    },
  )

  app.get<{ Params: { id: string }, Querystring: { sessionId?: string, userId?: string, password?: string } }>(
    '/rooms/:id/state',
    async (request, reply): Promise<GetMatchRoomStateResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')
      const session = request.query.sessionId && request.query.userId
        ? room.sessions.find(session => session.id === request.query.sessionId && session.userId === request.query.userId) ?? null
        : null
      if (request.query.sessionId && ! session) return sendError(reply, 403, 'Invalid session')
      if (! session && ! canViewRoom(room, normalizePassword(request.query.password))) {
        return sendError(reply, 403, 'Room is not viewable')
      }
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
      }
    },
  )

  void app.register(async routeApp => {
    routeApp.get<{ Params: { id: string }, Querystring: { sessionId?: string, userId?: string, password?: string } }>(
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
        if (! session && ! canViewRoom(room, normalizePassword(request.query.password))) {
          socket.close()
          return
        }
        subscribeRoomState(
          socket,
          roomSubscribers,
          onlineSessionCounts,
          rooms,
          rooms => storage.saveState({ rooms, users }),
          room,
          session,
        )
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
      if (! canAccessRoom(room, normalizePassword(body.password))) {
        return sendError(reply, 403, 'Invalid room password')
      }

      const player = getAvailablePlayer(room)
      if (player === null) return sendError(reply, 409, 'Room is full')

      const user = getOrCreateUser(users, body.userId, body.nickname)
      const session = createSession(room, user, player, body.nickname)
      storage.saveState({ rooms, users })
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        user: toUserView(user),
        state: toGameStateView(room, session, onlineSessionCounts),
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
      storage.saveState({ rooms, users })
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, null, onlineSessionCounts),
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
      storage.saveState({ rooms, users })
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
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
      storage.saveState({ rooms, users })
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
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
      roomSubscribers.clear()
      void app.close()
    },
  }
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

function normalizePassword(password: string | null | undefined): string | null {
  const trimmed = password?.trim()
  return trimmed ? trimmed.slice(0, 128) : null
}

function canAccessRoom(room: RoomState, password: string | null): boolean {
  return room.password === null || room.password === password
}

function canViewRoom(room: RoomState, password: string | null): boolean {
  if (! canAccessRoom(room, password)) return false
  if (! room.settings.canReplay) return false

  const status = getRoomStatus(room)
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

function toRoomView(room: RoomState, userId: string | null = null): MatchRoom {
  const players = room.sessions.length
  return {
    id: room.id,
    name: room.name,
    players,
    maxPlayers: room.maxPlayers,
    seats: getRoomSeats(room),
    status: getRoomStatus(room),
    winner: room.winner,
    finishReason: room.finishReason,
    settings: room.settings,
    private: room.password !== null,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    updatedAt: room.updatedAt,
    actionCount: room.actions.length,
    ownSession: userId
      ? room.sessions.find(session => session.userId === userId) ?? null
      : null,
  }
}

function getRoomSeats(room: RoomState): MatchRoom['seats'] {
  const white = room.sessions.find(session => session.player === Player.W) ?? null
  const black = room.sessions.find(session => session.player === Player.B) ?? null
  return [
    white ? { player: white.player, nickname: white.nickname } : null,
    black ? { player: black.player, nickname: black.nickname } : null,
  ]
}

function getListedRooms(rooms: RoomState[], password: string | null, userId: string | null | undefined): MatchRoom[] {
  const now = Date.now()
  const ownUserId = userId ?? null
  const activeRooms = rooms
    .filter(room => canAccessListedRoom(room, password, ownUserId))
    .filter(room => getRoomStatus(room) !== 'finished')
    .map(room => toRoomView(room, ownUserId))
  const finishedRooms = rooms
    .filter(room => canAccessListedRoom(room, password, ownUserId))
    .filter(room => getRoomStatus(room) === 'finished')
    .filter(room => room.actions.length > 0)
    .filter(room => room.settings.saveRecordToServer)
    .filter(room => now - room.updatedAt <= FINISHED_ROOM_HISTORY_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, FINISHED_ROOM_HISTORY_LIMIT)
    .map(room => toRoomView(room, ownUserId))

  return [...activeRooms, ...finishedRooms]
}

function canAccessListedRoom(room: RoomState, password: string | null, userId: string | null): boolean {
  return canAccessRoom(room, password)
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
): MatchGameState {
  const state = GameState.create(room.actions)
  return {
    room: toRoomView(room),
    session,
    presence: getMatchPresence(room, session, onlineSessionCounts),
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
    writeRoomStateEvent(subscriber, room, onlineSessionCounts)
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
    writeRoomStateEvent(subscriber, room, onlineSessionCounts)
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
  subscriber: RoomSubscriber,
  room: RoomState,
  onlineSessionCounts: Map<string, number>,
) {
  const session = subscriber.sessionId
    ? room.sessions.find(session => session.id === subscriber.sessionId) ?? null
    : null
  const event: MatchRoomStateEvent = {
    type: 'state',
    state: toGameStateView(room, session, onlineSessionCounts),
  }
  subscriber.socket.send(JSON.stringify(event))
}

function sendError(reply: FastifyReply, status: number, error: string): MatchErrorResponse {
  reply.code(status)
  return { error }
}
