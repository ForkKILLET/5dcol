import { randomUUID } from 'node:crypto'

import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyReply } from 'fastify'
import { GameState, type Action, type Player } from '@5dcol/core'

import {
  MATCH_PROTOCOL_VERSION,
  DEFAULT_MATCH_ROOM_SETTINGS,
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
  type MatchRoom,
  type MatchRoomCreatorPlayer,
  type MatchRoomFinishReason,
  type MatchRoomSettings,
  type MatchRoomStateEvent,
  type MatchRoomsResponse,
  type MatchServerInfo,
  type MatchSession,
  type SubmitMatchActionRequest,
  type SubmitMatchActionResponse,
} from './protocol.ts'
import { createRoomStorage } from './storage.ts'

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
  createdAt: number
  startedAt: number | null
  updatedAt: number
}

interface RoomSubscriber {
  sessionId: string | null
  socket: WebSocketLike
}

interface WebSocketLike {
  send(data: string): void
  close(): void
  on(event: 'close', listener: () => void): void
}

const DEFAULT_SERVER_NAME = '5DC OL Debug Server'
const PLAYER_W = 0 as Player
const PLAYER_B = 1 as Player
const FINISHED_ROOM_HISTORY_MS = 24 * 60 * 60 * 1000
const FINISHED_ROOM_HISTORY_LIMIT = 10

export function createBackendServer(options: BackendServerOptions) {
  const storage = createRoomStorage()
  const rooms: RoomState[] = storage.load()
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
    console.error(err)
    reply.code(500).send({ error: 'Internal server error' } satisfies MatchErrorResponse)
  })

  app.get('/health', async (): Promise<MatchServerInfo> => ({
    protocolVersion: MATCH_PROTOCOL_VERSION,
    name: options.name ?? DEFAULT_SERVER_NAME,
  }))

  app.get('/rooms', async (): Promise<MatchRoomsResponse> => ({
    rooms: getListedRooms(rooms),
  }))

  app.post<{ Body: CreateMatchRoomRequest }>('/rooms', async (request, reply): Promise<CreateMatchRoomResponse> => {
    const body = request.body
    const settings = normalizeRoomSettings(body?.settings)
    const room: RoomState = {
      id: randomUUID(),
      name: body?.name?.trim() || `Room ${rooms.length + 1}`,
      maxPlayers: 2,
      sessions: [],
      actions: [],
      winner: null,
      finishReason: null,
      settings,
      createdAt: Date.now(),
      startedAt: null,
      updatedAt: Date.now(),
    }
    rooms.push(room)
    const session = createSession(room, getCreatorPlayer(settings.creatorPlayer), body?.nickname)
    storage.save(rooms)
    reply.code(201)
    return {
      state: toGameStateView(room, session, onlineSessionCounts),
    }
  })

  app.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId',
    async (request, reply): Promise<GetMatchSessionResponse | MatchErrorResponse> => {
      const sessionLookup = findSession(rooms, request.params.sessionId)
      if (! sessionLookup) return sendError(reply, 404, 'Session not found')
      return {
        state: toGameStateView(sessionLookup.room, sessionLookup.session, onlineSessionCounts),
      }
    },
  )

  app.get<{ Params: { id: string }, Querystring: { sessionId?: string } }>(
    '/rooms/:id/state',
    async (request, reply): Promise<GetMatchRoomStateResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')
      const session = request.query.sessionId
        ? room.sessions.find(session => session.id === request.query.sessionId) ?? null
        : null
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
      }
    },
  )

  void app.register(async routeApp => {
    routeApp.get<{ Params: { id: string }, Querystring: { sessionId?: string } }>(
      '/rooms/:id/events',
      { websocket: true },
      (socket, request) => {
        const room = rooms.find(room => room.id === request.params.id)
        if (! room) {
          socket.close()
          return
        }

        const session = request.query.sessionId
          ? room.sessions.find(session => session.id === request.query.sessionId) ?? null
          : null
        subscribeRoomState(
          socket,
          roomSubscribers,
          onlineSessionCounts,
          rooms,
          storage.save,
          room,
          session,
        )
      },
    )
  })

  app.post<{ Params: { id: string }, Body: JoinMatchRoomRequest }>(
    '/rooms/:id/join',
    async (request, reply): Promise<JoinMatchRoomResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')
      if (toRoomView(room).status !== 'waiting') return sendError(reply, 409, 'Room is not joinable')

      const player = getAvailablePlayer(room)
      if (player === null) return sendError(reply, 409, 'Room is full')

      const session = createSession(room, player, request.body?.nickname)
      storage.save(rooms)
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: LeaveMatchRoomRequest }>(
    '/rooms/:id/leave',
    async (request, reply): Promise<LeaveMatchRoomResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === request.body?.sessionId)
      if (! session) return sendError(reply, 403, 'Invalid session')
      if (toRoomView(room).status === 'playing') return sendError(reply, 409, 'Use forfeit to leave a playing room')

      leaveRoom(room, session)
      onlineSessionCounts.delete(session.id)
      pruneUnrecordedRooms(rooms)
      storage.save(rooms)
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, null, onlineSessionCounts),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: ForfeitMatchRoomRequest }>(
    '/rooms/:id/forfeit',
    async (request, reply): Promise<ForfeitMatchRoomResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === request.body?.sessionId)
      if (! session) return sendError(reply, 403, 'Invalid session')

      forfeitRoom(room, session)
      storage.save(rooms)
      broadcastRoomState(roomSubscribers, room, onlineSessionCounts)
      return {
        state: toGameStateView(room, session, onlineSessionCounts),
      }
    },
  )

  app.post<{ Params: { id: string }, Body: SubmitMatchActionRequest }>(
    '/rooms/:id/actions',
    async (request, reply): Promise<SubmitMatchActionResponse | MatchErrorResponse> => {
      const room = rooms.find(room => room.id === request.params.id)
      if (! room) return sendError(reply, 404, 'Room not found')

      const session = room.sessions.find(session => session.id === request.body?.sessionId)
      if (! session) return sendError(reply, 403, 'Invalid session')
      if (toRoomView(room).status !== 'playing') return sendError(reply, 409, 'Room is not ready')

      const state = GameState.create(room.actions)
      if (state.player !== session.player) return sendError(reply, 409, 'Not your turn')

      let nextState: GameState
      try {
        // This replays the full authoritative action list and validates every move
        // in the submitted action against core rules before mutating room state.
        nextState = GameState.create([...room.actions, request.body.action])
      }
      catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Illegal action')
      }

      room.actions.push(request.body.action)
      finishRoomIfGameEnded(room, nextState, session.player)
      room.updatedAt = Date.now()
      storage.save(rooms)
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
  }
  session.lastSeenAt = 0
  room.updatedAt = Date.now()
}

