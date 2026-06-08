<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { Player } from '@5dcol/core'
import type { Action } from '@5dcol/core'
import { DEFAULT_MATCH_ROOM_SETTINGS, type MatchGameState, type MatchPresence, type MatchRoomSettings, type MatchRoomStatus } from '@5dcol/backend/protocol'

import { Color4 } from '@engine/basic'
import { Animations, ButtonColors, Colors, Sizes, type ButtonColorPreset } from '@engine/constant'
import { Game, type GameExportRequest, type GameRecordAction, type GameRecordMoveSegment, type GameStatusView, type GameToolbarButton } from '@engine/game'
import { isModifierKeyEvent, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState } from '@engine/gameState'
import { Logger, type GameMessage } from '@engine/logger'
import { MatchClient, type MatchServerState } from '@engine/matchClient'
import { CanvasRenderer } from '@engine/canvas/renderer'
import { type LoopingSound, SoundManager } from '@engine/sound'
import { createTranslator, getStoredLanguage, LANGUAGES, storeLanguage, type Language } from '@/i18n'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

const canvas = useTemplateRef('canvas')

const SETTINGS_STORAGE_KEY = '5dcol.settings'
const MATCH_ROOM_SETTINGS_STORAGE_KEY = '5dcol.matchRoomSettings'
const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundVolume: 1,
  autoSwitchViewPlayer: true,
  showMoveTravelAnimation: true,
  showOpponentMoveRange: true,
}

const messages = reactive<GameMessage[]>([])
const toolbarButtons = ref<GameToolbarButton[]>([])
const gameStatus = ref<GameStatusView>({
  kind: 'turn',
  player: Player.W,
  color: Color4.toRgbaString(Colors.BoardBorderWhite),
  shadowColor: Color4.toRgbaString(Colors.BoardBorderBlack),
  ended: false,
})
const language = ref<Language>(getStoredLanguage())
const recordPanelOpen = ref(false)
const recordText = ref('')
const recordActions = ref<GameRecordAction[]>([])
const recordHasPendingMoves = ref(false)
const recordCurrentActionIndex = ref(0)
const recordHoveredActionIndex = ref<number | null>(null)
const secondaryMenuOpen = ref(false)
const dialogMode = ref<'none' | 'language' | 'help' | 'settings' | 'import' | 'export'>('none')
const importText = ref('')
const importError = ref('')
const exportText = ref('')
const exportHasPendingMoves = ref(false)
const exportCopyStatus = ref('')
const loading = ref(true)
const loadingError = ref('')
const requiredAssetsReady = ref(false)
const textureLoadProgress = ref({ completed: 0, total: 0 })
const soundLoadProgress = ref({ completed: 0, total: 0 })
const gameStarted = ref(false)
const hasSavedGame = ref(false)
const mainMenuMode = ref<'home' | 'match'>('home')
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const manualMatchServerAddress = ref('')
const matchRoomName = ref('')
const matchNickname = ref(getStoredMatchNickname())
const matchPrivateRoomPassword = ref('')
const matchRoomSettings = reactive<MatchRoomSettings>(getStoredMatchRoomSettings())
const DEFAULT_SERVERS: Record<string, { name: string }> = {
  'http://localhost:5161': { name: 'Debug Server' },
  'https://genshin.asm.ms:5161': { name: 'Server (China)' },
}
const DEFAULT_SERVER_IDS = new Set(Object.keys(DEFAULT_SERVERS))
const expandedMatchServerIds = reactive(new Set(DEFAULT_SERVER_IDS))
const matchServers = reactive<MatchServerState[]>(Object
  .entries(DEFAULT_SERVERS)
  .map(([address, { name }]) => ({
    id: address,
    address,
    name,
    status: 'idle',
    rooms: [],
    error: '',
  }))
)
const onlineSession = ref<StoredOnlineSession | null>(getStoredOnlineSession())
const onlineRoomStatus = ref<MatchRoomStatus | null>(null)
const onlineRoomSettings = ref<MatchRoomSettings | null>(null)
const onlineRoomReady = ref(false)
const onlinePlayer = ref<Player | null>(null)
const onlinePresence = ref<MatchPresence | null>(null)
const onlineConnectionStatus = ref<OnlineConnectionStatus>('offline')
const onlineError = ref('')
const onlineRecoveryError = ref('')
const viewPlayer = ref<Player>(getStoredViewPlayer() ?? Player.W)
const gameSettings = reactive<GameSettings>(getStoredGameSettings())
const logger = new Logger(messages)
let game: Game | null = null
let canvasRenderer: CanvasRenderer | null = null
let soundManager: SoundManager | null = null
let ambienceLoop: LoopingSound | null = null
let matchRefreshTimer: number | null = null
let onlinePollTimer: number | null = null
let onlineReconnectTimer: number | null = null
let unsubscribeOnlineRoomState: (() => void) | null = null
let onlineRoomStateSubscriptionActive = false

const query = new URLSearchParams(window.location.search)
const ONLINE_SESSION_STORAGE_KEY = '5dcol.onlineSession'
const MATCH_NICKNAME_STORAGE_KEY = '5dcol.matchNickname'
const VIEW_PLAYER_STORAGE_KEY = '5dcol.viewPlayer'
const DOCUMENT_TITLE = document.title
const MATCH_REFRESH_INTERVAL_MS = 5000
const ONLINE_RECONNECT_DELAY_MS = 1000

interface StoredOnlineSession {
  serverAddress: string
  roomId: string
  roomName: string
  sessionId: string
}
type OnlineConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting'
interface GameSettings {
  soundVolume: number
  autoSwitchViewPlayer: boolean
  showMoveTravelAnimation: boolean
  showOpponentMoveRange: boolean
}
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves'])
const recordActionButtonIds = new Set(['import-5dpgn', 'export-5dpgn'])
const t = computed(() => createTranslator(language.value))
const gameStatusText = computed(() => {
  if (gameStatus.value.kind === 'stalemate') return t.value('status.stalemate')

  const player = gameStatus.value.player === Player.B
    ? t.value('player.black')
    : t.value('player.white')
  const owner = ! onlineSession.value || gameStatus.value.player === onlinePlayer.value
    ? t.value('status.owner.your')
    : t.value('status.owner.their')
  return t.value(
    gameStatus.value.kind === 'checkmate' ? 'status.checkmate' : 'status.turn',
    { owner, player },
  )
})
const onlineStatusText = computed(() => {
  if (! gameStarted.value || ! onlineSession.value || onlinePlayer.value === null) return ''

  if (onlineError.value) {
    return t.value('online.error', { message: onlineError.value })
  }
  if (onlineRoomStatus.value === 'finished') {
    return t.value('online.finished')
  }
  if (onlineConnectionStatus.value === 'offline' || onlinePresence.value?.self === 'offline') {
    return t.value('online.youOffline')
  }
  if (onlineRoomReady.value && onlinePresence.value?.opponent !== 'online') {
    return t.value('online.opponentOffline')
  }
  if (! onlineRoomReady.value) {
    return t.value('online.waiting')
  }
  switch (onlineConnectionStatus.value) {
    case 'connecting':
      return t.value('online.connecting')
    case 'reconnecting':
      return t.value('online.reconnecting')
    case 'connected':
      return t.value('online.playingAs')
  }
})
const shouldMarkTitleForTurn = computed(() => (
  gameStarted.value
  && ! gameStatus.value.ended
  && onlineSession.value !== null
  && onlinePlayer.value !== null
  && gameStatus.value.player === onlinePlayer.value
))
const languageOptions = computed(() => LANGUAGES.map(value => ({
  value,
  label: t.value(`language.${value}`),
})))

