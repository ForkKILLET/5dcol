import {
  CreateMatchRoomResponseSchema,
  CreateStudyRoomResponseSchema,
  DeleteStudyRoomResponseSchema,
  ForfeitMatchRoomResponseSchema,
  GetMatchRoomStateResponseSchema,
  GetMatchSessionResponseSchema,
  GetMatchServerStatsResponseSchema,
  GetStudyRoomStateResponseSchema,
  JoinMatchRoomResponseSchema,
  JoinStudyRoomResponseSchema,
  LeaveMatchRoomResponseSchema,
  MatchRoomsResponseSchema,
  MatchServerInfoSchema,
  StudyRoomsResponseSchema,
  SubmitMatchActionResponseSchema,
  UpdateStudyRoomResponseSchema,
  parseMatchRoomEvent,
  parseStudyRoomEvent,
} from '@5dcol/shared/protocol'
import type {
  CreateMatchRoomRequest,
  CreateMatchRoomResponse,
  CreateStudyRoomRequest,
  CreateStudyRoomResponse,
  DeleteStudyRoomRequest,
  DeleteStudyRoomResponse,
  ForfeitMatchRoomRequest,
  GetStudyRoomStateResponse,
  JoinMatchRoomRequest,
  JoinMatchRoomResponse,
  JoinStudyRoomRequest,
  JoinStudyRoomResponse,
  LeaveMatchRoomRequest,
  MatchGameState,
  MatchRoomClientEvent,
  MatchRoomEvent,
  MatchRoom,
  MatchServerStats,
  MatchServerInfo,
  StudyBoardFocus,
  StudyCommand,
  StudyFollowMode,
  StudyPosition,
  StudyRoomClientEvent,
  StudyRoomEvent,
  StudyRoom,
  SubmitMatchActionRequest,
  UpdateStudyRoomRequest,
  UpdateStudyRoomResponse,
} from '@5dcol/shared/protocol'
import type { Move } from '@5dcol/core'

export type MatchServerConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export interface MatchServerState {
  id: string
  address: string
  status: MatchServerConnectionStatus
  name: string
  version: string
  commitHash: string
  buildDate: string
  pingMs: number | null
  stats: MatchServerStats | null
  rooms: MatchRoom[]
  error: string
}

export type MatchRoomEventListener = (event: MatchRoomEvent) => void
export type StudyRoomEventListener = (event: StudyRoomEvent) => void
export interface MatchRoomStateSubscriptionOptions {
  onOpen?: () => void
  onError?: () => void
}
export interface MatchRoomStateSubscription {
  clearPendingAction(): void
  sendPendingAction(moves: Move[]): void
  unsubscribe(): void
}
export interface StudyRoomStateSubscription {
  sendCommand(baseVersion: number, command: StudyCommand): void
  sendPresence(cursor: StudyPosition, mode: StudyFollowMode, followingUserId?: string, focusedBoard?: StudyBoardFocus | null): void
  sendChatMessage(text: string): void
  unsubscribe(): void
}

export class MatchClient {
  constructor(
    private readonly baseUrl: string,
  ) {}

  async getInfo(): Promise<MatchServerInfo> {
    return MatchServerInfoSchema.parse(await this.request('/health'))
  }

  async getInfoWithPing(): Promise<{ info: MatchServerInfo, pingMs: number }> {
    const startedAt = performance.now()
    const info = await this.getInfo()
    return {
      info,
      pingMs: Math.max(0, Math.round(performance.now() - startedAt)),
    }
  }

  async getStats(): Promise<MatchServerStats> {
    const response = GetMatchServerStatsResponseSchema.parse(await this.request('/stats'))
    return response.stats
  }

  async getRooms(options: { userId?: string | null } = {}): Promise<MatchRoom[]> {
    const query = new URLSearchParams()
    if (options.userId) query.set('userId', options.userId)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const response = MatchRoomsResponseSchema.parse(await this.request(`/rooms${suffix}`))
    return response.rooms
  }