function createSession(room: RoomState, player: Player, nickname: string | null | undefined): SessionState {
  const session = {
    id: randomUUID(),
    roomId: room.id,
    player,
    nickname: normalizeNickname(nickname),
    lastSeenAt: Date.now(),
  }
  room.sessions.push(session)
  if (room.startedAt === null && room.sessions.length >= room.maxPlayers) {
    room.startedAt = Date.now()
  }
  room.updatedAt = Date.now()
  return session
}

function normalizeNickname(nickname: string | null | undefined): string | null {
  const trimmed = nickname?.trim()
  return trimmed ? trimmed.slice(0, 32) : null
}

function normalizeRoomSettings(settings: Partial<MatchRoomSettings> | null | undefined): MatchRoomSettings {
  return {
    canSpectate: getBooleanSetting(settings?.canSpectate, DEFAULT_MATCH_ROOM_SETTINGS.canSpectate),
    creatorPlayer: getCreatorPlayerSetting(settings?.creatorPlayer),
    saveRecordToServer: getBooleanSetting(settings?.saveRecordToServer, DEFAULT_MATCH_ROOM_SETTINGS.saveRecordToServer),
    showOpponentSmallMoves: getBooleanSetting(settings?.showOpponentSmallMoves, DEFAULT_MATCH_ROOM_SETTINGS.showOpponentSmallMoves),
    showOpponentMoveRange: getBooleanSetting(settings?.showOpponentMoveRange, DEFAULT_MATCH_ROOM_SETTINGS.showOpponentMoveRange),
  }
}

function getBooleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function getCreatorPlayerSetting(value: unknown): MatchRoomCreatorPlayer {
  return value === 'white' || value === 'black' || value === 'random'
    ? value
    : DEFAULT_MATCH_ROOM_SETTINGS.creatorPlayer
}

function getCreatorPlayer(setting: MatchRoomCreatorPlayer): Player {
  switch (setting) {
    case 'black':
      return PLAYER_B
    case 'random':
      return Math.random() < 0.5 ? PLAYER_W : PLAYER_B
    case 'white':
      return PLAYER_W
  }
}

function getAvailablePlayer(room: RoomState): Player | null {
  const used = new Set(room.sessions.map(session => session.player))
  if (! used.has(PLAYER_W)) return PLAYER_W
  if (! used.has(PLAYER_B)) return PLAYER_B
  return null
}

function getOpponentPlayer(player: Player): Player {
  return player === PLAYER_W ? PLAYER_B : PLAYER_W
}

function findSession(
  rooms: RoomState[],
  sessionId: string,
): { room: RoomState, session: SessionState } | null {
  for (const room of rooms) {
    const session = room.sessions.find(session => session.id === sessionId)
    if (session) return { room, session }
  }
  return null
}

function toRoomView(room: RoomState): MatchRoom {
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
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    updatedAt: room.updatedAt,
    actionCount: room.actions.length,
  }
}

function getRoomSeats(room: RoomState): MatchRoom['seats'] {
  const white = room.sessions.find(session => session.player === PLAYER_W) ?? null
  const black = room.sessions.find(session => session.player === PLAYER_B) ?? null
  return [
    white ? { player: white.player, nickname: white.nickname } : null,
    black ? { player: black.player, nickname: black.nickname } : null,
  ]
}

function getListedRooms(rooms: RoomState[]): MatchRoom[] {
  const now = Date.now()
  const activeRooms = rooms
    .filter(room => getRoomStatus(room) !== 'finished')
    .map(toRoomView)
  const finishedRooms = rooms
    .filter(room => getRoomStatus(room) === 'finished')
    .filter(room => room.actions.length > 0)
    .filter(room => room.settings.saveRecordToServer)
    .filter(room => now - room.updatedAt <= FINISHED_ROOM_HISTORY_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, FINISHED_ROOM_HISTORY_LIMIT)
    .map(toRoomView)

  return [...activeRooms, ...finishedRooms]
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
    updatedAt: room.updatedAt,
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
    }
  })
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

function writeRoomStateEvent(
  subscriber: RoomSubscriber,
  room: RoomState,
  onlineSessionCounts: Map<string, number>,
) {
  const session = subscriber.sessionId
    ? room.sessions.find(session => session.id === subscriber.sessionId) ?? null
    : null
  const event: MatchRoomStateEvent = {
    state: toGameStateView(room, session, onlineSessionCounts),
  }
  subscriber.socket.send(JSON.stringify(event))
}

function sendError(reply: FastifyReply, status: number, error: string): MatchErrorResponse {
  reply.code(status)
  return { error }
}