const primaryButtons = computed(() => (
  toolbarButtons.value.filter(button => primaryButtonIds.has(button.id))
))
const secondaryButtons = computed(() => (
  toolbarButtons.value.filter(button => ! primaryButtonIds.has(button.id))
))
const recordActionButtons = computed(() => (
  secondaryButtons.value.filter(button => recordActionButtonIds.has(button.id))
))
const menuButtons = computed(() => (
  secondaryButtons.value.filter(button => ! recordActionButtonIds.has(button.id))
))
const uiOverlayOpen = computed(() => (
  secondaryMenuOpen.value || dialogMode.value !== 'none' || ! gameStarted.value
))
const recordHeaders = computed(() => (
  recordText.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('['))
))
const recordRows = computed(() => recordActions.value)
const viewButtonPreset = computed(() => (
  gameStarted.value && viewPlayer.value === Player.B
    ? ButtonColors.Black
    : ButtonColors.White
))
const viewHoverButtonPreset = computed(() => (
  viewPlayer.value === Player.B ? ButtonColors.GreenBlack : ButtonColors.GreenWhite
))
const menuButtonStyle = computed(() => getPresetButtonStyle(
  viewButtonPreset.value,
  viewHoverButtonPreset.value,
))
const mainMenuStartText = computed(() => (
  hasSavedGame.value ? t.value('main.resume') : t.value('main.start')
))
const mainMenuLayout = computed(() => getMainMenuLayout(viewportWidth.value, viewportHeight.value))
const mainArrowGeometry = computed(() => getMainArrowGeometry(
  mainMenuLayout.value.arrowWidth,
  mainMenuLayout.value.arrowHeight,
  mainMenuLayout.value.arrowBorderWidth,
))
const mainArrowStyle = computed(() => ({
  left: `${mainMenuLayout.value.centerX - mainMenuLayout.value.arrowWidth / 2}px`,
  top: `${mainMenuLayout.value.areaTop}px`,
  width: `${mainMenuLayout.value.arrowWidth}px`,
  height: `${mainMenuLayout.value.arrowHeight}px`,
}))
const uiStyle = computed(() => {
  const menuCardPreset = viewButtonPreset.value
  return {
  '--button-width': `${Sizes.ButtonWidth}px`,
  '--secondary-button-width': `${Sizes.SecondaryButtonWidth}px`,
  '--record-panel-width': `${Sizes.RecordPanelWidth}px`,
  '--button-circle-size': `${Sizes.ButtonHeight}px`,
  '--button-height': `${Sizes.ButtonHeight}px`,
  '--button-top': `${Sizes.ButtonTop}px`,
  '--button-shadow-offset': `${Sizes.ButtonShadowOffset}px`,
  '--small-button-shadow-offset': `${Sizes.SmallButtonShadowOffset}px`,
  '--button-border': `${Sizes.ButtonBorder}px`,
  '--button-font-size': `${Sizes.ButtonFontSize}px`,
  '--button-icon-size': `${Sizes.ButtonIconSize}px`,
  '--button-content-gap': `${Sizes.ButtonContentGap}px`,
  '--button-shadow-color': Color4.toRgbaString(Colors.Shadow),
  '--button-pulse-duration': `${Animations.PulseEffectDuration * 2}ms`,
  '--overlay-mask-color': Color4.toRgbaString(Colors.OverlayMask),
  '--menu-card-border-color': Color4.toRgbaString(menuCardPreset.border),
  '--menu-card-fill-color': Color4.toRgbaString(menuCardPreset.fill),
  '--record-white-bg': Color4.toRgbaString(ButtonColors.White.border),
  '--record-white-text': Color4.toRgbaString(ButtonColors.White.text),
  '--record-black-bg': Color4.toRgbaString(ButtonColors.Black.fill),
  '--record-black-text': Color4.toRgbaString(ButtonColors.Black.text),
  '--game-status-color': gameStatus.value.color,
  '--game-status-shadow-color': gameStatus.value.shadowColor,
  '--main-title-color': Color4.toRgbaString(Colors.BoardBorderWhite),
  '--main-title-shadow-color': Color4.toRgbaString(Colors.Shadow),
  '--main-arrow-fill-color': Color4.toRgbaString(Colors.Purple),
  '--main-arrow-border-color': Color4.toRgbaString(Colors.PurpleDark),
  '--main-arrow-border-width': `${mainMenuLayout.value.arrowBorderWidth}px`,
  '--main-menu-center-x': `${mainMenuLayout.value.centerX}px`,
  '--main-menu-title-left': `${mainMenuLayout.value.titleLeft}px`,
  '--main-menu-title-top': `${mainMenuLayout.value.titleTop}px`,
  '--main-title-primary-size': `${mainMenuLayout.value.titlePrimarySize}px`,
  '--main-title-secondary-size': `${mainMenuLayout.value.titleSecondarySize}px`,
  '--main-title-primary-shadow-x': `${mainMenuLayout.value.titlePrimaryShadowX}px`,
  '--main-title-primary-shadow-y': `${mainMenuLayout.value.titlePrimaryShadowY}px`,
  '--main-title-secondary-shadow-x': `${mainMenuLayout.value.titleSecondaryShadowX}px`,
  '--main-title-secondary-shadow-y': `${mainMenuLayout.value.titleSecondaryShadowY}px`,
  '--main-menu-button-width': `${mainMenuLayout.value.buttonWidth}px`,
  '--main-menu-button-height': `${mainMenuLayout.value.buttonHeight}px`,
  '--main-menu-button-font-size': `${mainMenuLayout.value.buttonFontSize}px`,
  '--main-menu-button-gap': `${mainMenuLayout.value.buttonGap}px`,
  '--main-menu-buttons-top': `${mainMenuLayout.value.buttonsTop}px`,
  }
})

interface MainMenuLayout {
  areaLeft: number
  areaTop: number
  areaWidth: number
  areaHeight: number
  scale: number
  centerX: number
  titleLeft: number
  titleTop: number
  titlePrimarySize: number
  titleSecondarySize: number
  titlePrimaryShadowX: number
  titlePrimaryShadowY: number
  titleSecondaryShadowX: number
  titleSecondaryShadowY: number
  buttonWidth: number
  buttonHeight: number
  buttonFontSize: number
  buttonGap: number
  buttonsTop: number
  arrowWidth: number
  arrowHeight: number
  arrowBorderWidth: number
}

const MAIN_MENU_BASE_WIDTH = 1536
const MAIN_MENU_BASE_HEIGHT = 960
const MAIN_MENU_BASE_LAYOUT: MainMenuLayout = {
  areaLeft: 0,
  areaTop: 0,
  areaWidth: MAIN_MENU_BASE_WIDTH,
  areaHeight: MAIN_MENU_BASE_HEIGHT,
  scale: 1,
  centerX: 210,
  titleLeft: 42,
  titleTop: 34,
  titlePrimarySize: 200,
  titleSecondarySize: 80,
  titlePrimaryShadowX: 4,
  titlePrimaryShadowY: 4,
  titleSecondaryShadowX: 2,
  titleSecondaryShadowY: 2,
  buttonWidth: 220,
  buttonHeight: Sizes.ButtonHeight,
  buttonFontSize: Sizes.ButtonFontSize,
  buttonGap: Sizes.ButtonContentGap * 1.5,
  buttonsTop: 430,
  arrowWidth: 300,
  arrowHeight: 945,
  arrowBorderWidth: 4,
}

function getMainMenuLayout(width: number, height: number): MainMenuLayout {
  const scale = Math.min(
    1,
    width / MAIN_MENU_BASE_WIDTH,
    height / MAIN_MENU_BASE_HEIGHT,
  )
  return scaleMainMenuLayout(MAIN_MENU_BASE_LAYOUT, scale)
}

function scaleMainMenuLayout(
  layout: MainMenuLayout,
  scale: number,
): MainMenuLayout {
  return {
    areaLeft: 0,
    areaTop: 0,
    areaWidth: layout.areaWidth * scale,
    areaHeight: layout.areaHeight * scale,
    scale,
    centerX: layout.centerX * scale,
    titleLeft: layout.titleLeft * scale,
    titleTop: layout.titleTop * scale,
    titlePrimarySize: layout.titlePrimarySize * scale,
    titleSecondarySize: layout.titleSecondarySize * scale,
    titlePrimaryShadowX: layout.titlePrimaryShadowX * scale,
    titlePrimaryShadowY: layout.titlePrimaryShadowY * scale,
    titleSecondaryShadowX: layout.titleSecondaryShadowX * scale,
    titleSecondaryShadowY: layout.titleSecondaryShadowY * scale,
    buttonWidth: layout.buttonWidth * scale,
    buttonHeight: layout.buttonHeight * scale,
    buttonFontSize: layout.buttonFontSize * scale,
    buttonGap: layout.buttonGap * scale,
    buttonsTop: layout.buttonsTop * scale,
    arrowWidth: layout.arrowWidth * scale,
    arrowHeight: layout.arrowHeight * scale,
    arrowBorderWidth: layout.arrowBorderWidth * scale,
  }
}

function getMainArrowGeometry(outerWidth: number, outerHeight: number, borderWidth: number) {
  const inset = borderWidth / 2
  const width = Math.max(0, outerWidth - inset * 2)
  const height = Math.max(0, outerHeight - inset * 2)
  const center = inset + width / 2
  const top = inset
  const bottom = inset + height
  const headHeight = Math.min(width * 0.45, height)
  const headTop = bottom - headHeight
  const shaftHalfWidth = width * 0.22
  const headHalfWidth = headHeight
  const points = [
    [center - shaftHalfWidth, top],
    [center + shaftHalfWidth, top],
    [center + shaftHalfWidth, headTop],
    [center + headHalfWidth, headTop],
    [center, bottom],
    [center - headHalfWidth, headTop],
    [center - shaftHalfWidth, headTop],
  ]
  return {
    viewBox: `0 0 ${outerWidth} ${outerHeight}`,
    points: points.map(point => point.join(',')).join(' '),
  }
}

function getPresetButtonStyle(
  preset: ButtonColorPreset,
  hoverPreset: ButtonColorPreset = ButtonColors.GreenWhite,
) {
  const colors = {
    border: Color4.toRgbaString(preset.border),
    fill: Color4.toRgbaString(preset.fill),
    text: Color4.toRgbaString(preset.text),
  }
  const hoverColors = {
    border: Color4.toRgbaString(hoverPreset.border),
    fill: Color4.toRgbaString(hoverPreset.fill),
    text: Color4.toRgbaString(hoverPreset.text),
  }

  return {
    '--button-border-color': colors.border,
    '--button-fill-color': colors.fill,
    '--button-text-color': colors.text,
    '--button-hover-border-color': hoverColors.border,
    '--button-hover-fill-color': hoverColors.fill,
    '--button-hover-text-color': hoverColors.text,
    '--button-pulse-border-color': hoverColors.border,
    '--button-pulse-fill-color': hoverColors.fill,
    '--button-pulse-text-color': hoverColors.text,
  }
}

function getButtonStyle(button: GameToolbarButton) {
  return {
    '--button-border-color': button.colors.border,
    '--button-fill-color': button.colors.fill,
    '--button-text-color': button.colors.text,
    '--button-hover-border-color': button.hoverColors.border,
    '--button-hover-fill-color': button.hoverColors.fill,
    '--button-hover-text-color': button.hoverColors.text,
    '--button-pulse-border-color': button.pulseColors.border,
    '--button-pulse-fill-color': button.pulseColors.fill,
    '--button-pulse-text-color': button.pulseColors.text,
  }
}

function clickToolbarButton(button: GameToolbarButton) {
  if (button.disabled) return
  game?.clickToolbarButton(button.id)
  secondaryMenuOpen.value = false
}

function getButtonText(button: GameToolbarButton): string {
  return t.value(button.labelKey, button.labelParams)
}

function getMatchStatusText(status: MatchServerState['status']) {
  switch (status) {
    case 'idle':
      return t.value('match.status.idle')
    case 'connecting':
      return t.value('match.status.connecting')
    case 'connected':
      return t.value('match.status.connected')
    case 'failed':
      return t.value('match.status.failed')
  }
}

function getMatchRoomStatusText(status: MatchRoomStatus) {
  switch (status) {
    case 'waiting':
      return t.value('match.roomStatus.waiting')
    case 'playing':
      return t.value('match.roomStatus.playing')
    case 'finished':
      return t.value('match.roomStatus.finished')
  }
}

function getSortedMatchRooms(server: MatchServerState) {
  return [...server.rooms].sort((a, b) => (
    getMatchRoomSortRank(a.status) - getMatchRoomSortRank(b.status)
      || b.updatedAt - a.updatedAt
  ))
}

function getMatchRoomSortRank(status: MatchRoomStatus) {
  switch (status) {
    case 'waiting':
      return 0
    case 'playing':
      return 1
    case 'finished':
      return 2
  }
}