  async createRoom(request: CreateMatchRoomRequest = {}): Promise<CreateMatchRoomResponse> {
    return CreateMatchRoomResponseSchema.parse(await this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify(request),
    }))
  }

  async joinRoom(roomId: string, request: JoinMatchRoomRequest = {}): Promise<JoinMatchRoomResponse> {
    return JoinMatchRoomResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
  }

  async getSession(sessionId: string, userId: string): Promise<MatchGameState> {
    const query = new URLSearchParams({ userId })
    const response = GetMatchSessionResponseSchema.parse(await this.request(
      `/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
    ))
    return response.state
  }

  async getRoomState(roomId: string, options: { sessionId?: string, userId?: string } = {}): Promise<MatchGameState> {
    const query = new URLSearchParams()
    if (options.sessionId) query.set('sessionId', options.sessionId)
    if (options.userId) query.set('userId', options.userId)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const response = GetMatchRoomStateResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/state${suffix}`,
    ))
    return response.state
  }

  async submitAction(roomId: string, request: SubmitMatchActionRequest): Promise<MatchGameState> {
    const response = SubmitMatchActionResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/actions`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
    return response.state
  }

  async leaveRoom(roomId: string, request: LeaveMatchRoomRequest): Promise<MatchGameState> {
    const response = LeaveMatchRoomResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/leave`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
    return response.state
  }

  async forfeitRoom(roomId: string, request: ForfeitMatchRoomRequest): Promise<MatchGameState> {
    const response = ForfeitMatchRoomResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/forfeit`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
    return response.state
  }

  async getStudies(options: { userId?: string | null } = {}): Promise<StudyRoom[]> {
    const query = new URLSearchParams()
    if (options.userId) query.set('userId', options.userId)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const response = StudyRoomsResponseSchema.parse(await this.request(`/studies${suffix}`))
    return response.rooms
  }

  async createStudy(request: CreateStudyRoomRequest = {}): Promise<CreateStudyRoomResponse> {
    return CreateStudyRoomResponseSchema.parse(await this.request('/studies', {
      method: 'POST',
      body: JSON.stringify(request),
    }))
  }

  async joinStudy(studyId: string, request: JoinStudyRoomRequest = {}): Promise<JoinStudyRoomResponse> {
    return JoinStudyRoomResponseSchema.parse(await this.request(
      `/studies/${encodeURIComponent(studyId)}/join`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
  }

  async updateStudy(studyId: string, request: UpdateStudyRoomRequest): Promise<UpdateStudyRoomResponse> {
    return UpdateStudyRoomResponseSchema.parse(await this.request(
      `/studies/${encodeURIComponent(studyId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(request),
      },
    ))
  }

  async deleteStudy(studyId: string, request: DeleteStudyRoomRequest): Promise<DeleteStudyRoomResponse> {
    return DeleteStudyRoomResponseSchema.parse(await this.request(
      `/studies/${encodeURIComponent(studyId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify(request),
      },
    ))
  }

  async getStudyState(studyId: string): Promise<GetStudyRoomStateResponse> {
    return GetStudyRoomStateResponseSchema.parse(await this.request(
      `/studies/${encodeURIComponent(studyId)}/state`,
    ))
  }

  subscribeRoomState(
    roomId: string,
    sessionId: string | null,
    userId: string | null,
    listener: MatchRoomEventListener,
    options: MatchRoomStateSubscriptionOptions = {},
  ): MatchRoomStateSubscription {
    const query = new URLSearchParams()
    if (sessionId) query.set('sessionId', sessionId)
    if (userId) query.set('userId', userId)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const socket = new WebSocket(
      this.getWebSocketUrl(`/rooms/${encodeURIComponent(roomId)}/events${suffix}`),
    )
    socket.addEventListener('message', (event) => {
      listener(parseMatchRoomEvent(event.data as string))
    })
    socket.addEventListener('open', () => {
      options.onOpen?.()
    })
    socket.addEventListener('close', () => {
      options.onError?.()
    })
    socket.addEventListener('error', () => {
      options.onError?.()
    })
    return {
      clearPendingAction() {
        sendRoomClientEvent(socket, { type: 'clear-pending-action' })
      },
      sendPendingAction(moves) {
        sendRoomClientEvent(socket, { type: 'pending-action', moves })
      },
      unsubscribe() {
        socket.close()
      },
    }
  }

  subscribeStudyState(
    studyId: string,
    userId: string | null,
    listener: StudyRoomEventListener,
    options: MatchRoomStateSubscriptionOptions = {},
  ): StudyRoomStateSubscription {
    const query = new URLSearchParams()
    if (userId) query.set('userId', userId)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const socket = new WebSocket(
      this.getWebSocketUrl(`/studies/${encodeURIComponent(studyId)}/events${suffix}`),
    )
    socket.addEventListener('message', (event) => {
      listener(parseStudyRoomEvent(event.data as string))
    })
    socket.addEventListener('open', () => {
      options.onOpen?.()
    })
    socket.addEventListener('close', () => {
      options.onError?.()
    })
    socket.addEventListener('error', () => {
      options.onError?.()
    })
    return {
      sendCommand(baseVersion, command) {
        sendStudyClientEvent(socket, { type: 'command', baseVersion, command })
      },
      sendPresence(cursor, mode, followingUserId, focusedBoard) {
        sendStudyClientEvent(socket, {
          type: 'presence',
          cursor,
          ...(focusedBoard ? { focusedBoard } : {}),
          mode,
          ...(followingUserId ? { followingUserId } : {}),
        })
      },
      sendChatMessage(text) {
        sendStudyClientEvent(socket, { type: 'chat-message', text })
      },
      unsubscribe() {
        socket.close()
      },
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(this.getUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    if (! response.ok) {
      const message = await readErrorMessage(response)
      throw new Error(message || `${response.status} ${response.statusText}`)
    }
    return await response.json() as unknown
  }

  private getUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  private getWebSocketUrl(path: string): string {
    const url = new URL(this.getUrl(path))
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  }
}

function sendRoomClientEvent(socket: WebSocket, event: MatchRoomClientEvent) {
  if (socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(event))
}

function sendStudyClientEvent(socket: WebSocket, event: StudyRoomClientEvent) {
  if (socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(event))
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json() as Partial<{ error: unknown }>
    return typeof data.error === 'string' ? data.error : ''
  }
  catch {
    return ''
  }
}
