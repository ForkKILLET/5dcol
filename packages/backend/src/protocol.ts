import type { Action, Player } from '@5dcol/core'

export const MATCH_PROTOCOL_VERSION = 1

export interface MatchServerInfo {
  protocolVersion: typeof MATCH_PROTOCOL_VERSION
  name: string
}

export type MatchRoomStatus = 'waiting' | 'playing' | 'finished'
export type MatchRoomFinishReason = 'checkmate' | 'stalemate' | 'forfeit'
export type MatchPresenceStatus = 'online' | 'offline' | 'none'
export type MatchRoomCreatorPlayer = 'white' | 'black' | 'random'

export interface MatchRoomSettings {
  canSpectate: boolean
  creatorPlayer: MatchRoomCreatorPlayer
  saveRecordToServer: boolean
  showOpponentSmallMoves: boolean
  showOpponentMoveRange: boolean
}

export const DEFAULT_MATCH_ROOM_SETTINGS: MatchRoomSettings = {
  canSpectate: true,
  creatorPlayer: 'white',
  saveRecordToServer: true,
  showOpponentSmallMoves: true,
  showOpponentMoveRange: true,
}

export interface MatchRoomSeat {
  player: Player
  nickname: string | null
}

export interface MatchRoom {
  id: string
  name: string
  players: number
  maxPlayers: number
  seats: [MatchRoomSeat | null, MatchRoomSeat | null]
  status: MatchRoomStatus
  winner: Player | null
  finishReason: MatchRoomFinishReason | null
  settings: MatchRoomSettings
  private: boolean
  createdAt: number
  startedAt: number | null
  updatedAt: number
  actionCount: number
}

export interface MatchClock {
  playerTotalsMs: [number, number]
  turnStartedAt: number | null
  currentPlayer: Player | null
}

export interface MatchSession {
  id: string
  roomId: string
  player: Player
  nickname: string | null
}

export interface MatchPresence {
  self: Exclude<MatchPresenceStatus, 'none'>
  opponent: MatchPresenceStatus
}

export interface MatchGameState {
  room: MatchRoom
  session: MatchSession | null
  presence: MatchPresence | null
  actions: Action[]
  currentPlayer: Player
  clock: MatchClock
  updatedAt: number
}

export interface MatchRoomsResponse {
  rooms: MatchRoom[]
}

export interface MatchRoomsRequestQuery {
  password?: string
}

export interface CreateMatchRoomRequest {
  name?: string
  nickname?: string
  password?: string
  settings?: Partial<MatchRoomSettings>
}

export interface CreateMatchRoomResponse {
  state: MatchGameState
}

export interface JoinMatchRoomRequest {
  nickname?: string
  password?: string
}

export interface JoinMatchRoomResponse {
  state: MatchGameState
}

export interface GetMatchSessionResponse {
  state: MatchGameState
}

export interface GetMatchRoomStateResponse {
  state: MatchGameState
}

export interface SubmitMatchActionRequest {
  sessionId: string
  action: Action
}

export interface SubmitMatchActionResponse {
  state: MatchGameState
}

export interface LeaveMatchRoomRequest {
  sessionId: string
}

export interface LeaveMatchRoomResponse {
  state: MatchGameState
}

export interface ForfeitMatchRoomRequest {
  sessionId: string
}

export interface ForfeitMatchRoomResponse {
  state: MatchGameState
}

export interface MatchRoomStateEvent {
  state: MatchGameState
}

export interface MatchErrorResponse {
  error: string
}