function getMatchRoomMeta(room: MatchServerState['rooms'][number]) {
  return t.value('match.roomMeta', {
    id: getShortMatchRoomId(room.id),
    date: getMatchRoomDate(room),
    actions: String(room.actionCount),
    players: getMatchRoomPlayerLabel(room),
    status: getMatchRoomStatusText(room.status),
  })
}

function getSavedOnlineGameMeta(session: StoredOnlineSession) {
  const room = getStoredOnlineSessionRoom(session)
  return t.value('match.savedGameMeta', {
    players: room
      ? getMatchRoomPlayerLabel(room)
      : t.value('match.playersVersus', {
          player1: t.value('match.anonymous'),
          player2: '?',
        }),
    date: room ? getMatchRoomDate(room) : '-',
    actions: room ? String(room.actionCount) : '-',
  })
}

function getSavedOnlineGameTitle(session: StoredOnlineSession) {
  return t.value('match.savedGame', {
    room: session.roomName,
  })
}

function getStoredOnlineSessionRoom(session: StoredOnlineSession) {
  return matchServers
    .find(server => server.address === session.serverAddress)
    ?.rooms.find(room => room.id === session.roomId)
    ?? null
}

function getMatchRoomDate(room: MatchServerState['rooms'][number]) {
  return new Date(room.startedAt ?? room.createdAt).toLocaleDateString()
}

function getMatchRoomPlayerLabel(room: MatchServerState['rooms'][number]) {
  const [player1, player2] = room.seats
  const left = getMatchRoomSeatLabel(player1)
  const right = player2 ? getMatchRoomSeatLabel(player2) : '?'
  return t.value('match.playersVersus', { player1: left, player2: right })
}

function getMatchRoomSeatLabel(seat: MatchServerState['rooms'][number]['seats'][number]) {
  return seat?.nickname || t.value('match.anonymous')
}

function getShortMatchRoomId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id
}

