import {
  CreateMatchRoomResponseSchema,
  ForfeitMatchRoomResponseSchema,
  GetMatchRoomStateResponseSchema,
  GetMatchSessionResponseSchema,
  JoinMatchRoomResponseSchema,
  LeaveMatchRoomResponseSchema,
  MatchRoomsResponseSchema,
  MatchServerInfoSchema,
  SubmitMatchActionResponseSchema,
  parseMatchRoomEvent,
} from '@5dcol/shared/protocol'
import type {
  CreateMatchRoomRequest,
  ForfeitMatchRoomRequest,
  JoinMatchRoomRequest,
  LeaveMatchRoomRequest,
  MatchGameState,
  MatchRoomClientEvent,
  MatchRoomEvent,
  MatchRoom,
  MatchServerInfo,
  SubmitMatchActionRequest,
} from '@5dcol/shared/protocol'
import type { Move } from '@5dcol/core'

export type MatchServerConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export interface MatchServerState {
  id: string
  address: string
  status: MatchServerConnectionStatus
  name: string
  rooms: MatchRoom[]
  error: string
}

export type MatchRoomEventListener = (event: MatchRoomEvent) => void
export interface MatchRoomStateSubscriptionOptions {
  onOpen?: () => void
  onError?: () => void
}
export interface MatchRoomStateSubscription {
  clearPendingAction(): void
  sendPendingAction(moves: Move[]): void
  unsubscribe(): void
}

export class MatchClient {
  constructor(
    private readonly baseUrl: string,
  ) {}

  async getInfo(): Promise<MatchServerInfo> {
    return MatchServerInfoSchema.parse(await this.request('/health'))
  }

  async getRooms(password = ''): Promise<MatchRoom[]> {
    const query = password.trim()
      ? `?password=${encodeURIComponent(password.trim())}`
      : ''
    const response = MatchRoomsResponseSchema.parse(await this.request(`/rooms${query}`))
    return response.rooms
  }

  async createRoom(request: CreateMatchRoomRequest = {}): Promise<MatchGameState> {
    const response = CreateMatchRoomResponseSchema.parse(await this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify(request),
    }))
    return response.state
  }

  async joinRoom(roomId: string, request: JoinMatchRoomRequest = {}): Promise<MatchGameState> {
    const response = JoinMatchRoomResponseSchema.parse(await this.request(
      `/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ))
    return response.state
  }

  async getSession(sessionId: string): Promise<MatchGameState> {
    const response = GetMatchSessionResponseSchema.parse(await this.request(
      `/sessions/${encodeURIComponent(sessionId)}`,
    ))
    return response.state
  }

  async getRoomState(roomId: string, options: { sessionId?: string, password?: string } = {}): Promise<MatchGameState> {
    const query = new URLSearchParams()
    if (options.sessionId) query.set('sessionId', options.sessionId)
    if (options.password?.trim()) query.set('password', options.password.trim())
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

  subscribeRoomState(
    roomId: string,
    sessionId: string | null,
    listener: MatchRoomEventListener,
    options: MatchRoomStateSubscriptionOptions = {},
    password = '',
  ): MatchRoomStateSubscription {
    const query = new URLSearchParams()
    if (sessionId) query.set('sessionId', sessionId)
    if (password.trim()) query.set('password', password.trim())
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

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json() as Partial<{ error: unknown }>
    return typeof data.error === 'string' ? data.error : ''
  }
  catch {
    return ''
  }
}
