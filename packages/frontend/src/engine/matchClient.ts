import type {
  CreateMatchRoomRequest,
  CreateMatchRoomResponse,
  ForfeitMatchRoomRequest,
  ForfeitMatchRoomResponse,
  GetMatchRoomStateResponse,
  GetMatchSessionResponse,
  JoinMatchRoomResponse,
  JoinMatchRoomRequest,
  LeaveMatchRoomRequest,
  LeaveMatchRoomResponse,
  MatchGameState,
  MatchRoomClientEvent,
  MatchRoomEvent,
  MatchRoomStateEvent,
  MatchRoom,
  MatchRoomsResponse,
  MatchServerInfo,
  SubmitMatchActionRequest,
  SubmitMatchActionResponse,
} from '@5dcol/backend/protocol'
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
    return await this.request<MatchServerInfo>('/health')
  }

  async getRooms(password = ''): Promise<MatchRoom[]> {
    const query = password.trim()
      ? `?password=${encodeURIComponent(password.trim())}`
      : ''
    const response = await this.request<MatchRoomsResponse>(`/rooms${query}`)
    return response.rooms
  }

  async createRoom(request: CreateMatchRoomRequest = {}): Promise<MatchGameState> {
    const response = await this.request<CreateMatchRoomResponse>('/rooms', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    return response.state
  }

  async joinRoom(roomId: string, request: JoinMatchRoomRequest = {}): Promise<MatchGameState> {
    const response = await this.request<JoinMatchRoomResponse>(
      `/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    return response.state
  }

  async getSession(sessionId: string): Promise<MatchGameState> {
    const response = await this.request<GetMatchSessionResponse>(
      `/sessions/${encodeURIComponent(sessionId)}`,
    )
    return response.state
  }

  async getRoomState(roomId: string, sessionId: string): Promise<MatchGameState> {
    const response = await this.request<GetMatchRoomStateResponse>(
      `/rooms/${encodeURIComponent(roomId)}/state?sessionId=${encodeURIComponent(sessionId)}`,
    )
    return response.state
  }

  async submitAction(roomId: string, request: SubmitMatchActionRequest): Promise<MatchGameState> {
    const response = await this.request<SubmitMatchActionResponse>(
      `/rooms/${encodeURIComponent(roomId)}/actions`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    return response.state
  }

  async leaveRoom(roomId: string, request: LeaveMatchRoomRequest): Promise<MatchGameState> {
    const response = await this.request<LeaveMatchRoomResponse>(
      `/rooms/${encodeURIComponent(roomId)}/leave`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    return response.state
  }

  async forfeitRoom(roomId: string, request: ForfeitMatchRoomRequest): Promise<MatchGameState> {
    const response = await this.request<ForfeitMatchRoomResponse>(
      `/rooms/${encodeURIComponent(roomId)}/forfeit`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    return response.state
  }

  subscribeRoomState(
    roomId: string,
    sessionId: string,
    listener: MatchRoomEventListener,
    options: MatchRoomStateSubscriptionOptions = {},
  ): MatchRoomStateSubscription {
    const socket = new WebSocket(
      this.getWebSocketUrl(`/rooms/${encodeURIComponent(roomId)}/events?sessionId=${encodeURIComponent(sessionId)}`),
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    return await response.json() as T
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

function parseMatchRoomEvent(text: string): MatchRoomEvent {
  const data = JSON.parse(text) as MatchRoomEvent | Partial<MatchRoomStateEvent>
  if ('type' in data && data.type) return data as MatchRoomEvent
  return { type: 'state', state: data.state! }
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