function getMatchServerDisplayAddress(server: MatchServerState) {
  return server.address.replace(/^https?:\/\//, '')
}

function isManualMatchServer(server: MatchServerState) {
  return ! DEFAULT_SERVER_IDS.has(server.id)
}

function isMatchServerExpanded(server: MatchServerState) {
  return expandedMatchServerIds.has(server.id)
}

function toggleMatchServerExpanded(server: MatchServerState) {
  playUISound()
  if (expandedMatchServerIds.has(server.id)) {
    expandedMatchServerIds.delete(server.id)
  }
  else {
    expandedMatchServerIds.add(server.id)
  }
}

function addManualMatchServer() {
  const address = normalizeMatchServerAddress(manualMatchServerAddress.value)
  if (! address) return

  playUISound()
  manualMatchServerAddress.value = ''
  const existing = matchServers.find(server => server.address === address)
  if (existing) {
    expandedMatchServerIds.add(existing.id)
    void connectMatchServer(existing)
    return
  }

  const server: MatchServerState = {
    id: address,
    address,
    status: 'idle',
    name: '',
    rooms: [],
    error: '',
  }
  matchServers.push(server)
  expandedMatchServerIds.add(server.id)
  void connectMatchServer(server)
}

function removeManualMatchServer(server: MatchServerState) {
  if (! isManualMatchServer(server)) return

  playUISound()
  const index = matchServers.findIndex(item => item.id === server.id)
  if (index >= 0) matchServers.splice(index, 1)
  expandedMatchServerIds.delete(server.id)
}

function normalizeMatchServerAddress(address: string) {
  const trimmed = address.trim()
  if (! trimmed) return ''
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
}

function updateRecord(request: GameExportRequest) {
  recordText.value = request.text
  recordActions.value = request.actions
  recordHasPendingMoves.value = request.hasPendingMoves
  recordCurrentActionIndex.value = request.currentActionIndex
  if (
    recordHoveredActionIndex.value !== null
    && ! request.actions.some(action => action.index === recordHoveredActionIndex.value)
  ) {
    recordHoveredActionIndex.value = null
  }
}

function updateGameStatus(status: GameStatusView) {
  gameStatus.value = status
}

function toggleRecordPanel() {
  if (! gameStarted.value) return
  playUISound()
  if (! recordPanelOpen.value) {
    const request = game?.getFiveDPGNExport()
    if (request) updateRecord(request)
  }
  recordPanelOpen.value = ! recordPanelOpen.value
}

function clickRecordMenuButton() {
  toggleRecordPanel()
  secondaryMenuOpen.value = false
}

function focusRecordSegment(segment: GameRecordMoveSegment) {
  if (! gameStarted.value) return
  playUISound()
  game?.focusBoard(segment.l, segment.m)
}

function getRecordMarker(action: GameRecordAction) {
  if (! onlineSession.value && recordHoveredActionIndex.value === action.index) return '@'
  return action.index === recordCurrentActionIndex.value - 1 ? '*' : ''
}

function rollbackToRecordAction(action: GameRecordAction) {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  playUISound()
  game?.rollbackToActionEnd(action.index + 1)
}

function toggleSecondaryMenu() {
  if (! gameStarted.value) return
  playUISound()
  secondaryMenuOpen.value = ! secondaryMenuOpen.value
}

function closeSecondaryMenu() {
  if (secondaryMenuOpen.value) playUISound()
  secondaryMenuOpen.value = false
}

function openLanguageDialog() {
  playUISound()
  secondaryMenuOpen.value = false
  dialogMode.value = 'language'
}

function openHelpDialog() {
  playUISound()
  dialogMode.value = 'help'
}

function openSettingsDialog() {
  playUISound()
  secondaryMenuOpen.value = false
  dialogMode.value = 'settings'
}

function openGitHub() {
  playUISound()
  window.open('https://github.com/ForkKILLET/5dcol', '_blank', 'noopener,noreferrer')
}

function openMatchPage() {
  playUISound()
  mainMenuMode.value = 'match'
  onlineRecoveryError.value = ''
  void connectMatchServers()
  startMatchServerRefresh()
}

function clickRecoverOnlineSession() {
  playUISound()
  void recoverOnlineSession()
}

function forgetOnlineSession() {
  playUISound()
  onlineRecoveryError.value = ''
  clearStoredOnlineSession()
}

function closeMatchPage() {
  playUISound()
  stopMatchServerRefresh()
  mainMenuMode.value = 'home'
}

async function connectMatchServers() {
  await Promise.all(matchServers.map(server => connectMatchServer(server)))
}

async function connectMatchServer(server: MatchServerState) {
  if (server.status === 'connecting') return

  server.status = 'connecting'
  server.error = ''
  try {
    const client = new MatchClient(server.address)
    const [info, rooms] = await Promise.all([
      client.getInfo(),
      client.getRooms(matchPrivateRoomPassword.value),
    ])
    server.name = info.name
    server.rooms = rooms
    server.status = 'connected'
  }
  catch (err) {
    server.rooms = []
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function refreshConnectedMatchServers() {
  await Promise.all(
    matchServers
      .filter(server => server.status === 'connected')
      .map(server => refreshMatchServerRooms(server)),
  )
}

async function refreshMatchServerRooms(server: MatchServerState) {
  try {
    const client = new MatchClient(server.address)
    server.rooms = await client.getRooms(matchPrivateRoomPassword.value)
    server.error = ''
  }
  catch (err) {
    server.rooms = []
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

function startMatchServerRefresh() {
  stopMatchServerRefresh()
  matchRefreshTimer = window.setInterval(() => {
    if (mainMenuMode.value !== 'match' || gameStarted.value) return
    void refreshConnectedMatchServers()
  }, MATCH_REFRESH_INTERVAL_MS)
}

function stopMatchServerRefresh() {
  if (matchRefreshTimer === null) return
  window.clearInterval(matchRefreshTimer)
  matchRefreshTimer = null
}

function clickConnectMatchServer(server: MatchServerState) {
  playUISound()
  void connectMatchServer(server)
}

function clickRefreshMatchServers() {
  playUISound()
  void connectMatchServers()
}

async function createMatchRoom(server: MatchServerState) {
  playUISound()
  if (server.status !== 'connected' || ! canvasRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const state = await client.createRoom({
      name: matchRoomName.value,
      nickname: matchNickname.value,
      password: matchPrivateRoomPassword.value,
      settings: matchRoomSettings,
    })
    storeOnlineSession(server.address, state)
    startOnlineGame(server.address, state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function joinMatchRoom(server: MatchServerState, roomId: string) {
  playUISound()
  if (server.status !== 'connected' || ! canvasRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const state = await client.joinRoom(roomId, {
      nickname: matchNickname.value,
      password: matchPrivateRoomPassword.value,
    })
    storeOnlineSession(server.address, state)
    startOnlineGame(server.address, state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function recoverOnlineSession() {
  const session = onlineSession.value
  if (! session || gameStarted.value || ! canvasRenderer || ! soundManager) return

  onlineRecoveryError.value = ''
  try {
    const client = new MatchClient(session.serverAddress)
    const state = await client.getSession(session.sessionId)
    storeOnlineSession(session.serverAddress, state)
    startOnlineGame(session.serverAddress, state)
  }
  catch (err) {
    onlineRecoveryError.value = err instanceof Error ? err.message : String(err)
  }
}

function selectLanguage(nextLanguage: Language) {
  playUISound()
  language.value = nextLanguage
  storeLanguage(nextLanguage)
  dialogMode.value = 'none'
}

function openImportDialog() {
  playUISound()
  secondaryMenuOpen.value = false
  importText.value = ''
  importError.value = ''
  dialogMode.value = 'import'
}

function openExportDialog(request: GameExportRequest) {
  playUISound()
  secondaryMenuOpen.value = false
  exportText.value = request.text
  exportHasPendingMoves.value = request.hasPendingMoves
  exportCopyStatus.value = ''
  dialogMode.value = 'export'
}

function closeDialog(playSound = true) {
  if (playSound && dialogMode.value !== 'none') playUISound()
  dialogMode.value = 'none'
  importError.value = ''
  exportCopyStatus.value = ''
}

function syncGameInputState() {
  game?.setGameInputDisabled(uiOverlayOpen.value)
}

function getRecordViewportRightInset() {
  if (! recordPanelOpen.value) return 0

  const panelWidth = Math.min(
    Sizes.RecordPanelWidth,
    Math.max(0, window.innerWidth - Sizes.ButtonTop * 2),
  )
  return panelWidth + Sizes.ButtonTop + Sizes.ButtonShadowOffset
}

function syncGameViewportInsets() {
  game?.setViewportInsets({
    right: getRecordViewportRightInset(),
  })
}

function handleWindowResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  syncGameViewportInsets()
}

function submitImportDialog() {
  const text = importText.value.trim()
  if (! text) return
  playUISound()

  const error = game?.importFiveDPGNText(text)
  if (error) {
    importError.value = error === 'Failed to import 5dpgn' ? t.value('error.importFailed') : error
    return
  }

  closeDialog(false)
}

async function copyExportText() {
  playUISound()
  exportCopyStatus.value = ''
  try {
    await navigator.clipboard.writeText(exportText.value)
    exportCopyStatus.value = t.value('export.copied')
  }
  catch {
    exportCopyStatus.value = t.value('export.copyManual')
  }
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (! loading.value && ! gameStarted.value) startAmbience()

  if (e.key === 'Escape') {
    e.preventDefault()
    if (dialogMode.value !== 'none') closeDialog()
    else if (gameStarted.value) toggleSecondaryMenu()
    return
  }

  if (
    e.repeat
    || ! gameStarted.value
    || isModifierKeyEvent(e)
    || isTextInputEvent(e)
    || dialogMode.value !== 'none'
  ) return

  switch (e.key) {
    case 'r':
      e.preventDefault()
      toggleRecordPanel()
      break
  }
}

function toggleViewPlayer() {
  game?.toggleViewPlayer()
}

function updateViewPlayer(player: Player) {
  viewPlayer.value = player
  storeViewPlayer(player)
}

function playUISound() {
  soundManager?.play('lightswitch.ogg')
  if (! loading.value && ! gameStarted.value) startAmbience()
}

function enterAfterLoading() {
  if (! requiredAssetsReady.value || loadingError.value) return
  loading.value = false
  playUISound()
  if (! gameStarted.value) startAmbience()
}

function startLocalGame() {
  if (! canvasRenderer || ! soundManager || gameStarted.value) return

  playUISound()
  stopAmbience()
  game = new Game({
    renderer: canvasRenderer,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    onToolbarChange: buttons => {
      toolbarButtons.value = buttons
    },
    onRecordChange: updateRecord,
    onStatusChange: updateGameStatus,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: gameSettings.autoSwitchViewPlayer,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    showOpponentMoveRange: gameSettings.showOpponentMoveRange,
    onViewPlayerChange: updateViewPlayer,
    onImportRequest: openImportDialog,
    onExportRequest: openExportDialog,
    onReturnToMainMenuRequest: returnToMainMenu,
  })
  gameStarted.value = true
  syncGameInputState()
  game.start()
  syncGameViewportInsets()
}

function startOnlineGame(serverAddress: string, state: MatchGameState) {
  if (! canvasRenderer || ! soundManager || ! state.session || gameStarted.value) return

  stopAmbience()
  stopOnlinePolling()
  onlineRoomStatus.value = state.room.status
  onlineRoomSettings.value = state.room.settings
  onlineRoomReady.value = state.room.status === 'playing'
  onlinePlayer.value = state.session.player
  updateViewPlayer(state.session.player)
  onlinePresence.value = state.presence
  onlineConnectionStatus.value = 'connecting'
  onlineError.value = ''
  game = new Game({
    renderer: canvasRenderer,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    initialActions: state.actions,
    localPlayer: state.session.player,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: gameSettings.autoSwitchViewPlayer,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    showOpponentMoveRange: getEffectiveShowOpponentMoveRange(state.room.settings),
    canControlOnlineGame: () => onlineRoomReady.value,
    isExternallyFinished: () => onlineRoomStatus.value === 'finished',
    onToolbarChange: buttons => {
      toolbarButtons.value = buttons
    },
    onRecordChange: updateRecord,
    onStatusChange: updateGameStatus,
    onViewPlayerChange: updateViewPlayer,
    onImportRequest: openImportDialog,
    onExportRequest: openExportDialog,
    onReturnToMainMenuRequest: returnToMainMenu,
    onActionSubmitted: action => {
      void submitOnlineAction(serverAddress, state.session!.roomId, state.session!.id, action)
    },
  })
  gameStarted.value = true
  mainMenuMode.value = 'home'
  stopMatchServerRefresh()
  syncGameInputState()
  game.start()
  syncGameViewportInsets()
  startOnlineRoomStateSubscription(serverAddress, state.session.roomId, state.session.id)
  startOnlinePolling(serverAddress, state.session.roomId, state.session.id)
}

function applyOnlineGameState(
  serverAddress: string,
  state: MatchGameState,
  { force = false }: { force?: boolean } = {},
) {
  const wasReady = onlineRoomReady.value
  onlineRoomStatus.value = state.room.status
  onlineRoomSettings.value = state.room.settings
  onlineRoomReady.value = state.room.status === 'playing'
  if (gameStarted.value && ! wasReady && onlineRoomReady.value) {
    soundManager?.play('bell.ogg')
  }
  if (state.session) onlinePlayer.value = state.session.player
  onlinePresence.value = state.presence
  onlineError.value = ''
  if (state.session) storeOnlineSession(serverAddress, state)
  game?.setShowOpponentMoveRange(getEffectiveShowOpponentMoveRange(state.room.settings))
  game?.loadActions(state.actions, {
    focus: false,
    force,
    animate: state.room.settings.showOpponentSmallMoves,
  })
}

async function submitOnlineAction(
  serverAddress: string,
  roomId: string,
  sessionId: string,
  action: Action,
) {
  try {
    const client = new MatchClient(serverAddress)
    const state = await client.submitAction(roomId, { sessionId, action })
    applyOnlineGameState(serverAddress, state)
  }
  catch (err) {
    onlineError.value = err instanceof Error ? err.message : String(err)
    logger.error(onlineError.value)
    await syncOnlineGameState(serverAddress, roomId, sessionId, { force: true })
  }
}

function startOnlineRoomStateSubscription(serverAddress: string, roomId: string, sessionId: string) {
  stopOnlineRoomStateSubscription()
  onlineRoomStateSubscriptionActive = true
  const client = new MatchClient(serverAddress)
  unsubscribeOnlineRoomState = client.subscribeRoomState(
    roomId,
    sessionId,
    state => applyOnlineGameState(serverAddress, state),
    {
      onOpen: () => {
        onlineConnectionStatus.value = 'connected'
      },
      onError: () => {
        if (! onlineRoomStateSubscriptionActive) return
        onlineConnectionStatus.value = 'reconnecting'
        scheduleOnlineRoomStateReconnect(serverAddress, roomId, sessionId)
      },
    },
  )
}

function stopOnlineRoomStateSubscription() {
  onlineRoomStateSubscriptionActive = false
  stopOnlineReconnect()
  unsubscribeOnlineRoomState?.()
  unsubscribeOnlineRoomState = null
}

function scheduleOnlineRoomStateReconnect(serverAddress: string, roomId: string, sessionId: string) {
  if (onlineReconnectTimer !== null) return
  onlineReconnectTimer = window.setTimeout(() => {
    onlineReconnectTimer = null
    if (! onlineRoomStateSubscriptionActive) return
    startOnlineRoomStateSubscription(serverAddress, roomId, sessionId)
  }, ONLINE_RECONNECT_DELAY_MS)
}

function stopOnlineReconnect() {
  if (onlineReconnectTimer === null) return
  window.clearTimeout(onlineReconnectTimer)
  onlineReconnectTimer = null
}

function startOnlinePolling(serverAddress: string, roomId: string, sessionId: string) {
  stopOnlinePolling()
  onlinePollTimer = window.setInterval(() => {
    void syncOnlineGameState(serverAddress, roomId, sessionId)
  }, 8000)
}

function stopOnlinePolling() {
  if (onlinePollTimer === null) return
  window.clearInterval(onlinePollTimer)
  onlinePollTimer = null
}

async function syncOnlineGameState(
  serverAddress: string,
  roomId: string,
  sessionId: string,
  options: { force?: boolean } = {},
) {
  try {
    const client = new MatchClient(serverAddress)
    const state = await client.getRoomState(roomId, sessionId)
    applyOnlineGameState(serverAddress, state, options)
  }
  catch (err) {
    if (onlineConnectionStatus.value !== 'connected') {
      onlineConnectionStatus.value = 'reconnecting'
    }
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

async function forfeitOnlineRoom(session: StoredOnlineSession) {
  try {
    const client = new MatchClient(session.serverAddress)
    await client.forfeitRoom(session.roomId, { sessionId: session.sessionId })
  }
  catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

async function leaveWaitingOnlineRoom(session: StoredOnlineSession) {
  try {
    const client = new MatchClient(session.serverAddress)
    await client.leaveRoom(session.roomId, { sessionId: session.sessionId })
  }
  catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

function refreshSavedGameState() {
  hasSavedGame.value = getHasSavedGame()
}

function getHasSavedGame() {
  const storage = getLocalStorage()
  if (! storage) return false

  try {
    const raw = storage.getItem(GAME_STORAGE_KEY)
    if (! raw) return false
    return isStoredGameState(JSON.parse(raw))
  }
  catch {
    return false
  }
}

function getStoredOnlineSession(): StoredOnlineSession | null {
  const storage = getLocalStorage()
  if (! storage) return null

  try {
    const raw = storage.getItem(ONLINE_SESSION_STORAGE_KEY)
    if (! raw) return null
    const value = JSON.parse(raw) as Partial<StoredOnlineSession>
    if (
      typeof value.serverAddress !== 'string'
      || typeof value.roomId !== 'string'
      || typeof value.roomName !== 'string'
      || typeof value.sessionId !== 'string'
    ) return null
    return value as StoredOnlineSession
  }
  catch {
    return null
  }
}

function getStoredMatchNickname(): string {
  const storage = getLocalStorage()
  if (! storage) return ''

  try {
    return storage.getItem(MATCH_NICKNAME_STORAGE_KEY) ?? ''
  }
  catch {
    return ''
  }
}

function getStoredViewPlayer(): Player | null {
  const storage = getLocalStorage()
  if (! storage) return null

  try {
    const value = storage.getItem(VIEW_PLAYER_STORAGE_KEY)
    if (value === 'white') return Player.W
    if (value === 'black') return Player.B
    return null
  }
  catch {
    return null
  }
}

function getStoredGameSettings(): GameSettings {
  const storage = getLocalStorage()
  if (! storage) return { ...DEFAULT_GAME_SETTINGS }

  try {
    const value = JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Partial<GameSettings>
    return {
      soundVolume: getValidVolume(value.soundVolume),
      autoSwitchViewPlayer: getValidBoolean(value.autoSwitchViewPlayer, DEFAULT_GAME_SETTINGS.autoSwitchViewPlayer),
      showMoveTravelAnimation: getValidBoolean(value.showMoveTravelAnimation, DEFAULT_GAME_SETTINGS.showMoveTravelAnimation),
      showOpponentMoveRange: getValidBoolean(value.showOpponentMoveRange, DEFAULT_GAME_SETTINGS.showOpponentMoveRange),
    }
  }
  catch {
    return { ...DEFAULT_GAME_SETTINGS }
  }
}

function getValidVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : DEFAULT_GAME_SETTINGS.soundVolume
}

function getValidBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function getStoredMatchRoomSettings(): MatchRoomSettings {
  const storage = getLocalStorage()
  if (! storage) return { ...DEFAULT_MATCH_ROOM_SETTINGS }

  try {
    const value = JSON.parse(storage.getItem(MATCH_ROOM_SETTINGS_STORAGE_KEY) ?? '{}') as Partial<MatchRoomSettings>
    return getValidMatchRoomSettings(value)
  }
  catch {
    return { ...DEFAULT_MATCH_ROOM_SETTINGS }
  }
}

function getValidMatchRoomSettings(value: Partial<MatchRoomSettings>): MatchRoomSettings {
  return {
    canSpectate: getValidBoolean(value.canSpectate, DEFAULT_MATCH_ROOM_SETTINGS.canSpectate),
    creatorPlayer: getValidCreatorPlayer(value.creatorPlayer),
    saveRecordToServer: getValidBoolean(value.saveRecordToServer, DEFAULT_MATCH_ROOM_SETTINGS.saveRecordToServer),
    showOpponentSmallMoves: getValidBoolean(value.showOpponentSmallMoves, DEFAULT_MATCH_ROOM_SETTINGS.showOpponentSmallMoves),
    showOpponentMoveRange: getValidBoolean(value.showOpponentMoveRange, DEFAULT_MATCH_ROOM_SETTINGS.showOpponentMoveRange),
  }
}

function getValidCreatorPlayer(value: unknown): MatchRoomSettings['creatorPlayer'] {
  return value === 'white' || value === 'black' || value === 'random'
    ? value
    : DEFAULT_MATCH_ROOM_SETTINGS.creatorPlayer
}

function storeMatchRoomSettings() {
  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.setItem(MATCH_ROOM_SETTINGS_STORAGE_KEY, JSON.stringify(matchRoomSettings))
  }
  catch {
    // Ignore storage failures; room settings should still apply to newly created rooms.
  }
}

function storeGameSettings() {
  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings))
  }
  catch {
    // Ignore storage failures; settings should still apply for the current session.
  }
}

function syncGameSettings() {
  soundManager?.setVolume(gameSettings.soundVolume)
  game?.setAutoSwitchViewPlayer(gameSettings.autoSwitchViewPlayer)
  game?.setShowMoveTravelAnimation(gameSettings.showMoveTravelAnimation)
  game?.setShowOpponentMoveRange(getEffectiveShowOpponentMoveRange())
}

function getEffectiveShowOpponentMoveRange(settings = onlineRoomSettings.value): boolean {
  return gameSettings.showOpponentMoveRange && (settings?.showOpponentMoveRange ?? true)
}

function storeViewPlayer(player: Player) {
  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.setItem(VIEW_PLAYER_STORAGE_KEY, player === Player.W ? 'white' : 'black')
  }
  catch {
    // Ignore storage failures; view persistence is only a convenience.
  }
}

function storeMatchNickname(nickname: string) {
  const storage = getLocalStorage()
  if (! storage) return

  try {
    const trimmed = nickname.trim()
    if (trimmed) storage.setItem(MATCH_NICKNAME_STORAGE_KEY, trimmed)
    else storage.removeItem(MATCH_NICKNAME_STORAGE_KEY)
  }
  catch {
    // Ignore storage failures; nickname persistence is only a convenience.
  }
}

function storeOnlineSession(serverAddress: string, state: MatchGameState) {
  if (! state.session) return

  const session: StoredOnlineSession = {
    serverAddress,
    roomId: state.session.roomId,
    roomName: state.room.name,
    sessionId: state.session.id,
  }
  onlineSession.value = session

  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.setItem(ONLINE_SESSION_STORAGE_KEY, JSON.stringify(session))
  }
  catch {
    // Losing the session id only affects reconnect; the active match can continue.
  }
}

function clearStoredOnlineSession() {
  onlineSession.value = null

  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.removeItem(ONLINE_SESSION_STORAGE_KEY)
  }
  catch {
    // Ignore storage cleanup failures.
  }
}

function clearSavedGameState() {
  const storage = getLocalStorage()
  if (! storage) return

  try {
    storage.removeItem(GAME_STORAGE_KEY)
  }
  catch {
    // Ignore storage cleanup failures; returning to the main menu should still work.
  }
}

function returnToMainMenu(
  { clearSave = true, forfeit = false }: { clearSave?: boolean, forfeit?: boolean } = {},
) {
  const currentOnlineSession = onlineSession.value
  if (currentOnlineSession && onlineRoomStatus.value === 'waiting') {
    void leaveWaitingOnlineRoom(currentOnlineSession)
    clearStoredOnlineSession()
  }
  else if (clearSave && forfeit && currentOnlineSession && onlineRoomStatus.value !== 'finished') {
    void forfeitOnlineRoom(currentOnlineSession)
  }
  if (clearSave) clearSavedGameState()
  if (clearSave) clearStoredOnlineSession()
  stopMatchServerRefresh()
  stopOnlinePolling()
  stopOnlineRoomStateSubscription()
  onlineRoomStatus.value = null
  onlineRoomSettings.value = null
  onlineRoomReady.value = false
  onlinePlayer.value = null
  onlinePresence.value = null
  onlineConnectionStatus.value = 'offline'
  onlineError.value = ''
  onlineRecoveryError.value = ''
  game?.dispose()
  game = null
  toolbarButtons.value = []
  recordText.value = ''
  recordActions.value = []
  recordHasPendingMoves.value = false
  recordCurrentActionIndex.value = 0
  recordHoveredActionIndex.value = null
  recordPanelOpen.value = false
  secondaryMenuOpen.value = false
  dialogMode.value = 'none'
  gameStarted.value = false
  mainMenuMode.value = 'home'
  refreshSavedGameState()
  syncGameInputState()
  startAmbience()
}

function clickReturnToMainMenuButton() {
  playUISound()
  returnToMainMenu({ clearSave: false })
}

function startAmbience() {
  if (loading.value || gameStarted.value || ambienceLoop || ! soundManager) return
  ambienceLoop = soundManager?.playLoop('ambience.ogg') ?? null
}

function stopAmbience() {
  ambienceLoop?.stop()
  ambienceLoop = null
}

function syncDocumentTitle() {
  document.title = shouldMarkTitleForTurn.value
    ? `* ${DOCUMENT_TITLE}`
    : DOCUMENT_TITLE
}

async function loadOptionalSounds() {
  if (! soundManager) return

  try {
    soundLoadProgress.value = { completed: 0, total: 0 }
    await soundManager.load(logger, progress => {
      soundLoadProgress.value = progress
    }, { optional: true })
    if (! gameStarted.value) startAmbience()
  }
  catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

async function init() {
  try {
    loading.value = true
    loadingError.value = ''
    requiredAssetsReady.value = false
    textureLoadProgress.value = { completed: 0, total: 0 }
    soundLoadProgress.value = { completed: 0, total: 0 }
    soundManager = SoundManager.createSilent()
    syncGameSettings()
    const renderer = await CanvasRenderer.create(canvas.value!, logger, progress => {
      textureLoadProgress.value = progress
    })
    canvasRenderer = renderer
    refreshSavedGameState()
    requiredAssetsReady.value = true
    void loadOptionalSounds()
  }
  catch (err) {
    loadingError.value = t.value('error.loadFailed')
    logger.error(String(err))
    console.error(err)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeyDown)
  window.addEventListener('resize', handleWindowResize)
  void init()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  stopMatchServerRefresh()
  stopOnlinePolling()
  stopOnlineRoomStateSubscription()
  stopAmbience()
  game?.dispose()
  canvasRenderer?.dispose()
  soundManager?.dispose()
  document.title = DOCUMENT_TITLE
})

watch(uiOverlayOpen, syncGameInputState)
watch(recordPanelOpen, syncGameViewportInsets)
watch(matchNickname, storeMatchNickname)
watch(matchRoomSettings, storeMatchRoomSettings, { deep: true })
watch(shouldMarkTitleForTurn, syncDocumentTitle, { immediate: true })
watch(gameSettings, () => {
  storeGameSettings()
  syncGameSettings()
}, { deep: true })
</script>

<template>
  <div class="game">
    <canvas ref="canvas"></canvas>
    <div
      class="ui-layer"
      :data-lang="language"
      :style="uiStyle"
      @mousemove.stop
      @mousedown.stop
      @mouseup.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <section
        v-if="!loading && !gameStarted"
        class="main-menu"
        @pointerdown="startAmbience"
      >
        <svg
          class="main-menu-arrow"
          :viewBox="mainArrowGeometry.viewBox"
          :style="mainArrowStyle"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <polygon :points="mainArrowGeometry.points" />
        </svg>
        <template v-if="mainMenuMode === 'home'">
          <h1 class="main-title">
            <span class="main-title-secondary">The unofficial</span>
            <span class="main-title-primary">5D Chess</span>
            <span class="main-title-secondary">
              With Multiverse Time Travel
              <span class="main-title-online">Online</span>
            </span>
          </h1>
          <div class="main-menu-buttons">
            <GameButton
              class="main-menu-button"
              :style="menuButtonStyle"
              @click="startLocalGame"
            >
              <span>{{ mainMenuStartText }}</span>
            </GameButton>
            <GameButton
              class="main-menu-button"
              :style="menuButtonStyle"
              :badge="onlineSession ? '!' : ''"
              @click="openMatchPage"
            >
              <span>{{ t('main.match') }}</span>
            </GameButton>
            <GameButton
              class="main-menu-button"
              :style="menuButtonStyle"
              @click="openHelpDialog"
            >
              <span>{{ t('main.help') }}</span>
            </GameButton>
            <GameButton
              class="main-menu-button"
              :style="menuButtonStyle"
              @click="openSettingsDialog"
            >
              <span>{{ t('main.settings') }}</span>
            </GameButton>
            <GameButton
              class="main-menu-button"
              :style="menuButtonStyle"
              @click="openGitHub"
            >
              <span>{{ t('main.github') }}</span>
            </GameButton>
          </div>
        </template>
        <div
          v-else
          class="match-card"
          :style="menuButtonStyle"
        >
          <div class="match-card-header">
            <h2 class="dialog-title">{{ t('match.title') }}</h2>
            <div class="match-card-actions">
              <div class="match-control-slot match-control-slot--input match-nickname-slot">
                <input
                  v-model="matchNickname"
                  class="match-server-input"
                  :placeholder="t('match.nicknamePlaceholder')"
                  type="text"
                  spellcheck="false"
                >
              </div>
              <div class="match-control-slot match-control-slot--input match-private-password-slot">
                <input
                  v-model="matchPrivateRoomPassword"
                  class="match-server-input"
                  :placeholder="t('match.privatePasswordPlaceholder')"
                  type="password"
                  autocomplete="off"
                  @keydown.enter.prevent="clickRefreshMatchServers"
                >
              </div>
              <GameButton
                class="match-small-button"
                :style="menuButtonStyle"
                @click="clickRefreshMatchServers"
              >
                <span>{{ t('match.refresh') }}</span>
              </GameButton>
              <GameButton
                class="match-small-button"
                :style="menuButtonStyle"
                @click="closeMatchPage"
              >
                <span>{{ t('button.back') }}</span>
              </GameButton>
            </div>
          </div>
          <div class="match-server-list">
            <section
              v-if="onlineSession"
              class="match-server match-server--saved"
            >
              <div class="match-room">
                <div class="match-room-main">
                  <div class="match-room-name">{{ getSavedOnlineGameTitle(onlineSession) }}</div>
                  <div class="match-room-meta">
                    {{ getSavedOnlineGameMeta(onlineSession) }}
                  </div>
                  <div
                    v-if="onlineRecoveryError"
                    class="match-error"
                  >
                    {{ onlineRecoveryError }}
                  </div>
                </div>
                <div class="match-server-actions">
                  <GameButton
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="clickRecoverOnlineSession"
                  >
                    <span>{{ t('match.continueGame') }}</span>
                  </GameButton>
                  <GameButton
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="forgetOnlineSession"
                  >
                    <span>{{ t('match.forgetSavedGame') }}</span>
                  </GameButton>
                </div>
              </div>
            </section>
            <section class="match-server match-server--manual">
              <div class="match-manual-row">
                <div class="match-control-slot match-control-slot--input">
                  <input
                    v-model="manualMatchServerAddress"
                    class="match-server-input"
                    :placeholder="t('match.serverAddressPlaceholder')"
                    type="text"
                    spellcheck="false"
                    @keydown.enter.prevent="addManualMatchServer"
                  >
                </div>
                <GameButton
                  class="match-small-button"
                  :style="menuButtonStyle"
                  :disabled="manualMatchServerAddress.trim().length === 0"
                  @click="addManualMatchServer"
                >
                  <span>{{ t('match.addServer') }}</span>
                </GameButton>
              </div>
            </section>
            <section
              v-for="server in matchServers"
              :key="server.id"
              class="match-server"
            >
              <div class="match-server-header">
                <GameButton
                  class="match-toggle-button"
                  :style="menuButtonStyle"
                  :aria-label="isMatchServerExpanded(server) ? t('match.collapseServer') : t('match.expandServer')"
                  :aria-expanded="isMatchServerExpanded(server)"
                  @click="toggleMatchServerExpanded(server)"
                >
                  <span>{{ isMatchServerExpanded(server) ? 'v' : '>' }}</span>
                </GameButton>
                <div class="match-server-main">
                  <div class="match-server-address">{{ getMatchServerDisplayAddress(server) }}</div>
                  <div class="match-server-meta">
                    <span
                      class="match-status"
                      :class="`match-status--${server.status}`"
                    >
                      {{ getMatchStatusText(server.status) }}
                    </span>
                    <span v-if="server.name">{{ server.name }}</span>
                  </div>
                </div>
                <div class="match-server-actions">
                  <GameButton
                    v-if="server.status !== 'connected' && server.status !== 'connecting'"
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="clickConnectMatchServer(server)"
                  >
                    <span>{{ t('match.connect') }}</span>
                  </GameButton>
                  <GameButton
                    v-if="isManualMatchServer(server)"
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="removeManualMatchServer(server)"
                  >
                    <span>{{ t('match.removeServer') }}</span>
                  </GameButton>
                </div>
              </div>
              <div
                v-if="server.status === 'connected' && isMatchServerExpanded(server)"
                class="match-room-list"
              >
                <div class="match-room match-room--create">
                  <div class="match-room-main">
                    <div class="match-room-fields">
                      <div class="match-control-slot match-control-slot--input">
                        <input
                          v-model="matchRoomName"
                          class="match-server-input"
                          :placeholder="t('match.roomNamePlaceholder')"
                          type="text"
                          spellcheck="false"
                          @keydown.enter.prevent="createMatchRoom(server)"
                        >
                      </div>
                    </div>
                    <div class="match-room-settings">
                      <label class="match-room-setting match-room-setting--select">
                        <span>{{ t('match.setting.creatorPlayer') }}</span>
                        <select
                          v-model="matchRoomSettings.creatorPlayer"
                          class="match-server-input match-server-select"
                        >
                          <option value="white">{{ t('match.setting.creatorWhite') }}</option>
                          <option value="black">{{ t('match.setting.creatorBlack') }}</option>
                          <option value="random">{{ t('match.setting.creatorRandom') }}</option>
                        </select>
                      </label>
                      <label class="match-room-setting">
                        <input
                          v-model="matchRoomSettings.canSpectate"
                          type="checkbox"
                        >
                        <span>{{ t('match.setting.canSpectate') }}</span>
                      </label>
                      <label class="match-room-setting">
                        <input
                          v-model="matchRoomSettings.saveRecordToServer"
                          type="checkbox"
                        >
                        <span>{{ t('match.setting.saveRecord') }}</span>
                      </label>
                      <label class="match-room-setting">
                        <input
                          v-model="matchRoomSettings.showOpponentSmallMoves"
                          type="checkbox"
                        >
                        <span>{{ t('match.setting.showOpponentSmallMoves') }}</span>
                      </label>
                      <label class="match-room-setting">
                        <input
                          v-model="matchRoomSettings.showOpponentMoveRange"
                          type="checkbox"
                        >
                        <span>{{ t('match.setting.showOpponentMoveRange') }}</span>
                      </label>
                    </div>
                  </div>
                  <GameButton
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="createMatchRoom(server)"
                  >
                    <span>{{ t('match.createRoom') }}</span>
                  </GameButton>
                </div>
                <div
                  v-if="server.rooms.length === 0"
                  class="match-empty"
                >
                  {{ t('match.noRooms') }}
                </div>
                <div
                  v-for="room in getSortedMatchRooms(server)"
                  :key="room.id"
                  class="match-room"
                >
                  <div class="match-room-main">
                    <div class="match-room-name">
                      {{ room.name }}
                      <span
                        v-if="room.private"
                        class="match-room-private"
                      >
                        {{ t('match.privateRoom') }}
                      </span>
                    </div>
                    <div class="match-room-meta">{{ getMatchRoomMeta(room) }}</div>
                  </div>
                  <GameButton
                    v-if="room.status === 'waiting'"
                    class="match-small-button"
                    :style="menuButtonStyle"
                    @click="joinMatchRoom(server, room.id)"
                  >
                    <span>{{ t('match.join') }}</span>
                  </GameButton>
                </div>
              </div>
              <div
                v-else-if="server.status === 'failed' && isMatchServerExpanded(server)"
                class="match-error"
              >
                {{ server.error || t('match.failedMessage') }}
              </div>
            </section>
          </div>
        </div>
      </section>

      <div
        v-if="gameStarted"
        class="toolbar toolbar-primary"
      >
        <GameButton
          v-for="button in primaryButtons"
          :key="button.id"
          :style="getButtonStyle(button)"
          :disabled="button.disabled"
          :pulsing="button.effect === 'pulse'"
          @click="clickToolbarButton(button)"
        >
          <span>{{ getButtonText(button) }}</span>
          <img
            v-if="button.pieceImageUrl"
            class="piece-icon"
            :src="button.pieceImageUrl"
            alt=""
            draggable="false"
          >
        </GameButton>
      </div>

      <div
        class="toolbar toolbar-secondary"
      >
        <GameButton
          class="game-button--circle"
          :style="menuButtonStyle"
          :aria-label="t('dialog.languageTitle')"
          @click="openLanguageDialog"
        >
          <GameIcon name="globe" />
        </GameButton>
        <GameButton
          v-if="gameStarted"
          class="game-button--circle"
          :style="menuButtonStyle"
          :aria-label="t('button.flipView')"
          @click="toggleViewPlayer"
        >
          <GameIcon name="flip" />
        </GameButton>
        <GameButton
          v-if="gameStarted"
          class="game-button--circle"
          :style="menuButtonStyle"
          :aria-label="t('button.menu')"
          :aria-expanded="secondaryMenuOpen"
          @click="toggleSecondaryMenu"
        >
          <GameIcon name="ellipsis" />
        </GameButton>
      </div>

      <div
        v-if="gameStarted"
        class="game-status-stack"
      >
        <div
          v-if="onlineStatusText"
          class="online-status"
        >
          {{ onlineStatusText }}
        </div>
        <div
          class="game-status"
          :class="{ 'game-status--ended': gameStatus.ended }"
        >
          {{ gameStatusText }}
        </div>
      </div>

      <aside
        v-if="gameStarted && recordPanelOpen"
        class="record-panel"
        :style="menuButtonStyle"
        @wheel.stop
      >
        <div class="record-header-bar">
          <h2 class="record-title">{{ t('record.title') }}</h2>
          <div class="record-header-actions">
            <GameButton
              v-for="button in recordActionButtons"
              :key="button.id"
              class="record-header-button"
              :style="menuButtonStyle"
              :disabled="button.disabled"
              :pulsing="button.effect === 'pulse'"
              @click="clickToolbarButton(button)"
            >
              <span>{{ getButtonText(button) }}</span>
            </GameButton>
          </div>
        </div>
        <p
          v-if="recordHasPendingMoves"
          class="record-message"
        >
          {{ t('record.pendingNotRecorded') }}
        </p>
        <div class="record-content">
          <div
            v-if="recordHeaders.length > 0"
            class="record-headers"
          >
            <div
              v-for="header in recordHeaders"
              :key="header"
              class="record-header"
            >
              {{ header }}
            </div>
          </div>
          <div
            v-if="recordRows.length > 0"
            class="record-table"
          >
            <div
              v-for="(row, index) in recordRows"
              :key="`${row.serial}-${index}`"
              class="record-row"
              :class="{
                'record-row--black': row.player === 'b',
                'record-row--white': row.player !== 'b',
              }"
              @mouseenter="recordHoveredActionIndex = row.index"
              @mouseleave="recordHoveredActionIndex = null"
            >
              <span
                class="record-marker"
                @click="rollbackToRecordAction(row)"
              >{{ getRecordMarker(row) }}</span>
              <span class="record-serial">{{ row.serial }}</span>
              <span class="record-action">
                <span
                  v-if="row.clock"
                  class="record-clock"
                >
                  {{ t('record.clock', {
                    elapsed: row.clock.elapsed,
                    total: row.clock.total,
                  }) }}
                </span>
                <span
                  v-for="(move, moveIndex) in row.moves"
                  :key="`${row.serial}-${moveIndex}`"
                  class="record-move"
                >
                  <button
                    v-for="(segment, segmentIndex) in move.segments"
                  :key="`${row.serial}-${moveIndex}-${segmentIndex}`"
                  class="record-segment"
                  type="button"
                  @click.stop="focusRecordSegment(segment)"
                >
                    {{ segment.text }}
                  </button>
                </span>
              </span>
            </div>
          </div>
          <div
            v-else
            class="record-empty"
          >
            {{ t('record.empty') }}
          </div>
        </div>
      </aside>

      <div
        v-if="gameStarted && secondaryMenuOpen"
        class="menu-backdrop"
        @click="closeSecondaryMenu"
      >
        <div
          class="secondary-menu-card"
          @click.stop
        >
          <GameButton
            :style="menuButtonStyle"
            :open="recordPanelOpen"
            :aria-expanded="recordPanelOpen"
            @click="clickRecordMenuButton"
          >
            <span>{{ t('button.record') }}</span>
          </GameButton>
          <GameButton
            :style="menuButtonStyle"
            @click="openSettingsDialog"
          >
            <span>{{ t('main.settings') }}</span>
          </GameButton>
          <GameButton
            :style="menuButtonStyle"
            @click="clickReturnToMainMenuButton"
          >
            <span>{{ t('button.returnToMainMenu') }}</span>
          </GameButton>
          <GameButton
            v-for="button in menuButtons"
            :key="button.id"
            :style="menuButtonStyle"
            :disabled="button.disabled"
            :pulsing="button.effect === 'pulse'"
            @click="clickToolbarButton(button)"
          >
            <span>{{ getButtonText(button) }}</span>
            <img
              v-if="button.pieceImageUrl"
              class="piece-icon"
              :src="button.pieceImageUrl"
              alt=""
              draggable="false"
            >
          </GameButton>
        </div>
      </div>

      <div
        v-if="dialogMode !== 'none'"
        class="dialog-backdrop"
        @click="closeDialog()"
      >
        <div
          v-if="dialogMode === 'language'"
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.languageTitle') }}</h2>
          <div class="language-list">
            <GameButton
              v-for="option in languageOptions"
              :key="option.value"
              class="language-button"
              :style="getPresetButtonStyle(option.value === language ? viewHoverButtonPreset : viewButtonPreset)"
              :open="option.value === language"
              @click="selectLanguage(option.value)"
            >
              <span>{{ option.label }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'settings'"
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.settingsTitle') }}</h2>
          <div class="settings-list">
            <label class="settings-row">
              <span>{{ t('settings.soundVolume') }}</span>
              <input
                v-model.number="gameSettings.soundVolume"
                class="settings-range"
                type="range"
                min="0"
                max="1"
                step="0.01"
              >
            </label>
            <label class="settings-row">
              <span>{{ t('settings.autoSwitchView') }}</span>
              <input
                v-model="gameSettings.autoSwitchViewPlayer"
                class="settings-checkbox"
                type="checkbox"
              >
            </label>
            <label class="settings-row">
              <span>{{ t('settings.travelAnimation') }}</span>
              <input
                v-model="gameSettings.showMoveTravelAnimation"
                class="settings-checkbox"
                type="checkbox"
              >
            </label>
            <label class="settings-row">
              <span>{{ t('settings.opponentMoveRange') }}</span>
              <input
                v-model="gameSettings.showOpponentMoveRange"
                class="settings-checkbox"
                type="checkbox"
              >
            </label>
          </div>
          <div class="dialog-actions">
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'import'"
          class="dialog-card"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.importTitle') }}</h2>
          <textarea
            v-model="importText"
            class="dialog-textarea"
            spellcheck="false"
            autofocus
          ></textarea>
          <p
            class="dialog-message dialog-message-error"
            :class="{ 'dialog-message--empty': !importError }"
            aria-live="polite"
          >
            {{ importError || t('error.importFailed') }}
          </p>
          <div class="dialog-actions">
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.cancel') }}</span>
            </GameButton>
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              :disabled="importText.trim().length === 0"
              @click="submitImportDialog"
            >
              <span>{{ t('button.import') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'export'"
          class="dialog-card"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.exportTitle') }}</h2>
          <p
            v-if="exportHasPendingMoves"
            class="dialog-message"
          >
            {{ t('export.pendingNotExported') }}
          </p>
          <textarea
            v-model="exportText"
            class="dialog-textarea"
            readonly
            spellcheck="false"
          ></textarea>
          <p
            class="dialog-message"
            :class="{ 'dialog-message--empty': !exportCopyStatus }"
            aria-live="polite"
          >
            {{ exportCopyStatus || t('export.copied') }}
          </p>
          <div class="dialog-actions">
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="copyExportText"
            >
              <span>{{ t('button.copy') }}</span>
            </GameButton>
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.helpTitle') }}</h2>
          <div class="help-content">{{ t('dialog.helpText') }}</div>
          <div class="dialog-actions">
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>
      </div>

      <div
        v-if="loading"
        class="dialog-backdrop loading-backdrop"
      >
        <div
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
        >
          <h2 class="dialog-title">{{ t('dialog.loadingTitle') }}</h2>
          <p
            class="dialog-message"
            :class="{ 'dialog-message-error': loadingError }"
            aria-live="polite"
          >
            {{ loadingError || t('dialog.loadingAssets') }}
          </p>
          <div
            v-if="!loadingError"
            class="loading-progress"
            aria-live="polite"
          >
            <div>
              {{ t('dialog.loadingGraphics', {
                completed: String(textureLoadProgress.completed),
                total: String(textureLoadProgress.total),
              }) }}
            </div>
            <div>
              {{ t('dialog.loadingSounds', {
                completed: String(soundLoadProgress.completed),
                total: String(soundLoadProgress.total),
              }) }}
            </div>
          </div>
          <div
            v-if="requiredAssetsReady && !loadingError"
            class="dialog-actions"
          >
            <GameButton
              class="dialog-button"
              :style="menuButtonStyle"
              @click="enterAfterLoading"
            >
              <span>{{ t('button.enterGame') }}</span>
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background-color: #8293b3;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  --latin-serif-font: "Latin Serif", Georgia, 'Times New Roman', serif;
  --cjk-serif-font: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif CN", "Noto Serif SC", "PMingLiU", serif;
  --ui-text-y: 0;
  font-family: var(--latin-serif-font);
}

.ui-layer[data-lang='zh'] {
  --ui-text-y: 1px;
  font-family: var(--latin-serif-font), var(--cjk-serif-font);
}

.toolbar {
  position: absolute;
  display: flex;
  gap: calc(var(--button-content-gap) * 2);
  pointer-events: auto;
}

.main-menu {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background-color: #8293b3;
  pointer-events: auto;
}

.main-menu-arrow {
  position: absolute;
  top: 0;
  display: block;
  opacity: 0.82;
  pointer-events: none;
}

.main-menu-arrow polygon {
  fill: var(--main-arrow-fill-color);
  stroke: var(--main-arrow-border-color);
  stroke-linejoin: miter;
  stroke-width: var(--main-arrow-border-width);
  vector-effect: non-scaling-stroke;
}

.main-title {
  position: absolute;
  left: var(--main-menu-title-left);
  top: var(--main-menu-title-top);
  z-index: 1;
  display: grid;
  gap: clamp(8px, 1.5vh, 18px);
  margin: 0;
  color: var(--main-title-color);
  line-height: 0.9;
  pointer-events: none;
  user-select: none;
}

.main-title-primary {
  display: block;
  color: var(--main-title-color);
  font-size: var(--main-title-primary-size);
  font-weight: 700;
  text-shadow:
    var(--main-title-primary-shadow-x)
    var(--main-title-primary-shadow-y)
    0
    var(--main-title-shadow-color);
}

.main-title-secondary {
  display: block;
  color: var(--main-title-color);
  font-size: var(--main-title-secondary-size);
  font-weight: 400;
  line-height: 1;
  text-shadow:
    var(--main-title-secondary-shadow-x)
    var(--main-title-secondary-shadow-y)
    0
    var(--main-title-shadow-color);
}

.main-title-online {
  color: var(--main-arrow-fill-color);
}

.main-menu-buttons {
  position: absolute;
  left: var(--main-menu-center-x);
  top: var(--main-menu-buttons-top);
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--main-menu-button-gap);
  transform: translateX(-50%);
}

.game-button.main-menu-button {
  width: var(--main-menu-button-width);
  height: var(--main-menu-button-height);
  border-radius: calc(var(--main-menu-button-height) / 2);
  font-size: var(--main-menu-button-font-size);
}

.match-card {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  width: min(760px, calc(100vw - var(--button-top) * 2));
  height: min(620px, calc(100vh - var(--button-top) * 2));
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.match-card-header,
.match-server-header,
.match-room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.match-card-actions {
  flex: 1 1 auto;
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
  justify-content: flex-end;
  min-width: 0;
}

.match-server-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  padding-right: calc(var(--button-content-gap) * 0.5);
  overflow: auto;
}

.match-server {
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  padding: var(--button-content-gap);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
}

.match-server--saved {
  flex: 0 0 auto;
}

.match-manual-row {
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
}

.match-control-slot {
  height: calc(32px + var(--small-button-shadow-offset));
}

.match-control-slot--input {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  min-width: 0;
}

.match-nickname-slot {
  flex: 0 1 190px;
}

.match-private-password-slot {
  flex: 0 1 170px;
}

.match-server-main,
.match-room-main {
  flex: 1 1 auto;
  min-width: 0;
}

.match-server-address,
.match-room-name {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-room-private {
  margin-left: calc(var(--button-content-gap) * 0.75);
  font-size: 12px;
  opacity: 0.72;
}

.match-server-meta,
.match-room-meta,
.match-error,
.match-empty {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.match-server-meta {
  display: flex;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
}

.match-server-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.match-status--connected {
  color: rgb(92, 135, 95);
}

.match-status--failed {
  color: rgb(184, 84, 61);
}

.match-room-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
}

.match-room {
  padding: calc(var(--button-content-gap) * 0.75) 0 0;
}

.match-room:not(:first-child) {
  border-top: 1px solid color-mix(in srgb, var(--button-border-color) 55%, transparent);
}

.match-room--create {
  align-items: baseline;
}

.match-room-fields {
  display: flex;
  gap: var(--button-content-gap);
}

.match-room-settings {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.75) calc(var(--button-content-gap) * 1.5);
  margin-top: calc(var(--button-content-gap) * 0.75);
  font-size: 13px;
  line-height: 1.1;
  opacity: 0.9;
}

.match-room-setting {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.5);
  white-space: nowrap;
}

.match-room-setting input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--button-hover-fill-color);
}

.match-room-setting--select {
  flex: 1 1 160px;
}

.game-button.match-small-button {
  --button-shadow-offset: var(--small-button-shadow-offset);
  flex: 0 0 auto;
  width: auto;
  min-width: 96px;
  height: 32px;
  padding: 0 12px;
  border-width: 2px;
  border-radius: 16px;
  font-size: 16px;
}

.game-button.match-toggle-button {
  --button-shadow-offset: var(--small-button-shadow-offset);
  flex: 0 0 auto;
  width: 32px;
  min-width: 32px;
  height: 32px;
  padding: 0;
  border-width: 2px;
  border-radius: 50%;
  font-size: 18px;
}

.match-server-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 2px solid var(--button-border-color);
  border-radius: 16px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  outline: none;
  box-shadow: var(--small-button-shadow-offset) var(--small-button-shadow-offset) 0 var(--button-shadow-color);
}

.match-server-input:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.match-server-select {
  flex: 0 0 110px;
  height: 24px;
  padding: 0 8px;
  border-width: 1px;
  border-radius: 12px;
  font-size: 13px;
  box-shadow: none;
}

.toolbar-primary {
  top: var(--button-top);
  left: 50%;
  transform: translateX(-50%);
}

.toolbar-secondary {
  right: var(--button-top);
  bottom: var(--button-top);
}

.game-status-stack {
  position: absolute;
  left: var(--button-top);
  bottom: var(--button-top);
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.75);
  max-width: min(720px, calc(100vw - var(--button-top) * 2));
  pointer-events: none;
  user-select: none;
}

.game-status,
.online-status {
  color: var(--game-status-color);
  line-height: 1.1;
  text-shadow:
    0 2px 7px var(--game-status-shadow-color),
    0 0 3px var(--game-status-shadow-color);
}

.game-status {
  max-width: min(560px, calc(100vw - var(--button-top) * 2));
  font-size: var(--button-font-size);
}

.online-status {
  max-width: min(640px, calc(100vw - var(--button-top) * 2));
  font-size: 20px;
}

.game-status--ended {
  max-width: min(720px, calc(100vw - var(--button-top) * 2));
}

.record-panel {
  position: absolute;
  top: var(--button-top);
  right: var(--button-top);
  bottom: calc(var(--button-top) + var(--button-height) + var(--button-shadow-offset) + var(--button-content-gap) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  width: min(var(--record-panel-width), calc(100vw - var(--button-top) * 2));
  padding: calc(var(--button-content-gap) * 3);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  pointer-events: auto;
}

.record-header-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 1.5);
}

.record-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--button-text-color);
  font-size: var(--button-font-size);
  font-weight: 400;
  line-height: 1;
}

.record-header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: calc(var(--button-content-gap) * 0.75);
}

.record-header-button {
  flex: 0 0 auto;
}

.record-message {
  flex: 0 0 auto;
  margin: 0;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.25;
}

.record-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0;
  color: var(--button-text-color);
  font: 18px/1.35 var(--latin-serif-font);
}

.record-headers {
  margin-bottom: calc(var(--button-content-gap) * 2);
  font: 15px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  opacity: 0.75;
}

.record-header {
  white-space: pre-wrap;
  word-break: break-word;
}

.record-table {
  display: grid;
  grid-template-columns: 20px max-content minmax(0, 1fr);
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.75);
}

.record-row {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: baseline;
  padding: 2px var(--button-content-gap);
  border-radius: 8px;
  cursor: pointer;
}

.record-row--white {
  background: var(--record-white-bg);
  color: var(--record-white-text);
}

.record-row--black {
  background: var(--record-black-bg);
  color: var(--record-black-text);
}

.record-marker {
  min-width: 20px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}

.record-serial {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.78;
}

.record-action {
  display: grid;
  row-gap: calc(var(--button-content-gap) * 0.35);
  min-width: 0;
}

.record-clock {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.68;
  white-space: nowrap;
}

.record-move {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.5);
  white-space: pre-wrap;
  word-break: break-word;
}

.record-segment {
  margin: 0;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.record-segment:hover,
.record-segment:focus-visible {
  border-color: currentColor;
  outline: none;
}

.record-empty {
  opacity: 0.72;
}

.menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: var(--overlay-mask-color);
  pointer-events: auto;
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: var(--overlay-mask-color);
  pointer-events: auto;
}

.secondary-menu-card {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.dialog-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  width: min(720px, calc(100vw - var(--button-top) * 4));
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  pointer-events: auto;
}

.dialog-card--narrow {
  align-items: center;
  width: fit-content;
  max-width: calc(100vw - var(--button-top) * 4);
}

.dialog-title {
  margin: 0;
  color: var(--button-text-color);
  font-size: var(--button-font-size);
  font-weight: 400;
  line-height: 1;
}

.dialog-textarea {
  min-height: 220px;
  padding: calc(var(--button-content-gap) * 2);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: 18px;
  line-height: 1.35;
  outline: none;
  resize: vertical;
}

.dialog-textarea:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.dialog-message {
  min-height: 1.25em;
  margin: 0;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.25;
}

.dialog-message--empty {
  visibility: hidden;
}

.dialog-message-error {
  color: #9b3a32;
}

.loading-progress {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
  min-width: 220px;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.25;
  opacity: 0.82;
  text-align: center;
}

.help-content {
  max-width: min(620px, calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10));
  max-height: min(58vh, 560px);
  overflow: auto;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.35;
  white-space: pre-line;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 2);
}

.language-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--button-content-gap) * 2);
  width: 100%;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  width: min(360px, calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10));
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 3);
  color: var(--button-text-color);
  font-size: 20px;
  line-height: 1.1;
}

.settings-range {
  width: 150px;
  accent-color: var(--button-hover-fill-color);
}

.settings-checkbox {
  width: 22px;
  height: 22px;
  accent-color: var(--button-hover-fill-color);
}

.language-button {
  width: var(--secondary-button-width);
  max-width: calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10);
}

.toolbar-secondary .game-button {
  width: var(--secondary-button-width);
}

.game-button.game-button--circle {
  width: var(--button-circle-size);
  min-width: var(--button-circle-size);
  padding: 0;
  border-radius: 50%;
}

.secondary-menu-card .game-button {
  width: var(--secondary-button-width);
}

.dialog-button {
  width: var(--secondary-button-width);
}

.record-header-actions .record-header-button {
  width: auto;
  min-width: 58px;
  height: 28px;
  padding: 0 8px;
  border-width: 2px;
  border-radius: 14px;
  font-size: 14px;
}

.game-button:not(:disabled):hover,
.game-button:not(:disabled):focus-visible,
.game-button.is-open {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-button:not(:disabled):active {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
}

.game-button:disabled {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
  cursor: default;
}

.game-button.is-pulsing:not(:hover):not(:focus-visible) {
  animation: button-pulse var(--button-pulse-duration) ease-in-out infinite;
}

.piece-icon {
  display: inline-flex;
  width: var(--button-icon-size);
  height: var(--button-icon-size);
  object-fit: contain;
  pointer-events: none;
}

@keyframes button-pulse {
  0%,
  100% {
    border-color: var(--button-border-color);
    background: var(--button-fill-color);
    color: var(--button-text-color);
  }

  50% {
    border-color: var(--button-pulse-border-color);
    background: var(--button-pulse-fill-color);
    color: var(--button-pulse-text-color);
  }
}

.message-list {
  position: absolute;
  right: 1em;
  top: 1em;
  min-width: 33vw;
  max-width: 66vw;
}

.message.error {
  color: #9b3a32;
}
</style>
