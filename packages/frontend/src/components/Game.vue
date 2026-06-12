<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { Player } from '@5dcol/core'
import type { Action } from '@5dcol/core'
import {
  DEFAULT_MATCH_ROOM_SETTINGS,
  MATCH_ROOM_SETTINGS_STORAGE_VERSION,
  parseStoredMatchRoomSettings,
  type MatchClock,
  type MatchGameState,
  type MatchPresence,
  type MatchRoom,
  type MatchRoomSettings,
  type MatchRoomStatus,
  type StoredMatchRoomSettings,
} from '@5dcol/shared/protocol'

import { Color4, Scalar } from '@engine/basic'
import { Animations, ButtonColors, Colors, Sizes, type ButtonColorPreset } from '@engine/constant'
import { Game, type GameExportRequest, type GameRecordAction, type GameRecordMoveSegment, type GameStatusView, type GameToolbarButton } from '@engine/game'
import { isModifierKeyEvent, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, isStoredGameState, type StoredGameState } from '@engine/gameState'
import { Logger, type GameMessage } from '@engine/logger'
import { MatchClient, type MatchRoomStateSubscription, type MatchServerState } from '@engine/matchClient'
import { formatDuration } from '@engine/record'
import { type Renderer } from '@engine/renderer'
import {
  createGameRenderer,
  parseRendererPreference,
  parseRendererPreferenceParam,
  type RendererBackend,
  type RendererFallbackReason,
  type RendererPreference,
} from '@engine/rendererFactory'
import { type LoopingSound, SoundManager } from '@engine/sound'
import { getDefaultLanguage, isLanguage, LANGUAGES, type Language } from '@/i18n'
import { readStorageJson, removeStorageValue, useStorageReactive, useStorageRef } from '@/composables/storage'
import Card from './Card.vue'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GameSlider from './GameSlider.vue'
import GameTextInput from './GameTextInput.vue'
import GameToggle from './GameToggle.vue'
import { getAssetUrl } from '@engine/assets.ts'

const canvas = useTemplateRef('canvas')
const mainMenuCanvas = useTemplateRef('mainMenuCanvas')

const SETTINGS_STORAGE_KEY = '5dcol.settings'
const MATCH_ROOM_SETTINGS_STORAGE_KEY = '5dcol.matchRoomSettings'
const MATCH_USER_ID_STORAGE_KEY = '5dcol.matchUserId'
const LAST_ONLINE_GAME_STORAGE_KEY = '5dcol.lastOnlineGame'
const MATCH_NICKNAME_STORAGE_KEY = '5dcol.matchNickname'
const VIEW_PLAYER_STORAGE_KEY = '5dcol.viewPlayer'
const LANGUAGE_STORAGE_KEY = '5dcol.language'
const DEFAULT_FIVE_DPGN_SETTINGS: FiveDPGNSettings = {
  includePieceSymbols: false,
  includeTravelMarkers: false,
  includeCaptureMarkers: false,
  includeCheckMarkers: false,
  includePromotionMarkers: false,
}
const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundVolume: 1,
  renderer: 'auto',
  fiveDPGN: DEFAULT_FIVE_DPGN_SETTINGS,
  autoFullscreen: true,
  autoSwitchViewPlayer: true,
  showClock: true,
  showMoveTravelAnimation: true,
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
const language = useStorageRef<Language>(LANGUAGE_STORAGE_KEY, getDefaultLanguage(), {
  parse: raw => isLanguage(raw) ? raw : getDefaultLanguage(),
  serialize: value => value,
})
const recordPanelOpen = ref(false)
const recordText = ref('')
const recordActions = ref<GameRecordAction[]>([])
const recordHasPendingMoves = ref(false)
const recordCurrentActionIndex = ref(0)
const secondaryMenuOpen = ref(false)
const dialogMode = ref<'none' | 'language' | 'help' | 'settings' | 'five-dpgn-settings' | 'import' | 'export' | 'share' | 'shared-room'>('none')
const importText = ref('')
const importError = ref('')
const exportText = ref('')
const exportHasPendingMoves = ref(false)
const exportCopyStatus = ref('')
const shareLink = ref('')
const shareCopyStatus = ref('')
const sharedRoom = ref<SharedRoomState | null>(null)
const loading = ref(true)
const loadingError = ref('')
const requiredAssetsReady = ref(false)
const textureLoadProgress = ref({ completed: 0, total: 0 })
const soundLoadProgress = ref({ completed: 0, total: 0 })
const activeRendererBackend = ref<RendererBackend | null>(null)
const rendererFallbackReason = ref<RendererFallbackReason | null>(null)
const gameStarted = ref(false)
const hasSavedGame = ref(false)
const mainMenuMode = ref<'home' | 'match'>('home')
const matchPanelMode = ref<'servers' | 'room-settings'>('servers')
const coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
const initialViewportSize = getViewportSize()
const viewportWidth = ref(initialViewportSize.width)
const viewportHeight = ref(initialViewportSize.height)
const hasCoarsePointer = ref(coarsePointerQuery.matches)
let mainVortexCycle = 0
let mainMenuFrameTime = performance.now()
const mainMenuFlyingPieces = ref<MainMenuFlyingPiece[]>([])
const mainMenuAnnihilationScore = ref(0)
const manualMatchServerAddress = ref('')
const matchRoomName = ref('')
const matchNickname = useStorageRef(MATCH_NICKNAME_STORAGE_KEY, '', {
  parse: raw => raw,
  serialize: value => {
    const trimmed = value.trim()
    return trimmed || null
  },
})
const matchUserId = useStorageRef<string | null>(MATCH_USER_ID_STORAGE_KEY, null, {
  parse: raw => raw || null,
  serialize: value => value,
})
const lastOnlineGame = useStorageRef<StoredOnlineGame | null>(
  LAST_ONLINE_GAME_STORAGE_KEY,
  null,
  {
    parse: raw => parseStoredOnlineGame(JSON.parse(raw) as unknown),
    serialize: game => game ? JSON.stringify(game) : null,
  },
)
const customRoomServerId = ref<string | null>(null)
const matchRoomSettings = useStorageReactive<MatchRoomSettings>(
  MATCH_ROOM_SETTINGS_STORAGE_KEY,
  DEFAULT_MATCH_ROOM_SETTINGS,
  {
    parse: raw => parseStoredMatchRoomSettings(JSON.parse(raw) as unknown).settings,
    serialize: settings => JSON.stringify({
      version: MATCH_ROOM_SETTINGS_STORAGE_VERSION,
      settings: { ...settings },
    } satisfies StoredMatchRoomSettings),
  },
)
const DEFAULT_SERVERS: Record<string, { name: string }> = {
  'https://genshin.asm.ms:5161': { name: 'Server (China)' },
  'http://localhost:5161': { name: 'Debug Server' },
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
const onlineSession = ref<StoredOnlineSession | null>(null)
const onlineRoomRef = ref<StoredOnlineRoom | null>(null)
const onlineRoomStatus = ref<MatchRoomStatus | null>(null)
const onlineRoomSettings = ref<MatchRoomSettings | null>(null)
const onlineRoomReady = ref(false)
const onlinePlayer = ref<Player | null>(null)
const onlinePresence = ref<MatchPresence | null>(null)
const onlineClock = ref<MatchClock | null>(null)
const onlineSpectatorCount = ref(0)
const clockNow = ref(Date.now())
const onlineConnectionStatus = ref<OnlineConnectionStatus>('offline')
const onlineError = ref('')
const documentFocused = ref(document.hasFocus())
const viewPlayer = useStorageRef<Player>(VIEW_PLAYER_STORAGE_KEY, Player.W, {
  parse: raw => raw === 'black' ? Player.B : Player.W,
  serialize: player => player === Player.W ? 'white' : 'black',
})
const gameSettings = useStorageReactive<GameSettings>(
  SETTINGS_STORAGE_KEY,
  DEFAULT_GAME_SETTINGS,
  {
    parse: raw => parseGameSettings(JSON.parse(raw) as Partial<GameSettings>),
  },
)
const logger = new Logger(messages)
let game: Game | null = null
let gameRenderer: Renderer | null = null
let soundManager: SoundManager | null = null
let ambienceLoop: LoopingSound | null = null
let matchRefreshTimer: number | null = null
let onlinePollTimer: number | null = null
let onlineReconnectTimer: number | null = null
let clockTimer: number | null = null
let mainVortexAnimationFrame: number | null = null
let mainVortexAnimationStartedAt = 0
let mainMenuPieceSpawnTimer: number | null = null
let mainMenuFlyingPieceId = 0
let mainMenuSelectedFlyingPieceId: number | null = null
let mainMenuLastVortexBatchCount = 0
const mainMenuPieceImageCache = new Map<string, HTMLImageElement>()
const mainMenuPieceHitMaskCache = new Map<string, MainMenuPieceHitMask | null>()
let mainVortexBufferCanvas: HTMLCanvasElement | null = null
let onlineRoomStateSubscription: MatchRoomStateSubscription | null = null
let onlineRoomStateSubscriptionActive = false
let onlineActionsSignature = ''
let onlineLiveActions: Action[] = []
let pendingLocalActionsSignature = ''
const onlineLiveActionCount = ref(0)
const hasNewLiveActions = ref(false)
const spectatorDeductionStartActionIndex = ref<number | null>(null)

const query = new URLSearchParams(window.location.search)
const DOCUMENT_TITLE = '5D Chess Online'
const ORIGINAL_GAME_TITLE = '5D Chess With Multiverse Time Travel'
const ORIGINAL_GAME_STEAM_URL = 'https://store.steampowered.com/app/1349230/5D_Chess_With_Multiverse_Time_Travel/'
const MATCH_REFRESH_INTERVAL_MS = 5000
const ONLINE_RECONNECT_DELAY_MS = 1000
const MAIN_MENU_PERF_LOG_INTERVAL_FRAMES = 120
const MAIN_MENU_PERF_KEYS = [
  'total',
  'resize',
  'background',
  'geometry',
  'vortex',
  'pieces',
  'arrow',
] as const

type MainMenuPerfKey = typeof MAIN_MENU_PERF_KEYS[number]
type MainMenuFramePerf = Record<MainMenuPerfKey, number>

let mainMenuPerfFrames = 0
let mainMenuPerfTotals = createMainMenuPerfBucket()
let mainMenuPerfMax = createMainMenuPerfBucket()

interface StoredOnlineSession {
  serverAddress: string
  roomId: string
  roomName: string
  sessionId: string
  userId: string
}
interface StoredOnlineGame {
  serverAddress: string
  roomId: string
  roomName: string
  userId: string
  status: MatchRoomStatus
  updatedAt: number
}
interface StoredOnlineRoom {
  serverAddress: string
  roomId: string
  roomName: string
}
interface SharedRoomState {
  server: MatchServerState
  room: MatchRoom | null
  roomId: string
  loading: boolean
  error: string
}
interface SharedRoomHashPayload {
  server: string
  room: string
}
type OnlineConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting'
interface GameSettings {
  soundVolume: number
  renderer: RendererPreference
  fiveDPGN: FiveDPGNSettings
  autoFullscreen: boolean
  autoSwitchViewPlayer: boolean
  showClock: boolean
  showMoveTravelAnimation: boolean
}
interface FiveDPGNSettings {
  includePieceSymbols: boolean
  includeTravelMarkers: boolean
  includeCaptureMarkers: boolean
  includeCheckMarkers: boolean
  includePromotionMarkers: boolean
}
interface RecordRowSection {
  id: string
  kind: 'record' | 'deduction' | 'pending' | 'branch'
  depth: number
  rows: GameRecordAction[]
}
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves', 'return-live-game'])
const recordActionButtonIds = new Set(['import-5dpgn', 'export-5dpgn'])

const { t, locale } = useI18n({ useScope: 'global' })
watch(language, value => {
  locale.value = value
}, { immediate: true })

const gameStatusText = computed(() => {
  if (gameStatus.value.kind === 'stalemate') return t('status.stalemate')

  const player = gameStatus.value.player === Player.B
    ? t('player.black')
    : t('player.white')
  if (onlineRoomStatus.value !== null && onlinePlayer.value === null) {
    return t('status.turnSpectator', { player })
  }
  const owner = ! onlineSession.value || gameStatus.value.player === onlinePlayer.value
    ? t('status.owner.your')
    : t('status.owner.their')
  return t(
    gameStatus.value.kind === 'checkmate' ? 'status.checkmate' : 'status.turn',
    { owner, player },
  )
})
const onlineStatusText = computed(() => {
  if (! gameStarted.value || ! onlineSession.value || onlinePlayer.value === null) return ''

  let status = ''
  if (onlineError.value) {
    status = t('online.error', { message: onlineError.value })
  }
  else if (onlineRoomStatus.value === 'finished') {
    status = t('online.finished')
  }
  else if (onlineConnectionStatus.value === 'offline' || onlinePresence.value?.self === 'offline') {
    status = t('online.youOffline')
  }
  else if (onlineRoomReady.value && onlinePresence.value?.opponent !== 'online') {
    status = t('online.opponentOffline')
  }
  else if (! onlineRoomReady.value) {
    status = t('online.waiting')
  }
  else {
    switch (onlineConnectionStatus.value) {
      case 'connecting':
        status = t('online.connecting')
        break
      case 'reconnecting':
        status = t('online.reconnecting')
        break
      case 'connected':
        status = t('online.playingAs')
        break
    }
  }

  return appendOnlineSpectatorCount(status)
})

function appendOnlineSpectatorCount(status: string) {
  if (! status || onlineSpectatorCount.value <= 0) return status
  return `${status} - ${t('online.spectators', { count: onlineSpectatorCount.value })}`
}

const clockRows = computed(() => {
  if (! gameStarted.value || ! onlineSession.value || ! gameSettings.showClock || ! onlineClock.value) return []

  return [Player.W, Player.B].map((player) => {
    const stepMs = getClockStepMs(onlineClock.value!, player, clockNow.value)
    const totalMs = onlineClock.value!.playerTotalsMs[player] + stepMs
    return {
      player,
      label: player === Player.W ? t('player.white') : t('player.black'),
      step: formatDuration(stepMs),
      total: formatDuration(totalMs),
      active: onlineClock.value!.currentPlayer === player,
    }
  })
})
const shouldMarkTitleForTurn = computed(() => (
  gameStarted.value
  && ! gameStatus.value.ended
  && onlineSession.value !== null
  && onlinePlayer.value !== null
  && gameStatus.value.player === onlinePlayer.value
  && ! documentFocused.value
))
const hasUnfinishedOnlineGame = computed(() => (
  lastOnlineGame.value !== null
  || matchServers.some(server => server.rooms.some(room => room.status !== 'finished' && room.ownSession !== null))
))
const languageOptions = computed(() => LANGUAGES.map(value => ({
  value,
  label: t(`language.${value}`),
})))
const rendererStatusText = computed(() => {
  if (activeRendererBackend.value === 'webgl') return t('settings.rendererStatusWebGL')
  if (rendererFallbackReason.value === 'unsupported') return t('settings.rendererStatusCanvasUnsupported')
  if (rendererFallbackReason.value === 'create-failed') return t('settings.rendererStatusCanvasFailed')
  if (activeRendererBackend.value === 'canvas') return t('settings.rendererStatusCanvas')
  return t('settings.rendererStatusPending')
})

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
const recordSections = computed(() => {
  const sections: RecordRowSection[] = []
  for (const row of recordRows.value) {
    const kind = getRecordSectionKind(row)
    const depth = getRecordSectionDepth(row)
    const last = sections.at(-1)
    if (last && last.kind === kind && last.depth === depth) {
      last.rows.push(row)
      continue
    }
    sections.push({
      id: `${kind}-${depth}-${sections.length}-${row.recordKey ?? row.index}`,
      kind,
      depth,
      rows: [row],
    })
  }
  return sections
})
const isOnlineSpectator = computed(() => onlineRoomStatus.value !== null && onlinePlayer.value === null)
const shouldShowReturnLiveButton = computed(() => (
  isOnlineSpectator.value
  && (
    hasNewLiveActions.value
    || spectatorDeductionStartActionIndex.value !== null
    || recordCurrentActionIndex.value !== onlineLiveActionCount.value
  )
))
const customRoomServer = computed(() => (
  customRoomServerId.value === null
    ? null
    : matchServers.find(server => server.id === customRoomServerId.value) ?? null
))
const viewButtonPreset = computed(() => (
  viewPlayer.value === Player.B
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
  hasSavedGame.value ? t('main.resume') : t('main.start')
))
const mainMenuVisible = computed(() => ! loading.value && ! gameStarted.value)
const mainMenuAnnihilationVisible = computed(() => mainMenuAnnihilationScore.value > 0)
const mainMenuLayout = computed(() => getMainMenuLayout(viewportWidth.value, viewportHeight.value))
const gameButtonScale = computed(() => (
  hasCoarsePointer.value
    ? Math.min(1, Math.max(0.62, viewportHeight.value / 720))
    : 1
))
const uiStyle = computed(() => {
  const menuCardPreset = viewButtonPreset.value
  const buttonScale = gameButtonScale.value
  const scaled = (value: number) => value * buttonScale
  return {
    '--button-width': `${scaled(Sizes.ButtonWidth)}px`,
    '--secondary-button-width': `${scaled(Sizes.SecondaryButtonWidth)}px`,
    '--record-panel-width': `${Sizes.RecordPanelWidth}px`,
    '--button-circle-size': `${scaled(Sizes.ButtonHeight)}px`,
    '--button-height': `${scaled(Sizes.ButtonHeight)}px`,
    '--button-top': `${scaled(Sizes.ButtonTop)}px`,
    '--button-shadow-offset': `${scaled(Sizes.ButtonShadowOffset)}px`,
    '--small-button-shadow-offset': `${scaled(Sizes.SmallButtonShadowOffset)}px`,
    '--button-border': `${scaled(Sizes.ButtonBorder)}px`,
    '--button-font-size': `${scaled(Sizes.ButtonFontSize)}px`,
    '--button-icon-size': `${scaled(Sizes.ButtonIconSize)}px`,
    '--button-content-gap': `${scaled(Sizes.ButtonContentGap)}px`,
    '--app-width': `${viewportWidth.value}px`,
    '--app-height': `${viewportHeight.value}px`,
    '--button-shadow-color': Color4.toRgbaString(Colors.Shadow),
    '--button-pulse-duration': `${Animations.PulseEffectDuration * 2}ms`,
    '--overlay-mask-color': Color4.toRgbaString(Colors.OverlayMask),
    '--menu-card-border-color': Color4.toRgbaString(menuCardPreset.border),
    '--menu-card-fill-color': Color4.toRgbaString(menuCardPreset.fill),
    '--record-white-bg': Color4.toRgbaString(ButtonColors.White.border),
    '--record-white-text': Color4.toRgbaString(ButtonColors.White.text),
    '--record-black-bg': Color4.toRgbaString(Color4.fromRgba(82, 82, 92, 1)),
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
    '--main-title-tertiary-shadow-x': `${mainMenuLayout.value.titleTertiaryShadowX}px`,
    '--main-title-tertiary-shadow-y': `${mainMenuLayout.value.titleTertiaryShadowY}px`,
    '--main-menu-button-width': `${mainMenuLayout.value.buttonWidth}px`,
    '--main-menu-button-height': `${mainMenuLayout.value.buttonHeight}px`,
    '--main-menu-button-font-size': `${mainMenuLayout.value.buttonFontSize}px`,
    '--main-menu-button-gap': `${mainMenuLayout.value.buttonGap}px`,
    '--main-menu-buttons-top': `${mainMenuLayout.value.buttonsTop}px`,
    '--main-menu-disclaimer-left': `${mainMenuLayout.value.disclaimerLeft}px`,
    '--main-menu-disclaimer-top': `${mainMenuLayout.value.disclaimerTop}px`,
    '--main-menu-disclaimer-width': `${mainMenuLayout.value.disclaimerWidth}px`,
    '--main-menu-disclaimer-font-size': `${mainMenuLayout.value.disclaimerFontSize}px`,
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
  titleTertiaryShadowX: number
  titleTertiaryShadowY: number
  buttonWidth: number
  buttonHeight: number
  buttonFontSize: number
  buttonGap: number
  buttonsTop: number
  disclaimerLeft: number
  disclaimerTop: number
  disclaimerWidth: number
  disclaimerFontSize: number
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
  titleTertiaryShadowX: 1,
  titleTertiaryShadowY: 1,
  buttonWidth: 220,
  buttonHeight: Sizes.ButtonHeight,
  buttonFontSize: Sizes.ButtonFontSize,
  buttonGap: Sizes.ButtonContentGap * 1.5,
  buttonsTop: 430,
  disclaimerLeft: 430,
  disclaimerTop: 885,
  disclaimerWidth: 980,
  disclaimerFontSize: 24,
  arrowWidth: 300,
  arrowHeight: 945,
  arrowBorderWidth: 4,
}

const MAIN_VORTEX_CONFIG = {
  centerXRatio: 0.5,
  centerYRatio: 0.51,
  renderScale: 0.5,
  innerRadius: 4,
  outerRadiusScale: 1.65,
  ringCount: 42,
  sectorCount: 8,
  twistPerRing: 0.24,
  direction: 1,
  durationSeconds: 3,
  glowRadiusScale: 0.36,
  glowOpacity: 1,
  layerOpacity: 0.86,
  radiusGrowth: 7.5,
  tileInnerOpacity: 0.24,
  tileOuterOpacity: 0.82,
  tileCoreSkipRadiusScale: 0.055,
  tileCoreFadeRadiusScale: 0.065,
  vignetteRadiusScale: 0.9,
  vignetteOpacity: 0.46,
}

const MAIN_MENU_PIECE_ASSETS = [
  'PW', 'NW', 'BW', 'RW', 'QW', 'KW',
  'PB', 'NB', 'BB', 'RB', 'QB', 'KB',
].map(piece => ({
  key: piece.slice(0, 1),
  player: piece.endsWith('W') ? Player.W : Player.B,
  imageUrl: getAssetUrl(`assets/textures/pieces/${piece}.svg`),
}))

const MAIN_MENU_ANNIHILATION_FADE_MS = 260
const MAIN_MENU_PIECE_HIT_MASK_SIZE = 128
const MAIN_MENU_PIECE_HIT_ALPHA_THRESHOLD = 24

const MAIN_MENU_FLYING_PIECE_CONFIG = {
  maxPieces: 24,
  colorBalanceStrength: 0.12,
  colorBalanceMaxBias: 0.38,
  spawnDelayMinMs: 500,
  spawnDelayMaxMs: 1000,
  durationMinMs: 7500,
  durationMaxMs: 7500,
  centerRadiusMin: 3,
  centerRadiusScale: 0.022,
  screenPlaneDistanceRatioMin: 1.20,
  screenPlaneDistanceRatioMax: 2.00,
  baseSizeScale: 0.05,
  baseSizeMin: 36,
  baseSizeMax: 80,
  startScaleMin: 0.20,
  startScaleMax: 0.28,
  endScaleMin: 20,
  endScaleMax: 30,
  bezierX1: 0.95,
  bezierY1: 0,
  bezierX2: 1,
  bezierY2: 0,
  screenPlaneFadeStart: 0.62,
  spinMinTurns: 0.5,
  spinMaxTurns: 1.0,
}

interface MainMenuFlyingPiece {
  id: number
  key: string
  player: Player
  imageUrl: string
  startedAt: number
  durationMs: number
  baseSize: number
  startX: number
  startY: number
  endX: number
  endY: number
  startScale: number
  endScale: number
  startRotate: number
  endRotate: number
  annihilatedAt: number | null
}

interface MainMenuFlyingPieceFrame {
  x: number
  y: number
  scale: number
  rotate: number
  opacity: number
  visualSize: number
}

interface MainMenuPieceHitMask {
  data: Uint8ClampedArray
  size: number
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
    titleTertiaryShadowX: layout.titleTertiaryShadowX * scale,
    titleTertiaryShadowY: layout.titleTertiaryShadowY * scale,
    buttonWidth: layout.buttonWidth * scale,
    buttonHeight: layout.buttonHeight * scale,
    buttonFontSize: layout.buttonFontSize * scale,
    buttonGap: layout.buttonGap * scale,
    buttonsTop: layout.buttonsTop * scale,
    disclaimerLeft: layout.disclaimerLeft * scale,
    disclaimerTop: layout.disclaimerTop * scale,
    disclaimerWidth: layout.disclaimerWidth * scale,
    disclaimerFontSize: layout.disclaimerFontSize * scale,
    arrowWidth: layout.arrowWidth * scale,
    arrowHeight: layout.arrowHeight * scale,
    arrowBorderWidth: layout.arrowBorderWidth * scale,
  }
}

function getMainArrowPoints(outerWidth: number, outerHeight: number, borderWidth: number): Array<[number, number]> {
  const inset = borderWidth / 2
  const width = Math.max(0, outerWidth - inset * 2)
  const height = Math.max(0, outerHeight - inset * 2)
  const center = inset + width / 2
  const top = - inset
  const bottom = inset + height
  const headHeight = Math.min(width * 0.45, height)
  const headTop = bottom - headHeight
  const shaftHalfWidth = width * 0.22
  const headHalfWidth = headHeight
  const points: Array<[number, number]> = [
    [center - shaftHalfWidth, top],
    [center + shaftHalfWidth, top],
    [center + shaftHalfWidth, headTop],
    [center + headHalfWidth, headTop],
    [center, bottom],
    [center - headHalfWidth, headTop],
    [center - shaftHalfWidth, headTop],
  ]
  return points
}

interface MainVortexTile {
  batchIndex: number
  innerRadius: number
  outerRadius: number
  innerStart: number
  innerEnd: number
  outerStart: number
  outerEnd: number
  tone: 'light' | 'dark'
  opacity: number
}

interface MainVortexTileBatch {
  tone: MainVortexTile['tone']
  opacity: number
  tiles: MainVortexTile[]
}

interface MainVortexGeometry {
  centerX: number
  centerY: number
  glowRadius: number
  vignetteRadius: number
  tiles: MainVortexTile[]
}

function getMainVortexGeometry(width: number, height: number, scale: number, cycle: number): MainVortexGeometry {
  const config = MAIN_VORTEX_CONFIG
  const cycleOffset = Math.floor(cycle)
  const phase = cycle - cycleOffset
  const centerX = width * config.centerXRatio
  const centerY = height * config.centerYRatio
  const maxDistance = Math.hypot(
    Math.max(centerX, width - centerX),
    Math.max(centerY, height - centerY),
  )
  const innerRadius = Math.max(6, config.innerRadius * scale)
  const outerRadius = maxDistance * config.outerRadiusScale
  const ringCount = config.ringCount
  const sectorCount = config.sectorCount
  const sectorStep = Math.PI * 2 / sectorCount
  const twistStep = config.twistPerRing * config.direction
  const coreSkipRadius = Math.min(width, height) * config.tileCoreSkipRadiusScale
  const coreFadeRadius = Math.max(1, Math.min(width, height) * config.tileCoreFadeRadiusScale)
  const tiles: MainVortexTile[] = []
  const ringBuffer = 3

  for (let ring = -ringBuffer; ring < ringCount + ringBuffer; ring ++) {
    const innerCoord = ring + phase
    const outerCoord = ring + 1 + phase
    const innerTwist = innerCoord * twistStep
    const outerTwist = outerCoord * twistStep
    const inner = getVortexRadiusAt(innerRadius, outerRadius, ringCount, config.radiusGrowth, innerCoord)
    const outer = getVortexRadiusAt(innerRadius, outerRadius, ringCount, config.radiusGrowth, outerCoord)
    if (outer <= coreSkipRadius) continue

    const clippedInner = Math.max(inner, coreSkipRadius)
    const innerClipProgress = getVortexRadiusProgress(inner, outer, clippedInner)
    const clippedInnerTwist = Scalar.lerp(innerTwist, outerTwist, innerClipProgress)
    const coreFadeOpacity = smoothStep(Scalar.clamp((outer - coreSkipRadius) / coreFadeRadius, 0, 1))
    const ringOpacity = getVortexTileOpacity(
      (innerCoord + outerCoord) / 2,
      ringCount,
      config.tileInnerOpacity,
      config.tileOuterOpacity,
    ) * coreFadeOpacity
    if (ringOpacity <= 0.001) continue

    for (let sector = 0; sector < sectorCount; sector ++) {
      const innerStart = sector * sectorStep + clippedInnerTwist
      const innerEnd = (sector + 1) * sectorStep + clippedInnerTwist
      const outerStart = sector * sectorStep + outerTwist
      const outerEnd = (sector + 1) * sectorStep + outerTwist
      tiles.push({
        batchIndex: ring,
        innerRadius: clippedInner,
        outerRadius: outer,
        innerStart,
        innerEnd,
        outerStart,
        outerEnd,
        tone: isEven(ring + sector + cycleOffset) ? 'light' : 'dark',
        opacity: ringOpacity,
      })
    }
  }

  return {
    centerX,
    centerY,
    glowRadius: Math.max(width, height) * config.glowRadiusScale,
    vignetteRadius: Math.max(width, height) * config.vignetteRadiusScale,
    tiles,
  }
}

function getVortexRadiusAt(
  innerRadius: number,
  outerRadius: number,
  ringCount: number,
  radiusGrowth: number,
  ringCoord: number,
) {
  const denominator = Math.expm1(radiusGrowth)
  const t = ringCoord / ringCount
  const eased = denominator === 0
    ? t
    : Math.expm1(radiusGrowth * t) / denominator
  return Math.max(0.1, innerRadius + (outerRadius - innerRadius) * eased)
}

function getVortexRadiusProgress(innerRadius: number, outerRadius: number, radius: number) {
  if (outerRadius <= innerRadius) return 0
  if (radius <= innerRadius) return 0
  if (radius >= outerRadius) return 1

  return Math.log(radius / innerRadius) / Math.log(outerRadius / innerRadius)
}

function isEven(value: number) {
  return value % 2 === 0
}

function getVortexTileOpacity(
  ringCoord: number,
  ringCount: number,
  innerOpacity: number,
  outerOpacity: number,
) {
  const t = Math.min(1, Math.max(0, ringCoord / ringCount))
  const eased = Math.sqrt(t)
  return innerOpacity + (outerOpacity - innerOpacity) * eased
}

function addLogSpiralCubicPath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  fromRadius: number,
  fromAngle: number,
  toRadius: number,
  toAngle: number,
) {
  const from = polarPoint(centerX, centerY, fromRadius, fromAngle)
  const to = polarPoint(centerX, centerY, toRadius, toAngle)
  const deltaLogRadius = Math.log(toRadius / fromRadius)
  const deltaAngle = toAngle - fromAngle
  const fromDerivative = getLogSpiralDerivative(fromRadius, fromAngle, deltaLogRadius, deltaAngle)
  const toDerivative = getLogSpiralDerivative(toRadius, toAngle, deltaLogRadius, deltaAngle)
  const controlScale = 1 / 3
  const control1: [number, number] = [
    from[0] + fromDerivative[0] * controlScale,
    from[1] + fromDerivative[1] * controlScale,
  ]
  const control2: [number, number] = [
    to[0] - toDerivative[0] * controlScale,
    to[1] - toDerivative[1] * controlScale,
  ]

  ctx.bezierCurveTo(
    control1[0],
    control1[1],
    control2[0],
    control2[1],
    to[0],
    to[1],
  )
}

function getLogSpiralDerivative(
  radius: number,
  angle: number,
  deltaLogRadius: number,
  deltaAngle: number,
): [number, number] {
  const radiusDerivative = radius * deltaLogRadius
  return [
    radiusDerivative * Math.cos(angle) - radius * deltaAngle * Math.sin(angle),
    radiusDerivative * Math.sin(angle) + radius * deltaAngle * Math.cos(angle),
  ]
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number): [number, number] {
  return [
    centerX + Math.cos(angle) * radius,
    centerY + Math.sin(angle) * radius,
  ]
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
  return t(button.labelKey, button.labelParams)
}

function getMatchStatusText(status: MatchServerState['status']) {
  switch (status) {
    case 'idle':
      return t('match.status.idle')
    case 'connecting':
      return t('match.status.connecting')
    case 'connected':
      return t('match.status.connected')
    case 'failed':
      return t('match.status.failed')
  }
}

function getMatchRoomStatusText(status: MatchRoomStatus) {
  switch (status) {
    case 'waiting':
      return t('match.roomStatus.waiting')
    case 'playing':
      return t('match.roomStatus.playing')
    case 'finished':
      return t('match.roomStatus.finished')
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

function getMatchRoomStatusSuffix(room: MatchServerState['rooms'][number]) {
  return t('match.roomStatusSuffix', {
    date: getMatchRoomDate(room),
    actions: String(room.actionCount),
    status: getMatchRoomStatusText(room.status),
  })
}

function getMatchRoomSettingsMeta(room: MatchServerState['rooms'][number]) {
  return t('match.roomSettingsMeta', {
    settings: getMatchRoomSettingsLabel(room),
  })
}

function getMatchRoomSettingsLabel(room: MatchServerState['rooms'][number]) {
  const enabled = [
    room.private ? t('match.setting.private') : '',
    room.settings.showOpponentMoves ? t('match.setting.liveMoves') : '',
    room.settings.showOpponentMoveRange ? t('match.setting.moveRange') : '',
    room.settings.canReplay ? t('match.setting.replay') : '',
  ].filter(Boolean)

  return enabled.length > 0 ? enabled.join(', ') : t('match.setting.default')
}

function canViewMatchRoom(room: MatchServerState['rooms'][number]) {
  if (! room.settings.canReplay) return false
  if (room.status === 'playing') return true
  return room.status === 'finished'
    && room.settings.saveRecordToServer
    && room.actionCount > 0
}

function getViewMatchRoomLabel(room: MatchServerState['rooms'][number]) {
  return room.status === 'finished'
    ? t('match.replay')
    : t('match.spectate')
}

function getMatchRoomDate(room: MatchServerState['rooms'][number]) {
  return new Date(room.startedAt ?? room.createdAt).toLocaleDateString()
}

function getMatchRoomSeatLabel(seat: MatchServerState['rooms'][number]['seats'][number]) {
  return seat?.nickname || t('match.anonymous')
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
  if (customRoomServerId.value === server.id) customRoomServerId.value = null
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

function toggleClockPanel() {
  if (! gameStarted.value) return
  playUISound()
  gameSettings.showClock = ! gameSettings.showClock
}

function focusRecordSegment(segment: GameRecordMoveSegment) {
  if (! gameStarted.value) return
  playUISound()
  game?.focusBoard(segment.l, segment.m)
}

function isCurrentRecordAction(action: GameRecordAction) {
  return action.current === true
}

function canJumpToRecordAction(action: GameRecordAction) {
  return ! action.pending
    && ! onlineSession.value
    && ! isCurrentRecordAction(action)
}

function canForkRecordAction(action: GameRecordAction) {
  return ! action.pending
    && onlineRoomStatus.value === null
    && typeof action.recordLineId === 'number'
    && typeof action.recordActionIndex === 'number'
}

function getRecordSectionKind(action: GameRecordAction): RecordRowSection['kind'] {
  if (action.pending) return 'pending'
  if ((action.branchDepth ?? 0) > 0) return 'branch'
  return isRecordDeductionAction(action) ? 'deduction' : 'record'
}

function getRecordSectionDepth(action: GameRecordAction) {
  const depth = action.branchDepth ?? 0
  return Math.max(0, depth - 1)
}

function isRecordDeductionAction(action: GameRecordAction) {
  return (
    ! action.pending
    &&
    isOnlineSpectator.value
    && spectatorDeductionStartActionIndex.value !== null
    && action.index >= spectatorDeductionStartActionIndex.value
  )
}

function rollbackToRecordAction(action: GameRecordAction) {
  if (action.pending) return
  if (! gameStarted.value) return
  if (onlineSession.value) return
  playUISound()
  game?.rollbackToRecordActionEnd(action)
}

function startRecordBranch(action: GameRecordAction) {
  if (! gameStarted.value) return
  if (onlineRoomStatus.value !== null) return
  if (game?.startRecordBranchBeforeAction(action)) playUISound()
}

function returnToLiveGame() {
  if (! gameStarted.value || ! isOnlineSpectator.value || ! game) return
  playUISound()

  let returnedToLive = false
  if (game.hasActionPrefix(onlineLiveActions)) {
    returnedToLive = game.rollbackToActionEnd(onlineLiveActionCount.value)
  }
  else {
    game.loadActions(onlineLiveActions, {
      focus: false,
      force: true,
      animate: false,
    })
    returnedToLive = true
  }
  if (! returnedToLive) return

  hasNewLiveActions.value = false
  spectatorDeductionStartActionIndex.value = null
  pendingLocalActionsSignature = ''
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

function openFiveDPGNSettingsDialog() {
  playUISound()
  dialogMode.value = 'five-dpgn-settings'
}

function returnToSettingsDialog() {
  playUISound()
  dialogMode.value = 'settings'
}

function openMatchRoomSettingsDialog() {
  playUISound()
  matchPanelMode.value = 'room-settings'
}

function openGitHub() {
  playUISound()
  window.open('https://github.com/ForkKILLET/5dcol', '_blank', 'noopener,noreferrer')
}

function openMatchPage() {
  playUISound()
  mainMenuMode.value = 'match'
  matchPanelMode.value = 'servers'
  void connectMatchServers()
  startMatchServerRefresh()
}

function closeMatchPage() {
  playUISound()
  stopMatchServerRefresh()
  matchPanelMode.value = 'servers'
  mainMenuMode.value = 'home'
}

function closeMatchRoomSettingsPanel() {
  playUISound()
  matchPanelMode.value = 'servers'
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
      client.getRooms({
        userId: matchUserId.value,
      }),
    ])
    server.name = info.name
    server.rooms = rooms
    server.status = 'connected'
    syncLastOnlineGameFromServer(server)
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
    server.rooms = await client.getRooms({
      userId: matchUserId.value,
    })
    server.error = ''
    syncLastOnlineGameFromServer(server)
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

function openCustomRoomForm(server: MatchServerState) {
  playUISound()
  if (server.status !== 'connected') return
  customRoomServerId.value = server.id
  expandedMatchServerIds.add(server.id)
}

async function createMatchRoom(server: MatchServerState | null = customRoomServer.value) {
  playUISound()
  if (! server) return
  if (server.status !== 'connected' || ! gameRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const response = await client.createRoom({
      userId: matchUserId.value ?? undefined,
      name: matchRoomName.value,
      nickname: matchNickname.value,
      settings: matchRoomSettings,
    })
    matchUserId.value = response.user.id
    storeOnlineSession(server.address, response.state)
    startOnlineGame(server.address, response.state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function joinMatchRoom(server: MatchServerState, roomId: string) {
  playUISound()
  if (server.status !== 'connected' || ! gameRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const response = await client.joinRoom(roomId, {
      userId: matchUserId.value ?? undefined,
      nickname: matchNickname.value,
    })
    matchUserId.value = response.user.id
    storeOnlineSession(server.address, response.state)
    startOnlineGame(server.address, response.state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function viewMatchRoom(server: MatchServerState, room: MatchServerState['rooms'][number]) {
  playUISound()
  if (server.status !== 'connected' || ! gameRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const state = await client.getRoomState(room.id)
    startOnlineGame(server.address, state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function returnToMatchRoom(server: MatchServerState, room: MatchServerState['rooms'][number]) {
  playUISound()
  if (! room.ownSession || gameStarted.value || ! gameRenderer || ! soundManager) return

  try {
    const client = new MatchClient(server.address)
    const state = await client.getSession(room.ownSession.id, room.ownSession.userId)
    storeOnlineSession(server.address, state)
    startOnlineGame(server.address, state)
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function returnToSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room) return
  dialogMode.value = 'none'
  await returnToMatchRoom(state.server, state.room)
}

async function joinSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room) return
  dialogMode.value = 'none'
  await joinMatchRoom(state.server, state.room.id)
}

async function viewSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room) return
  dialogMode.value = 'none'
  await viewMatchRoom(state.server, state.room)
}

function selectLanguage(nextLanguage: Language) {
  playUISound()
  language.value = nextLanguage
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

async function openShareRoomDialog() {
  playUISound()
  secondaryMenuOpen.value = false
  shareCopyStatus.value = ''
  shareLink.value = getCurrentRoomShareLink()
  dialogMode.value = 'share'
  await copyShareLink(false)
}

function closeDialog(playSound = true) {
  if (playSound && dialogMode.value !== 'none') playUISound()
  dialogMode.value = 'none'
  importError.value = ''
  exportCopyStatus.value = ''
  shareCopyStatus.value = ''
}

function syncGameInputState() {
  game?.setGameInputDisabled(uiOverlayOpen.value)
}

function getRecordViewportRightInset() {
  if (! recordPanelOpen.value) return 0

  const panelWidth = Math.min(
    Sizes.RecordPanelWidth,
    Math.max(0, viewportWidth.value - Sizes.ButtonTop * 2),
  )
  return panelWidth + Sizes.ButtonTop + Sizes.ButtonShadowOffset
}

function syncGameViewportInsets() {
  game?.setViewportInsets({
    right: getRecordViewportRightInset(),
  })
}

function getViewportSize() {
  const viewport = window.visualViewport
  return {
    width: Math.ceil(Math.max(
      window.innerWidth,
      viewport?.width ?? 0,
    )),
    height: Math.ceil(Math.max(
      window.innerHeight,
      viewport?.height ?? 0,
    )),
  }
}

function handleWindowResize() {
  const size = getViewportSize()
  const prevWidth = viewportWidth.value
  const prevHeight = viewportHeight.value
  if (size.width !== prevWidth || size.height !== prevHeight) {
    remapMainMenuFlyingPiecesForResize(prevWidth, prevHeight, size.width, size.height)
  }
  viewportWidth.value = size.width
  viewportHeight.value = size.height
  syncGameViewportInsets()
  if (mainMenuVisible.value) drawMainMenuCanvas(mainMenuFrameTime)
}

function remapMainMenuFlyingPiecesForResize(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
) {
  if (oldWidth <= 0 || oldHeight <= 0 || newWidth <= 0 || newHeight <= 0) return
  if (mainMenuFlyingPieces.value.length === 0) return

  const oldCenter = getMainVortexCenter(oldWidth, oldHeight)
  const newCenter = getMainVortexCenter(newWidth, newHeight)
  const scaleX = newWidth / oldWidth
  const scaleY = newHeight / oldHeight
  const oldPieceBaseSize = getMainMenuPieceBaseSize(oldWidth, oldHeight)
  const newPieceBaseSize = getMainMenuPieceBaseSize(newWidth, newHeight)
  const baseSizeScale = oldPieceBaseSize > 0 ? newPieceBaseSize / oldPieceBaseSize : 1

  mainMenuFlyingPieces.value = mainMenuFlyingPieces.value.map(piece => {
    const [startX, startY] = remapMainMenuPointForResize(
      [piece.startX, piece.startY],
      oldCenter,
      newCenter,
      scaleX,
      scaleY,
    )
    const [endX, endY] = remapMainMenuPointForResize(
      [piece.endX, piece.endY],
      oldCenter,
      newCenter,
      scaleX,
      scaleY,
    )

    return {
      ...piece,
      baseSize: piece.baseSize * baseSizeScale,
      startX,
      startY,
      endX,
      endY,
    }
  })
}

function getMainVortexCenter(width: number, height: number): [number, number] {
  return [
    width * MAIN_VORTEX_CONFIG.centerXRatio,
    height * MAIN_VORTEX_CONFIG.centerYRatio,
  ]
}

function getMainMenuPieceBaseSize(width: number, height: number) {
  const config = MAIN_MENU_FLYING_PIECE_CONFIG
  return Math.min(
    config.baseSizeMax,
    Math.max(config.baseSizeMin, Math.min(width, height) * config.baseSizeScale),
  )
}

function remapMainMenuPointForResize(
  point: [number, number],
  oldCenter: [number, number],
  newCenter: [number, number],
  scaleX: number,
  scaleY: number,
): [number, number] {
  return [
    newCenter[0] + (point[0] - oldCenter[0]) * scaleX,
    newCenter[1] + (point[1] - oldCenter[1]) * scaleY,
  ]
}

function handleCoarsePointerChange() {
  hasCoarsePointer.value = coarsePointerQuery.matches
}

function startMainVortexAnimation() {
  if (mainVortexAnimationFrame !== null) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mainMenuFrameTime = performance.now()
    drawMainMenuCanvas(mainMenuFrameTime)
    return
  }

  const durationMs = Math.max(1, MAIN_VORTEX_CONFIG.durationSeconds * 1000)
  mainVortexAnimationStartedAt = performance.now() - mainVortexCycle * durationMs

  const update = (time: number) => {
    const elapsedCycles = (time - mainVortexAnimationStartedAt) / durationMs
    mainMenuFrameTime = time
    mainVortexCycle = elapsedCycles
    drawMainMenuCanvas(time)
    mainVortexAnimationFrame = window.requestAnimationFrame(update)
  }

  mainVortexAnimationFrame = window.requestAnimationFrame(update)
}

function stopMainVortexAnimation() {
  if (mainVortexAnimationFrame === null) return
  window.cancelAnimationFrame(mainVortexAnimationFrame)
  mainVortexAnimationFrame = null
}

function drawMainMenuCanvas(time: number) {
  const totalStartedAt = performance.now()
  const canvas = mainMenuCanvas.value
  if (! canvas || ! mainMenuVisible.value) return

  const width = viewportWidth.value
  const height = viewportHeight.value
  if (width <= 0 || height <= 0) return

  const dpr = window.devicePixelRatio || 1
  const widthDevice = Math.floor(width * dpr)
  const heightDevice = Math.floor(height * dpr)
  if (canvas.width !== widthDevice || canvas.height !== heightDevice) {
    canvas.width = widthDevice
    canvas.height = heightDevice
  }
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const resizedAt = performance.now()

  const ctx = canvas.getContext('2d')
  if (! ctx) return

  mainMenuFrameTime = time
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#7889aa'
  ctx.fillRect(0, 0, width, height)
  const backgroundDrawnAt = performance.now()

  const geometry = getMainVortexGeometry(width, height, mainMenuLayout.value.scale, mainVortexCycle)
  const geometryBuiltAt = performance.now()
  drawMainMenuVortexLayer(ctx, geometry, width, height, dpr)
  const vortexDrawnAt = performance.now()
  drawMainMenuFlyingPieces(ctx)
  const piecesDrawnAt = performance.now()
  if (mainMenuMode.value === 'home') drawMainMenuArrow(ctx, mainMenuLayout.value)
  const arrowDrawnAt = performance.now()

  recordMainMenuFramePerf({
    total: arrowDrawnAt - totalStartedAt,
    resize: resizedAt - totalStartedAt,
    background: backgroundDrawnAt - resizedAt,
    geometry: geometryBuiltAt - backgroundDrawnAt,
    vortex: vortexDrawnAt - geometryBuiltAt,
    pieces: piecesDrawnAt - vortexDrawnAt,
    arrow: arrowDrawnAt - piecesDrawnAt,
  }, {
    width,
    height,
    dpr,
    renderScale: MAIN_VORTEX_CONFIG.renderScale,
    tiles: geometry.tiles.length,
    batches: mainMenuLastVortexBatchCount,
    pieces: mainMenuFlyingPieces.value.length,
  })
}

function createMainMenuPerfBucket(): MainMenuFramePerf {
  return MAIN_MENU_PERF_KEYS.reduce((bucket, key) => {
    bucket[key] = 0
    return bucket
  }, {} as MainMenuFramePerf)
}

function isMainMenuPerfEnabled() {
  return import.meta.env.DEV || query.get('mainMenuPerf') === '1'
}

function recordMainMenuFramePerf(
  perf: MainMenuFramePerf,
  meta: {
    width: number
    height: number
    dpr: number
    renderScale: number
    tiles: number
    batches: number
    pieces: number
  },
) {
  if (! isMainMenuPerfEnabled()) return

  mainMenuPerfFrames += 1
  for (const key of MAIN_MENU_PERF_KEYS) {
    mainMenuPerfTotals[key] += perf[key]
    mainMenuPerfMax[key] = Math.max(mainMenuPerfMax[key], perf[key])
  }

  if (mainMenuPerfFrames < MAIN_MENU_PERF_LOG_INTERVAL_FRAMES) return

  const rows = MAIN_MENU_PERF_KEYS.reduce((table, key) => {
    table[key] = {
      avgMs: Number((mainMenuPerfTotals[key] / mainMenuPerfFrames).toFixed(2)),
      maxMs: Number(mainMenuPerfMax[key].toFixed(2)),
    }
    return table
  }, {} as Record<MainMenuPerfKey, { avgMs: number, maxMs: number }>)

  console.info(
    `[5dcol] main menu canvas perf: ${meta.width}x${meta.height} @${meta.dpr}x, `
    + `${meta.renderScale}x vortex, ${meta.tiles} vortex tiles, ${meta.batches} batches, ${meta.pieces} pieces`,
  )
  console.table(rows)

  mainMenuPerfFrames = 0
  mainMenuPerfTotals = createMainMenuPerfBucket()
  mainMenuPerfMax = createMainMenuPerfBucket()
}

function drawMainMenuVortexLayer(
  ctx: CanvasRenderingContext2D,
  geometry: MainVortexGeometry,
  width: number,
  height: number,
  dpr: number,
) {
  const renderScale = Scalar.clamp(MAIN_VORTEX_CONFIG.renderScale, 0.1, 1)
  if (renderScale >= 0.999) {
    drawMainMenuVortex(ctx, geometry, width, height)
    return
  }

  const buffer = getMainVortexBufferCanvas()
  const bufferWidth = Math.max(1, Math.floor(width * dpr * renderScale))
  const bufferHeight = Math.max(1, Math.floor(height * dpr * renderScale))
  if (buffer.width !== bufferWidth || buffer.height !== bufferHeight) {
    buffer.width = bufferWidth
    buffer.height = bufferHeight
  }

  const bufferCtx = buffer.getContext('2d')
  if (! bufferCtx) {
    drawMainMenuVortex(ctx, geometry, width, height)
    return
  }

  const bufferScale = dpr * renderScale
  bufferCtx.setTransform(bufferScale, 0, 0, bufferScale, 0, 0)
  bufferCtx.clearRect(0, 0, width, height)
  drawMainMenuVortex(bufferCtx, geometry, width, height)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(buffer, 0, 0, width, height)
  ctx.restore()
}

function getMainVortexBufferCanvas() {
  if (mainVortexBufferCanvas) return mainVortexBufferCanvas

  mainVortexBufferCanvas = document.createElement('canvas')
  return mainVortexBufferCanvas
}

function drawMainMenuVortex(
  ctx: CanvasRenderingContext2D,
  geometry: MainVortexGeometry,
  width: number,
  height: number,
) {
  const config = MAIN_VORTEX_CONFIG

  ctx.save()
  ctx.globalAlpha = config.layerOpacity * config.glowOpacity
  const glow = ctx.createRadialGradient(
    geometry.centerX,
    geometry.centerY,
    0,
    geometry.centerX,
    geometry.centerY,
    geometry.glowRadius,
  )
  glow.addColorStop(0, 'rgba(238, 242, 249, 0.96)')
  glow.addColorStop(0.18, 'rgba(219, 228, 241, 0.62)')
  glow.addColorStop(0.62, 'rgba(181, 195, 218, 0.16)')
  glow.addColorStop(1, 'rgba(112, 130, 163, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  ctx.save()
  const batches = getMainVortexTileBatches(geometry.tiles)
  mainMenuLastVortexBatchCount = batches.length
  for (const batch of batches) {
    ctx.globalAlpha = config.layerOpacity * batch.opacity
    ctx.fillStyle = getMainVortexTileFillStyle(batch.tone)
    ctx.beginPath()
    for (const tile of batch.tiles) {
      addVortexTilePath(ctx, geometry.centerX, geometry.centerY, tile)
    }
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = config.layerOpacity
  const vignette = ctx.createRadialGradient(
    geometry.centerX,
    geometry.centerY,
    0,
    geometry.centerX,
    geometry.centerY,
    geometry.vignetteRadius,
  )
  vignette.addColorStop(0, 'rgba(118, 136, 169, 0)')
  vignette.addColorStop(0.56, 'rgba(118, 136, 169, 0)')
  vignette.addColorStop(1, `rgba(55, 68, 96, ${config.vignetteOpacity})`)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function getMainVortexTileBatches(tiles: MainVortexTile[]): MainVortexTileBatch[] {
  const batches: MainVortexTileBatch[] = []
  let lastBatchIndex: number | null = null
  let lightBatch: MainVortexTileBatch | null = null
  let darkBatch: MainVortexTileBatch | null = null

  for (const tile of tiles) {
    if (lastBatchIndex !== tile.batchIndex) {
      lastBatchIndex = tile.batchIndex
      lightBatch = { tone: 'light', opacity: tile.opacity, tiles: [] }
      darkBatch = { tone: 'dark', opacity: tile.opacity, tiles: [] }
      batches.push(lightBatch, darkBatch)
    }

    const batch = tile.tone === 'light' ? lightBatch : darkBatch
    batch?.tiles.push(tile)
  }

  return batches.filter(batch => batch.tiles.length > 0)
}

function getMainVortexTileFillStyle(tone: MainVortexTile['tone']) {
  return tone === 'light'
    ? 'rgba(190, 202, 222, 0.24)'
    : 'rgba(82, 101, 136, 0.18)'
}

function addVortexTilePath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tile: MainVortexTile,
) {
  const innerStartPoint = polarPoint(centerX, centerY, tile.innerRadius, tile.innerStart)
  ctx.moveTo(innerStartPoint[0], innerStartPoint[1])
  addLogSpiralCubicPath(ctx, centerX, centerY, tile.innerRadius, tile.innerStart, tile.outerRadius, tile.outerStart)
  ctx.arc(centerX, centerY, tile.outerRadius, tile.outerStart, tile.outerEnd, false)
  addLogSpiralCubicPath(ctx, centerX, centerY, tile.outerRadius, tile.outerEnd, tile.innerRadius, tile.innerEnd)
  ctx.arc(centerX, centerY, tile.innerRadius, tile.innerEnd, tile.innerStart, true)
  ctx.closePath()
}

function drawMainMenuFlyingPieces(ctx: CanvasRenderingContext2D) {
  const pieces = mainMenuFlyingPieces.value
    .map(piece => ({ piece, frame: getMainMenuFlyingPieceFrame(piece) }))
    .sort((a, b) => a.frame.visualSize - b.frame.visualSize)

  for (const { piece, frame } of pieces) {
    if (frame.opacity <= 0) continue
    const image = getMainMenuPieceImage(piece.imageUrl)
    if (! image.complete || image.naturalWidth <= 0) continue

    ctx.save()
    ctx.globalAlpha = frame.opacity
    ctx.translate(frame.x, frame.y)
    ctx.rotate(frame.rotate * Math.PI / 180)
    ctx.scale(frame.scale, frame.scale)
    ctx.drawImage(image, -piece.baseSize / 2, -piece.baseSize / 2, piece.baseSize, piece.baseSize)
    ctx.restore()
  }
}

function getMainMenuPieceImage(url: string) {
  let image = mainMenuPieceImageCache.get(url)
  if (image) return image

  image = new Image()
  image.decoding = 'async'
  image.onload = () => drawMainMenuCanvas(mainMenuFrameTime)
  image.src = url
  mainMenuPieceImageCache.set(url, image)
  return image
}

function drawMainMenuArrow(ctx: CanvasRenderingContext2D, layout: MainMenuLayout) {
  const points = getMainArrowPoints(layout.arrowWidth, layout.arrowHeight, layout.arrowBorderWidth)
  if (points.length === 0) return

  ctx.save()
  ctx.translate(layout.centerX - layout.arrowWidth / 2, layout.areaTop)
  ctx.globalAlpha = 0.82
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1])
  ctx.closePath()
  ctx.fillStyle = Color4.toRgbaString(Colors.Purple)
  ctx.strokeStyle = Color4.toRgbaString(Colors.PurpleDark)
  ctx.lineJoin = 'miter'
  ctx.lineWidth = layout.arrowBorderWidth
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function startMainMenuFlyingPieces() {
  if (mainMenuPieceSpawnTimer !== null) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (mainMenuMode.value !== 'home') return
  scheduleMainMenuPieceSpawn(160)
}

function stopMainMenuPieceSpawn() {
  if (mainMenuPieceSpawnTimer !== null) {
    window.clearTimeout(mainMenuPieceSpawnTimer)
    mainMenuPieceSpawnTimer = null
  }
}

function stopMainMenuFlyingPieces() {
  stopMainMenuPieceSpawn()
  mainMenuSelectedFlyingPieceId = null
  mainMenuFlyingPieces.value = []
  resetMainMenuAnnihilation()
}

function scheduleMainMenuPieceSpawn(delay = randomBetween(
  MAIN_MENU_FLYING_PIECE_CONFIG.spawnDelayMinMs,
  MAIN_MENU_FLYING_PIECE_CONFIG.spawnDelayMaxMs,
)) {
  if (! mainMenuVisible.value || mainMenuMode.value !== 'home' || mainMenuPieceSpawnTimer !== null) return
  mainMenuPieceSpawnTimer = window.setTimeout(() => {
    mainMenuPieceSpawnTimer = null
    spawnMainMenuFlyingPiece()
    scheduleMainMenuPieceSpawn()
  }, delay)
}

function spawnMainMenuFlyingPiece() {
  if (! mainMenuVisible.value) return
  const config = MAIN_MENU_FLYING_PIECE_CONFIG
  const width = viewportWidth.value
  const height = viewportHeight.value
  const now = performance.now()
  mainMenuFrameTime = now
  const geometry = getMainVortexGeometry(
    width,
    height,
    mainMenuLayout.value.scale,
    mainVortexCycle,
  )
  const startAngle = randomBetween(0, Math.PI * 2)
  const startRadius = Math.sqrt(Math.random()) * Math.max(
    config.centerRadiusMin,
    Math.min(width, height) * config.centerRadiusScale,
  )
  const startX = geometry.centerX + Math.cos(startAngle) * startRadius
  const startY = geometry.centerY + Math.sin(startAngle) * startRadius
  const flyAngle = randomBetween(0, Math.PI * 2)
  const baseSize = getMainMenuPieceBaseSize(width, height)
  const durationMs = randomBetween(config.durationMinMs, config.durationMaxMs)
  const startScale = randomBetween(config.startScaleMin, config.startScaleMax)
  const endScale = randomBetween(config.endScaleMin, config.endScaleMax)
  const edgeDistance = getDistanceToViewportEdge(startX, startY, flyAngle, width, height)
  const endDistance = edgeDistance * randomBetween(
    config.screenPlaneDistanceRatioMin,
    config.screenPlaneDistanceRatioMax,
  )
  const endX = startX + Math.cos(flyAngle) * endDistance
  const endY = startY + Math.sin(flyAngle) * endDistance
  const startRotate = randomBetween(0, 360)
  const spinDirection = Math.random() < 0.5 ? -1 : 1
  const endRotate = startRotate + spinDirection * 360 * randomBetween(config.spinMinTurns, config.spinMaxTurns)
  const asset = getBalancedMainMenuPieceAsset()
  const piece: MainMenuFlyingPiece = {
    id: ++ mainMenuFlyingPieceId,
    key: asset.key,
    player: asset.player,
    imageUrl: asset.imageUrl,
    startedAt: now,
    durationMs,
    baseSize,
    startX,
    startY,
    endX,
    endY,
    startScale,
    endScale,
    startRotate,
    endRotate,
    annihilatedAt: null,
  }

  mainMenuFlyingPieces.value = [
    ...mainMenuFlyingPieces.value.slice(-config.maxPieces + 1),
    piece,
  ]
  window.setTimeout(() => removeMainMenuFlyingPiece(piece.id), durationMs + 100)
}

function getBalancedMainMenuPieceAsset() {
  const livePieces = mainMenuFlyingPieces.value.filter(piece => piece.annihilatedAt === null)
  const whiteCount = livePieces.filter(piece => piece.player === Player.W).length
  const blackCount = livePieces.length - whiteCount
  const whiteProbability = Scalar.clamp(
    0.5 + (blackCount - whiteCount) * MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceStrength,
    0.5 - MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceMaxBias,
    0.5 + MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceMaxBias,
  )
  const player = Math.random() < whiteProbability ? Player.W : Player.B
  const assets = MAIN_MENU_PIECE_ASSETS.filter(asset => asset.player === player)
  return assets[Math.floor(Math.random() * assets.length)] ?? MAIN_MENU_PIECE_ASSETS[0]
}

function removeMainMenuFlyingPiece(id: number) {
  mainMenuFlyingPieces.value = mainMenuFlyingPieces.value.filter(piece => piece.id !== id)
  if (mainMenuSelectedFlyingPieceId === id) mainMenuSelectedFlyingPieceId = null
}

function handleMainMenuCanvasPointerDown(event: PointerEvent) {
  startAmbience()
  const canvas = mainMenuCanvas.value
  if (! canvas) return

  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const piece = pickMainMenuFlyingPiece(x, y)
  if (! piece) {
    updateMainMenuCanvasCursorAt(x, y)
    return
  }

  playUISound()
  clickMainMenuFlyingPiece(piece)
  updateMainMenuCanvasCursorAt(x, y)
}

function handleMainMenuCanvasPointerMove(event: PointerEvent) {
  const canvas = mainMenuCanvas.value
  if (! canvas) return

  const rect = canvas.getBoundingClientRect()
  updateMainMenuCanvasCursorAt(event.clientX - rect.left, event.clientY - rect.top)
}

function handleMainMenuCanvasPointerLeave() {
  if (! mainMenuCanvas.value) return
  mainMenuCanvas.value.style.cursor = ''
}

function updateMainMenuCanvasCursorAt(x: number, y: number) {
  const canvas = mainMenuCanvas.value
  if (! canvas) return

  canvas.style.cursor = pickMainMenuFlyingPiece(x, y) ? 'pointer' : ''
}

function pickMainMenuFlyingPiece(x: number, y: number): MainMenuFlyingPiece | null {
  const candidates = mainMenuFlyingPieces.value
    .filter(piece => piece.annihilatedAt === null)
    .map(piece => ({ piece, frame: getMainMenuFlyingPieceFrame(piece) }))
    .filter(({ frame }) => frame.opacity > 0.18)
    .sort((a, b) => b.frame.visualSize - a.frame.visualSize)

  for (const { piece, frame } of candidates) {
    if (isPointInMainMenuFlyingPiece(x, y, piece, frame)) return piece
  }

  return null
}

function isPointInMainMenuFlyingPiece(
  x: number,
  y: number,
  piece: MainMenuFlyingPiece,
  frame: MainMenuFlyingPieceFrame,
) {
  const dx = x - frame.x
  const dy = y - frame.y
  const angle = frame.rotate * Math.PI / 180
  const localX = (dx * Math.cos(angle) + dy * Math.sin(angle)) / frame.scale
  const localY = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / frame.scale
  const halfSize = piece.baseSize / 2
  if (Math.abs(localX) > halfSize || Math.abs(localY) > halfSize) return false

  return isPointInMainMenuPieceMask(
    piece.imageUrl,
    (localX + halfSize) / piece.baseSize,
    (localY + halfSize) / piece.baseSize,
  )
}

function isPointInMainMenuPieceMask(imageUrl: string, u: number, v: number) {
  const mask = getMainMenuPieceHitMask(imageUrl)
  if (mask === undefined) return false
  if (mask === null) return true

  const x = Scalar.clamp(Math.floor(u * mask.size), 0, mask.size - 1)
  const y = Scalar.clamp(Math.floor(v * mask.size), 0, mask.size - 1)
  const alpha = mask.data[(y * mask.size + x) * 4 + 3]
  return alpha >= MAIN_MENU_PIECE_HIT_ALPHA_THRESHOLD
}

function getMainMenuPieceHitMask(imageUrl: string): MainMenuPieceHitMask | null | undefined {
  if (mainMenuPieceHitMaskCache.has(imageUrl)) {
    return mainMenuPieceHitMaskCache.get(imageUrl) ?? null
  }

  const image = getMainMenuPieceImage(imageUrl)
  if (! image.complete || image.naturalWidth <= 0) return undefined

  const canvas = document.createElement('canvas')
  canvas.width = MAIN_MENU_PIECE_HIT_MASK_SIZE
  canvas.height = MAIN_MENU_PIECE_HIT_MASK_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (! ctx) return null

  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const mask = {
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      size: canvas.width,
    }
    mainMenuPieceHitMaskCache.set(imageUrl, mask)
    return mask
  }
  catch {
    mainMenuPieceHitMaskCache.set(imageUrl, null)
    return null
  }
}

function clickMainMenuFlyingPiece(piece: MainMenuFlyingPiece) {
  const selectedPiece = mainMenuSelectedFlyingPieceId === null
    ? null
    : mainMenuFlyingPieces.value.find(item => item.id === mainMenuSelectedFlyingPieceId) ?? null
  if (
    selectedPiece
    && selectedPiece.id !== piece.id
    && selectedPiece.annihilatedAt === null
    && selectedPiece.key === piece.key
    && selectedPiece.player !== piece.player
  ) {
    annihilateMainMenuFlyingPieces(selectedPiece, piece)
    mainMenuSelectedFlyingPieceId = null
    return
  }

  mainMenuSelectedFlyingPieceId = piece.id
}

function annihilateMainMenuFlyingPieces(pieceA: MainMenuFlyingPiece, pieceB: MainMenuFlyingPiece) {
  const now = performance.now()
  pieceA.annihilatedAt = now
  pieceB.annihilatedAt = now
  soundManager?.play('vibraslap_short.ogg')
  recordMainMenuAnnihilation()
  window.setTimeout(() => {
    removeMainMenuFlyingPiece(pieceA.id)
    removeMainMenuFlyingPiece(pieceB.id)
  }, MAIN_MENU_ANNIHILATION_FADE_MS + 40)
}

function recordMainMenuAnnihilation() {
  mainMenuAnnihilationScore.value += 1
}

function resetMainMenuAnnihilation() {
  mainMenuAnnihilationScore.value = 0
}

function getMainMenuFlyingPieceFrame(piece: MainMenuFlyingPiece): MainMenuFlyingPieceFrame {
  const progress = Scalar.clamp(
    (mainMenuFrameTime - piece.startedAt) / piece.durationMs,
    0,
    1,
  )
  const eased = cubicBezierEase(
    progress,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierX1,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierY1,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierX2,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierY2,
  )
  const x = Scalar.lerp(piece.startX, piece.endX, eased)
  const y = Scalar.lerp(piece.startY, piece.endY, eased)
  const scale = Scalar.lerp(piece.startScale, piece.endScale, eased)
  const rotate = Scalar.lerp(piece.startRotate, piece.endRotate, progress)
  const visualSize = piece.baseSize * scale
  const annihilationOpacity = piece.annihilatedAt === null
    ? 1
    : Math.max(0, 1 - (mainMenuFrameTime - piece.annihilatedAt) / MAIN_MENU_ANNIHILATION_FADE_MS)

  return {
    x,
    y,
    scale,
    rotate,
    opacity: getMainMenuFlyingPieceOpacity(progress, eased) * annihilationOpacity,
    visualSize,
  }
}

function getMainMenuFlyingPieceOpacity(progress: number, easedProgress: number) {
  const fadeIn = progress < 0.12
    ? progress / 0.12
    : 1
  const fadeOutStart = MAIN_MENU_FLYING_PIECE_CONFIG.screenPlaneFadeStart
  const fadeOutProgress = Scalar.clamp(
    (easedProgress - fadeOutStart) / (1 - fadeOutStart),
    0,
    1,
  )
  const fadeOut = 1 - smoothStep(fadeOutProgress)
  return 0.9 * fadeIn * fadeOut
}

function smoothStep(t: number) {
  return t * t * (3 - 2 * t)
}

function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let low = 0
  let high = 1
  let u = t
  for (let i = 0; i < 12; i ++) {
    u = (low + high) / 2
    const x = cubicBezierAxis(u, x1, x2)
    if (x < t) low = u
    else high = u
  }
  return cubicBezierAxis(u, y1, y2)
}

function cubicBezierAxis(t: number, p1: number, p2: number) {
  const inv = 1 - t
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t
}

function getDistanceToViewportEdge(x: number, y: number, angle: number, width: number, height: number) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const tx = dx > 0
    ? (width - x) / dx
    : dx < 0
      ? -x / dx
      : Number.POSITIVE_INFINITY
  const ty = dy > 0
    ? (height - y) / dy
    : dy < 0
      ? -y / dy
      : Number.POSITIVE_INFINITY
  return Math.max(0, Math.min(tx, ty))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function submitImportDialog() {
  const text = importText.value.trim()
  if (! text) return
  playUISound()

  const error = game?.importFiveDPGNText(text)
  if (error) {
    importError.value = error === 'Failed to import 5dpgn' ? t('error.importFailed') : error
    return
  }

  closeDialog(false)
}

async function copyExportText() {
  playUISound()
  exportCopyStatus.value = ''
  try {
    await navigator.clipboard.writeText(exportText.value)
    exportCopyStatus.value = t('export.copied')
  }
  catch {
    exportCopyStatus.value = t('export.copyManual')
  }
}

async function copyShareLink(playSound = true) {
  if (playSound) playUISound()
  shareCopyStatus.value = ''
  try {
    await navigator.clipboard.writeText(shareLink.value)
    shareCopyStatus.value = t('share.copied')
  }
  catch {
    shareCopyStatus.value = t('share.copyManual')
  }
}

function getCurrentRoomShareLink(): string {
  const room = onlineRoomRef.value
  const url = new URL(window.location.href)
  url.hash = room
    ? `match=${encodeURIComponent(JSON.stringify({
        server: room.serverAddress,
        room: room.roomId,
      }))}`
    : ''
  return url.toString()
}

async function openSharedRoomFromHash() {
  const payload = parseSharedRoomHash(window.location.hash)
  if (! payload) return

  const server = getOrAddMatchServer(payload.server)
  sharedRoom.value = {
    server,
    room: null,
    roomId: payload.room,
    loading: true,
    error: '',
  }
  dialogMode.value = 'shared-room'

  try {
    const client = new MatchClient(server.address)
    const [info, state] = await Promise.all([
      client.getInfo(),
      client.getRoomState(payload.room, { userId: matchUserId.value ?? undefined }),
    ])
    server.name = info.name
    server.rooms = upsertMatchRoom(server.rooms, state.room)
    server.status = 'connected'
    server.error = ''
    syncLastOnlineGameFromServer(server)

    sharedRoom.value = {
      server,
      room: state.room,
      roomId: payload.room,
      loading: false,
      error: '',
    }
  }
  catch (err) {
    server.rooms = []
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
    sharedRoom.value = {
      server,
      room: null,
      roomId: payload.room,
      loading: false,
      error: server.error || t('match.failedMessage'),
    }
  }
}

function upsertMatchRoom(rooms: MatchRoom[], room: MatchRoom): MatchRoom[] {
  const next = rooms.filter(current => current.id !== room.id)
  next.push(room)
  return next
}

function parseSharedRoomHash(hash: string): SharedRoomHashPayload | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const encoded = params.get('match')
  if (! encoded) return null

  try {
    const value = JSON.parse(encoded) as Partial<SharedRoomHashPayload>
    if (typeof value.server !== 'string' || typeof value.room !== 'string') return null
    const server = normalizeMatchServerAddress(value.server)
    if (! server) return null
    return {
      server,
      room: value.room,
    }
  }
  catch {
    return null
  }
}

function getOrAddMatchServer(address: string): MatchServerState {
  const existing = matchServers.find(server => server.address === address)
  if (existing) return existing

  const server: MatchServerState = {
    id: address,
    address,
    name: address.replace(/^https?:\/\//, ''),
    status: 'idle',
    rooms: [],
    error: '',
  }
  matchServers.push(server)
  expandedMatchServerIds.add(server.id)
  return server
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (! loading.value && ! gameStarted.value) startAmbience()

  if (e.key === 'Escape') {
    e.preventDefault()
    if (dialogMode.value !== 'none') closeDialog()
    else if (! gameStarted.value && mainMenuMode.value === 'match') {
      if (matchPanelMode.value === 'room-settings') closeMatchRoomSettingsPanel()
      else closeMatchPage()
    }
    else if (gameStarted.value) toggleSecondaryMenu()
    return
  }

  if (
    e.key === ','
    && ! e.repeat
    && ! loading.value
    && ! isModifierKeyEvent(e)
    && ! isTextInputEvent(e)
    && dialogMode.value === 'none'
  ) {
    e.preventDefault()
    openSettingsDialog()
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
    case 'c':
      e.preventDefault()
      toggleClockPanel()
      break
  }
}

function toggleViewPlayer() {
  game?.toggleViewPlayer()
}

function updateViewPlayer(player: Player) {
  viewPlayer.value = player
}

function playUISound() {
  soundManager?.play('lightswitch.ogg')
  if (! loading.value) startAmbience()
}

function isMobile() {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

async function enterImmersiveModeIfNeeded() {
  if (! gameSettings.autoFullscreen) return
  if (! isMobile()) return

  if (! document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen()
    }
    catch (err) {
      logger.warn(`Failed to enter fullscreen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: 'landscape') => Promise<void>
  }
  if (orientation.lock) {
    try {
      await orientation.lock('landscape')
    }
    catch (err) {
      logger.warn(`Failed to lock orientation: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function enterAfterLoading() {
  if (! requiredAssetsReady.value || loadingError.value) return
  playUISound()
  await enterImmersiveModeIfNeeded()
  loading.value = false
  handleWindowResize()
  startAmbience()
}

function startLocalGame() {
  if (! gameRenderer || ! soundManager || gameStarted.value) return

  playUISound()
  game = new Game({
    renderer: gameRenderer,
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
    fiveDPGNOptions: gameSettings.fiveDPGN,
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
  if (! gameRenderer || ! soundManager || gameStarted.value) return

  stopOnlinePolling()
  onlineRoomRef.value = {
    serverAddress,
    roomId: state.room.id,
    roomName: state.room.name,
  }
  onlineRoomStatus.value = state.room.status
  onlineRoomSettings.value = state.room.settings
  onlineRoomReady.value = state.room.status === 'playing'
  onlineClock.value = state.clock
  onlineSpectatorCount.value = state.spectatorCount
  onlinePlayer.value = state.session?.player ?? null
  if (state.session) updateViewPlayer(state.session.player)
  onlinePresence.value = state.presence
  onlineConnectionStatus.value = 'connecting'
  onlineError.value = ''
  onlineActionsSignature = JSON.stringify(state.actions)
  onlineLiveActions = state.actions
  onlineLiveActionCount.value = state.actions.length
  hasNewLiveActions.value = false
  spectatorDeductionStartActionIndex.value = null
  game = new Game({
    renderer: gameRenderer,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    initialActions: state.actions,
    localPlayer: state.session?.player ?? null,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: false,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    showOpponentMoveRange: getEffectiveShowOpponentMoveRange(state.room.settings),
    fiveDPGNOptions: gameSettings.fiveDPGN,
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
    onActionSubmitted: (action, actions) => {
      if (! state.session) {
        spectatorDeductionStartActionIndex.value ??= actions.length - 1
        return
      }
      pendingLocalActionsSignature = JSON.stringify(actions)
      void submitOnlineAction(serverAddress, state.session.roomId, state.session.id, state.session.userId, action)
    },
    onPendingActionChange: action => {
      syncOnlinePendingAction(action)
    },
  })
  gameStarted.value = true
  pendingLocalActionsSignature = ''
  mainMenuMode.value = 'home'
  stopMatchServerRefresh()
  syncGameInputState()
  game.start()
  syncGameViewportInsets()
  startOnlineRoomStateSubscription(serverAddress, state.room.id, state.session?.id ?? null, state.session?.userId ?? null)
  if (state.session) startOnlinePolling(serverAddress, state.session.roomId, state.session.id, state.session.userId)
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
  onlineClock.value = state.clock
  onlineSpectatorCount.value = state.spectatorCount
  if (gameStarted.value && ! wasReady && onlineRoomReady.value) {
    soundManager?.play('bell.ogg')
  }
  if (state.session) onlinePlayer.value = state.session.player
  onlinePresence.value = state.presence
  onlineError.value = ''
  if (state.session) storeOnlineSession(serverAddress, state)
  game?.setShowOpponentMoveRange(getEffectiveShowOpponentMoveRange(state.room.settings))
  const actionsSignature = JSON.stringify(state.actions)
  if (force || actionsSignature !== onlineActionsSignature) {
    const previousLiveActionCount = onlineLiveActions.length
    const committedCurrentPreview = ! force && game?.isCurrentPendingActionCommitted(state.actions)
    const confirmedLocalAction = actionsSignature === pendingLocalActionsSignature
    if (confirmedLocalAction) pendingLocalActionsSignature = ''
    const receivedLiveActionUpdate = ! force && ! confirmedLocalAction
    onlineActionsSignature = actionsSignature
    onlineLiveActions = state.actions
    onlineLiveActionCount.value = state.actions.length
    const receivedRemoteAction = receivedLiveActionUpdate && state.actions.length > previousLiveActionCount
    if (receivedRemoteAction) soundManager?.play('bell.ogg')

    const isSpectatorOffLive = isOnlineSpectator.value
      && (
        spectatorDeductionStartActionIndex.value !== null
        || recordCurrentActionIndex.value !== previousLiveActionCount
        || recordHasPendingMoves.value
      )
    if (
      isSpectatorOffLive
      && ! force
    ) {
      if (receivedLiveActionUpdate) hasNewLiveActions.value = true
      return
    }

    hasNewLiveActions.value = false
    game?.clearRemotePendingMoves()
    game?.loadActions(state.actions, {
      focus: false,
      force,
      animate: ! committedCurrentPreview && ! confirmedLocalAction,
    })
  }
}

async function submitOnlineAction(
  serverAddress: string,
  roomId: string,
  sessionId: string,
  userId: string,
  action: Action,
) {
  try {
    const client = new MatchClient(serverAddress)
    const state = await client.submitAction(roomId, { sessionId, userId, action })
    applyOnlineGameState(serverAddress, state)
  }
  catch (err) {
    pendingLocalActionsSignature = ''
    onlineError.value = err instanceof Error ? err.message : String(err)
    logger.error(onlineError.value)
    await syncOnlineGameState(serverAddress, roomId, sessionId, userId, { force: true })
  }
}

function startOnlineRoomStateSubscription(
  serverAddress: string,
  roomId: string,
  sessionId: string | null,
  userId: string | null,
) {
  stopOnlineRoomStateSubscription()
  onlineRoomStateSubscriptionActive = true
  const client = new MatchClient(serverAddress)
  onlineRoomStateSubscription = client.subscribeRoomState(
    roomId,
    sessionId,
    userId,
    event => {
      switch (event.type) {
        case 'state':
          applyOnlineGameState(serverAddress, event.state)
          break
        case 'pending-action':
          if (sessionId && event.sessionId !== sessionId && onlineRoomSettings.value?.showOpponentMoves) {
            game?.setRemotePendingMoves(event.moves)
          }
          break
        case 'clear-pending-action':
          if (sessionId && event.sessionId !== sessionId) game?.clearRemotePendingMoves()
          break
      }
    },
    {
      onOpen: () => {
        onlineConnectionStatus.value = 'connected'
      },
      onError: () => {
        if (! onlineRoomStateSubscriptionActive) return
        onlineConnectionStatus.value = 'reconnecting'
        scheduleOnlineRoomStateReconnect(serverAddress, roomId, sessionId, userId)
      },
    },
  )
}

function stopOnlineRoomStateSubscription() {
  onlineRoomStateSubscriptionActive = false
  stopOnlineReconnect()
  onlineRoomStateSubscription?.unsubscribe()
  onlineRoomStateSubscription = null
}

function syncOnlinePendingAction(action: Action | null) {
  if (! onlineSession.value) return
  if (! onlineRoomSettings.value?.showOpponentMoves) return
  if (action && action.moves.length > 0) onlineRoomStateSubscription?.sendPendingAction(action.moves)
  else onlineRoomStateSubscription?.clearPendingAction()
}

function scheduleOnlineRoomStateReconnect(
  serverAddress: string,
  roomId: string,
  sessionId: string | null,
  userId: string | null,
) {
  if (onlineReconnectTimer !== null) return
  onlineReconnectTimer = window.setTimeout(() => {
    onlineReconnectTimer = null
    if (! onlineRoomStateSubscriptionActive) return
    startOnlineRoomStateSubscription(serverAddress, roomId, sessionId, userId)
  }, ONLINE_RECONNECT_DELAY_MS)
}

function stopOnlineReconnect() {
  if (onlineReconnectTimer === null) return
  window.clearTimeout(onlineReconnectTimer)
  onlineReconnectTimer = null
}

function startOnlinePolling(serverAddress: string, roomId: string, sessionId: string, userId: string) {
  stopOnlinePolling()
  onlinePollTimer = window.setInterval(() => {
    void syncOnlineGameState(serverAddress, roomId, sessionId, userId)
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
  userId: string,
  options: { force?: boolean } = {},
) {
  try {
    const client = new MatchClient(serverAddress)
    const state = await client.getRoomState(roomId, { sessionId, userId })
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
    await client.forfeitRoom(session.roomId, { sessionId: session.sessionId, userId: session.userId })
  }
  catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

async function leaveWaitingOnlineRoom(session: StoredOnlineSession) {
  try {
    const client = new MatchClient(session.serverAddress)
    await client.leaveRoom(session.roomId, { sessionId: session.sessionId, userId: session.userId })
  }
  catch (err) {
    logger.error(err instanceof Error ? err.message : String(err))
  }
}

function refreshSavedGameState() {
  hasSavedGame.value = getHasSavedGame()
}

function getHasSavedGame() {
  return readStorageJson(
    GAME_STORAGE_KEY,
    value => isStoredGameState(value as Partial<StoredGameState>),
    false,
  )
}

function parseStoredOnlineGame(value: unknown): StoredOnlineGame | null {
  if (! value || typeof value !== 'object') return null

  const game = value as Partial<StoredOnlineGame>
  if (
    typeof game.serverAddress !== 'string'
    || typeof game.roomId !== 'string'
    || typeof game.roomName !== 'string'
    || typeof game.userId !== 'string'
    || typeof game.updatedAt !== 'number'
    || (game.status !== 'waiting' && game.status !== 'playing')
  ) return null

  return {
    serverAddress: game.serverAddress,
    roomId: game.roomId,
    roomName: game.roomName,
    userId: game.userId,
    status: game.status,
    updatedAt: game.updatedAt,
  }
}

function parseGameSettings(value: Partial<GameSettings>): GameSettings {
  return {
    soundVolume: parseVolume(value.soundVolume),
    renderer: parseRendererPreference(value.renderer, DEFAULT_GAME_SETTINGS.renderer),
    fiveDPGN: parseFiveDPGNSettings(value.fiveDPGN),
    autoFullscreen: parseBoolean(value.autoFullscreen, DEFAULT_GAME_SETTINGS.autoFullscreen),
    autoSwitchViewPlayer: parseBoolean(value.autoSwitchViewPlayer, DEFAULT_GAME_SETTINGS.autoSwitchViewPlayer),
    showClock: parseBoolean(value.showClock, DEFAULT_GAME_SETTINGS.showClock),
    showMoveTravelAnimation: parseBoolean(value.showMoveTravelAnimation, DEFAULT_GAME_SETTINGS.showMoveTravelAnimation),
  }
}

function parseFiveDPGNSettings(value: Partial<FiveDPGNSettings> | undefined): FiveDPGNSettings {
  return {
    includePieceSymbols: parseBoolean(value?.includePieceSymbols, DEFAULT_FIVE_DPGN_SETTINGS.includePieceSymbols),
    includeTravelMarkers: parseBoolean(value?.includeTravelMarkers, DEFAULT_FIVE_DPGN_SETTINGS.includeTravelMarkers),
    includeCaptureMarkers: parseBoolean(value?.includeCaptureMarkers, DEFAULT_FIVE_DPGN_SETTINGS.includeCaptureMarkers),
    includeCheckMarkers: parseBoolean(value?.includeCheckMarkers, DEFAULT_FIVE_DPGN_SETTINGS.includeCheckMarkers),
    includePromotionMarkers: parseBoolean(value?.includePromotionMarkers, DEFAULT_FIVE_DPGN_SETTINGS.includePromotionMarkers),
  }
}

function parseVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : DEFAULT_GAME_SETTINGS.soundVolume
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function syncGameSettings() {
  soundManager?.setVolume(gameSettings.soundVolume)
  game?.setAutoSwitchViewPlayer(onlineRoomStatus.value !== null ? false : gameSettings.autoSwitchViewPlayer)
  game?.setShowMoveTravelAnimation(gameSettings.showMoveTravelAnimation)
  game?.setShowOpponentMoveRange(getEffectiveShowOpponentMoveRange())
  game?.setFiveDPGNOptions(gameSettings.fiveDPGN)
}

function getClockStepMs(clock: MatchClock, player: Player, now: number): number {
  if (clock.currentPlayer !== player || clock.turnStartedAt === null) return 0
  return Math.max(0, now - clock.turnStartedAt)
}

function getEffectiveShowOpponentMoveRange(settings = onlineRoomSettings.value): boolean {
  return settings?.showOpponentMoveRange ?? true
}

function storeOnlineSession(serverAddress: string, state: MatchGameState) {
  if (! state.session) return

  const session: StoredOnlineSession = {
    serverAddress,
    roomId: state.session.roomId,
    roomName: state.room.name,
    sessionId: state.session.id,
    userId: state.session.userId,
  }
  matchUserId.value = state.session.userId
  onlineSession.value = session
  storeLastOnlineGame(serverAddress, state)
}

function clearStoredOnlineSession() {
  onlineSession.value = null
}

function storeLastOnlineGame(serverAddress: string, state: MatchGameState) {
  if (! state.session) return
  if (state.room.status === 'finished') {
    clearLastOnlineGame(state.session)
    return
  }

  lastOnlineGame.value = {
    serverAddress,
    roomId: state.room.id,
    roomName: state.room.name,
    userId: state.session.userId,
    status: state.room.status,
    updatedAt: state.room.updatedAt,
  }
}

function clearLastOnlineGame(session: Pick<StoredOnlineSession, 'roomId' | 'userId'> | null = null) {
  if (! session || (
    lastOnlineGame.value?.roomId === session.roomId
    && lastOnlineGame.value.userId === session.userId
  )) {
    lastOnlineGame.value = null
  }
}

function syncLastOnlineGameFromServer(server: MatchServerState) {
  const saved = lastOnlineGame.value
  if (! saved || saved.serverAddress !== server.address) return

  const room = server.rooms.find(room => (
    room.id === saved.roomId
    && room.ownSession?.userId === saved.userId
  ))
  if (! room || room.status === 'finished') {
    lastOnlineGame.value = null
    return
  }

  lastOnlineGame.value = {
    serverAddress: server.address,
    roomId: room.id,
    roomName: room.name,
    userId: saved.userId,
    status: room.status,
    updatedAt: room.updatedAt,
  }
}

function clearSavedGameState() {
  removeStorageValue(GAME_STORAGE_KEY)
}

function returnToMainMenu(
  { clearSave = true, forfeit = false }: { clearSave?: boolean, forfeit?: boolean } = {},
) {
  const currentOnlineSession = onlineSession.value
  if (currentOnlineSession && onlineRoomStatus.value === 'waiting') {
    void leaveWaitingOnlineRoom(currentOnlineSession)
    clearStoredOnlineSession()
    clearLastOnlineGame(currentOnlineSession)
  }
  else if (clearSave && forfeit && currentOnlineSession && onlineRoomStatus.value !== 'finished') {
    void forfeitOnlineRoom(currentOnlineSession)
    clearLastOnlineGame(currentOnlineSession)
  }
  if (clearSave) clearSavedGameState()
  if (clearSave) {
    clearLastOnlineGame(currentOnlineSession)
    clearStoredOnlineSession()
  }
  stopMatchServerRefresh()
  stopOnlinePolling()
  stopOnlineRoomStateSubscription()
  onlineRoomStatus.value = null
  onlineRoomSettings.value = null
  onlineRoomReady.value = false
  onlinePlayer.value = null
  onlinePresence.value = null
  onlineRoomRef.value = null
  onlineConnectionStatus.value = 'offline'
  onlineError.value = ''
  onlineClock.value = null
  onlineSpectatorCount.value = 0
  onlineActionsSignature = ''
  onlineLiveActions = []
  onlineLiveActionCount.value = 0
  hasNewLiveActions.value = false
  spectatorDeductionStartActionIndex.value = null
  pendingLocalActionsSignature = ''
  game?.dispose()
  game = null
  toolbarButtons.value = []
  recordText.value = ''
  recordActions.value = []
  recordHasPendingMoves.value = false
  recordCurrentActionIndex.value = 0
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
  if (loading.value || ambienceLoop || ! soundManager) return
  if (! soundManager.has('ambience.ogg')) return
  ambienceLoop = soundManager?.playLoop('ambience.ogg', { volume: 0.35 }) ?? null
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

function handleWindowFocus() {
  documentFocused.value = true
}

function handleWindowBlur() {
  documentFocused.value = false
}

async function loadOptionalSounds() {
  if (! soundManager) return

  try {
    soundLoadProgress.value = { completed: 0, total: 0 }
    await soundManager.load(logger, progress => {
      soundLoadProgress.value = progress
    }, { optional: true })
    startAmbience()
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
    const rendererResult = await createGameRenderer(canvas.value!, logger, {
      backend: parseRendererPreferenceParam(query.get('renderer')) ?? gameSettings.renderer,
      onProgress: progress => {
        textureLoadProgress.value = progress
      },
    })
    gameRenderer = rendererResult.renderer
    activeRendererBackend.value = rendererResult.backend
    rendererFallbackReason.value = rendererResult.fallbackReason ?? null
    refreshSavedGameState()
    requiredAssetsReady.value = true
    void loadOptionalSounds()
    if (parseSharedRoomHash(window.location.hash)) {
      loading.value = false
      void openSharedRoomFromHash()
    }
  }
  catch (err) {
    loadingError.value = t('error.loadFailed')
    logger.error(String(err))
    console.error(err)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeyDown)
  window.addEventListener('resize', handleWindowResize)
  window.visualViewport?.addEventListener('resize', handleWindowResize)
  coarsePointerQuery.addEventListener('change', handleCoarsePointerChange)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  clockTimer = window.setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
  void init()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  window.visualViewport?.removeEventListener('resize', handleWindowResize)
  coarsePointerQuery.removeEventListener('change', handleCoarsePointerChange)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('blur', handleWindowBlur)
  stopMatchServerRefresh()
  stopOnlinePolling()
  stopOnlineRoomStateSubscription()
  stopMainVortexAnimation()
  stopMainMenuFlyingPieces()
  stopAmbience()
  if (clockTimer !== null) window.clearInterval(clockTimer)
  game?.dispose()
  gameRenderer?.dispose()
  soundManager?.dispose()
  document.title = DOCUMENT_TITLE
})

watch(uiOverlayOpen, syncGameInputState)
watch(recordPanelOpen, syncGameViewportInsets)
watch(mainMenuVisible, visible => {
  if (visible) {
    void nextTick(() => {
      if (! mainMenuVisible.value) return
      startMainVortexAnimation()
      startMainMenuFlyingPieces()
    })
  }
  else {
    stopMainVortexAnimation()
    stopMainMenuFlyingPieces()
  }
}, { immediate: true })
watch(mainMenuMode, mode => {
  if (! mainMenuVisible.value) return
  if (mode === 'home') startMainMenuFlyingPieces()
  else stopMainMenuPieceSpawn()
  drawMainMenuCanvas(mainMenuFrameTime)
})
watch(shouldMarkTitleForTurn, syncDocumentTitle, { immediate: true })
watch(gameSettings, () => {
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
      @pointermove.stop
      @pointerup.stop
      @pointercancel.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <section
        v-if="!loading && !gameStarted"
        class="main-menu"
        @pointerdown="startAmbience"
      >
        <canvas
          ref="mainMenuCanvas"
          class="main-menu-canvas"
          @pointerdown.stop.prevent="handleMainMenuCanvasPointerDown"
          @pointermove.stop="handleMainMenuCanvasPointerMove"
          @pointerleave.stop="handleMainMenuCanvasPointerLeave"
          aria-hidden="true"
        ></canvas>
        <Card
          v-if="mainMenuAnnihilationVisible"
          class="main-menu-annihilation"
          @pointerdown.stop
          @click.stop
        >
          <div class="main-menu-annihilation-score">
            {{ t('main.annihilationScore', { score: mainMenuAnnihilationScore }) }}
          </div>
        </Card>
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
              size="main"
              :style="menuButtonStyle"
              @click="startLocalGame"
            >
              <span>{{ mainMenuStartText }}</span>
            </GameButton>
            <GameButton
              size="main"
              :style="menuButtonStyle"
              :badge="hasUnfinishedOnlineGame ? '!' : ''"
              @click="openMatchPage"
            >
              <span>{{ t('main.match') }}</span>
            </GameButton>
            <GameButton
              size="main"
              :style="menuButtonStyle"
              @click="openHelpDialog"
            >
              <span>{{ t('main.help') }}</span>
            </GameButton>
            <GameButton
              size="main"
              :style="menuButtonStyle"
              @click="openSettingsDialog"
            >
              <span>{{ t('main.settings') }}</span>
            </GameButton>
            <GameButton
              size="main"
              :style="menuButtonStyle"
              @click="openGitHub"
            >
              <span>{{ t('main.github') }}</span>
            </GameButton>
          </div>
          <i18n-t
            keypath="main.disclaimer"
            tag="p"
            class="main-disclaimer"
          >
            <template #game>
              <a
                class="main-disclaimer-link"
                :href="ORIGINAL_GAME_STEAM_URL"
                target="_blank"
                rel="noopener noreferrer"
                @pointerdown.stop
                @click.stop
              >{{ ORIGINAL_GAME_TITLE }}</a>
            </template>
          </i18n-t>
        </template>
        <div
          v-else
          class="match-card"
          :style="menuButtonStyle"
        >
          <div class="match-card-header">
            <h2 class="dialog-title">
              {{ matchPanelMode === 'room-settings' ? t('dialog.matchRoomSettingsTitle') : t('match.title') }}
            </h2>
            <div
              v-if="matchPanelMode === 'servers'"
              class="match-card-actions"
            >
              <div class="match-control-slot match-control-slot--input match-nickname-slot">
                <GameTextInput
                  v-model="matchNickname"
                  :placeholder="t('match.nicknamePlaceholder')"
                  spellcheck="false"
                />
              </div>
              <GameButton
                size="small"
                :style="menuButtonStyle"
                @click="clickRefreshMatchServers"
              >
                <span>{{ t('match.refresh') }}</span>
              </GameButton>
              <GameButton
                size="small"
                :style="menuButtonStyle"
                @click="closeMatchPage"
              >
                <span>{{ t('button.back') }}</span>
              </GameButton>
            </div>
            <div
              v-else
              class="match-card-actions"
            >
              <GameButton
                size="small"
                :style="menuButtonStyle"
                @click="closeMatchRoomSettingsPanel"
              >
                <span>{{ t('button.back') }}</span>
              </GameButton>
            </div>
          </div>
          <div
            v-if="matchPanelMode === 'servers'"
            class="match-server-list"
          >
            <section class="match-server match-server--manual">
              <div class="match-manual-row">
                <div class="match-control-slot match-control-slot--input">
                  <GameTextInput
                    v-model="manualMatchServerAddress"
                    :placeholder="t('match.serverAddressPlaceholder')"
                    spellcheck="false"
                    @keydown.enter.prevent="addManualMatchServer"
                  />
                </div>
                <GameButton
                  size="small"
                  :style="menuButtonStyle"
                  :disabled="manualMatchServerAddress.trim().length === 0"
                  @click="addManualMatchServer"
                >
                  <span>{{ t('match.addServer') }}</span>
                </GameButton>
              </div>
            </section>
            <section
              v-if="customRoomServer"
              class="match-server match-server--custom-room"
            >
              <div class="match-room">
                <div class="match-room-main">
                  <div class="match-room-name">
                    {{ t('match.customRoom') }}
                  </div>
                  <div class="match-room-meta">
                    {{ getMatchServerDisplayAddress(customRoomServer) }}
                  </div>
                </div>
                <div class="match-room-fields">
                  <div class="match-control-slot match-control-slot--input">
                    <GameTextInput
                      v-model="matchRoomName"
                      :placeholder="t('match.roomNamePlaceholder')"
                      spellcheck="false"
                      @keydown.enter.prevent="createMatchRoom()"
                    />
                  </div>
                  <GameButton
                    size="small"
                    :style="menuButtonStyle"
                    @click="openMatchRoomSettingsDialog"
                  >
                    <span>{{ t('main.settings') }}</span>
                  </GameButton>
                  <GameButton
                    size="small"
                    :style="menuButtonStyle"
                    @click="createMatchRoom()"
                  >
                    <span>{{ t('match.create') }}</span>
                  </GameButton>
                </div>
              </div>
            </section>
            <section
              v-for="server in matchServers"
              :key="server.id"
              class="match-server"
            >
              <div class="match-server-header">
                <GameButton
                  size="small"
                  shape="circle"
                  :style="menuButtonStyle"
                  :aria-label="isMatchServerExpanded(server) ? t('match.collapseServer') : t('match.expandServer')"
                  :aria-expanded="isMatchServerExpanded(server)"
                  @click="toggleMatchServerExpanded(server)"
                >
                  <GameIcon :name="isMatchServerExpanded(server) ? 'chevron-down' : 'chevron-right'" />
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
                    v-if="server.status === 'connected'"
                    size="small"
                    :style="menuButtonStyle"
                    @click="openCustomRoomForm(server)"
                  >
                    <span>{{ t('match.createRoom') }}</span>
                  </GameButton>
                  <GameButton
                    v-if="server.status !== 'connected' && server.status !== 'connecting'"
                    size="small"
                    :style="menuButtonStyle"
                    @click="clickConnectMatchServer(server)"
                  >
                    <span>{{ t('match.connect') }}</span>
                  </GameButton>
                  <GameButton
                    v-if="isManualMatchServer(server)"
                    size="small"
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
                    <div class="match-room-meta-stack">
                      <div class="match-room-meta">
                        <span
                          class="match-room-player"
                          :class="{ 'match-room-player--online': room.seats[0]?.online }"
                        >{{ getMatchRoomSeatLabel(room.seats[0]) }}</span>
                        <span>{{ t('match.playersVersusSeparator') }}</span>
                        <span
                          class="match-room-player"
                          :class="{ 'match-room-player--online': room.seats[1]?.online }"
                        >{{ room.seats[1] ? getMatchRoomSeatLabel(room.seats[1]) : '?' }}</span>
                        <span>{{ getMatchRoomStatusSuffix(room) }}</span>
                      </div>
                      <div class="match-room-meta">{{ getMatchRoomSettingsMeta(room) }}</div>
                    </div>
                  </div>
                  <div class="match-room-side">
                    <GameButton
                      v-if="room.ownSession && room.status !== 'finished'"
                      size="small"
                      :style="menuButtonStyle"
                      badge="!"
                      @click="returnToMatchRoom(server, room)"
                    >
                      <span>{{ t('match.returnToGame') }}</span>
                    </GameButton>
                    <GameButton
                      v-else-if="room.status === 'waiting'"
                      size="small"
                      :style="menuButtonStyle"
                      @click="joinMatchRoom(server, room.id)"
                    >
                      <span>{{ t('match.join') }}</span>
                    </GameButton>
                    <GameButton
                      v-else-if="canViewMatchRoom(room)"
                      size="small"
                      :style="menuButtonStyle"
                      @click="viewMatchRoom(server, room)"
                    >
                      <span>{{ getViewMatchRoomLabel(room) }}</span>
                    </GameButton>
                  </div>
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
          <div
            v-else
            class="match-settings-panel"
          >
            <div class="settings-list match-settings-list">
              <div class="settings-row">
                <span>{{ t('match.setting.private') }}</span>
                <GameToggle
                  v-model="matchRoomSettings.private"
                  :style="menuButtonStyle"
                />
              </div>
              <div class="settings-row settings-row--stacked">
                <span>{{ t('match.setting.creatorPlayer') }}</span>
                <div class="match-radio-group">
                  <GameToggle
                    v-model="matchRoomSettings.creatorPlayer"
                    type="radio"
                    value="white"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('match.setting.creatorWhite') }}</span>
                  </GameToggle>
                  <GameToggle
                    v-model="matchRoomSettings.creatorPlayer"
                    type="radio"
                    value="black"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('match.setting.creatorBlack') }}</span>
                  </GameToggle>
                  <GameToggle
                    v-model="matchRoomSettings.creatorPlayer"
                    type="radio"
                    value="random"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('match.setting.creatorRandom') }}</span>
                  </GameToggle>
                </div>
              </div>
              <div class="settings-row">
                <span>{{ t('match.setting.canReplay') }}</span>
                <GameToggle
                  v-model="matchRoomSettings.canReplay"
                  :style="menuButtonStyle"
                />
              </div>
              <div class="settings-row">
                <span>{{ t('match.setting.saveRecord') }}</span>
                <GameToggle
                  v-model="matchRoomSettings.saveRecordToServer"
                  :style="menuButtonStyle"
                />
              </div>
              <div class="settings-row">
                <span>{{ t('match.setting.liveMoves') }}</span>
                <GameToggle
                  v-model="matchRoomSettings.showOpponentMoves"
                  :style="menuButtonStyle"
                />
              </div>
              <div class="settings-row">
                <span>{{ t('match.setting.showOpponentMoveRange') }}</span>
                <GameToggle
                  v-model="matchRoomSettings.showOpponentMoveRange"
                  :style="menuButtonStyle"
                />
              </div>
            </div>
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
        <GameButton
          v-if="shouldShowReturnLiveButton"
          :style="menuButtonStyle"
          :badge="hasNewLiveActions ? '!' : ''"
          @click="returnToLiveGame"
        >
          <span>{{ t('button.returnToLive') }}</span>
        </GameButton>
      </div>

      <div
        class="toolbar toolbar-secondary"
      >
        <GameButton
          size="icon"
          shape="circle"
          :style="menuButtonStyle"
          :aria-label="t('dialog.languageTitle')"
          @click="openLanguageDialog"
        >
          <GameIcon name="globe" />
        </GameButton>
        <GameButton
          v-if="gameStarted"
          size="icon"
          shape="circle"
          :style="menuButtonStyle"
          :aria-label="t('button.flipView')"
          @click="toggleViewPlayer"
        >
          <GameIcon name="flip" />
        </GameButton>
        <GameButton
          v-if="gameStarted"
          size="icon"
          shape="circle"
          :style="menuButtonStyle"
          :aria-label="t('button.menu')"
          :aria-expanded="secondaryMenuOpen"
          @click="toggleSecondaryMenu"
        >
          <GameIcon name="ellipsis" />
        </GameButton>
      </div>

      <div
        v-if="clockRows.length > 0"
        class="clock-card"
        :style="menuButtonStyle"
      >
        <div
          v-for="row in clockRows"
          :key="row.player"
          class="clock-row"
          :class="{ 'clock-row--active': row.active }"
        >
          <span class="clock-player">{{ row.label }}</span>
          <span class="clock-time">{{ row.step }}</span>
          <span class="clock-separator">/</span>
          <span class="clock-time">{{ row.total }}</span>
        </div>
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
              size="tiny"
              :style="menuButtonStyle"
              :disabled="button.disabled"
              :pulsing="button.effect === 'pulse'"
              @click="clickToolbarButton(button)"
            >
              <span>{{ getButtonText(button) }}</span>
            </GameButton>
          </div>
        </div>
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
              v-for="section in recordSections"
              :key="section.id"
              class="record-section"
              :class="{
                'record-section--branch': section.kind === 'branch',
                'record-section--deduction': section.kind === 'deduction',
                'record-section--pending': section.kind === 'pending',
                'record-section--plain': section.kind === 'record',
              }"
              :style="{ '--record-section-indent': `calc(var(--button-content-gap) * ${section.depth * 2.4})` }"
            >
              <div
                v-for="row in section.rows"
                :key="row.recordKey ?? `${row.serial}-${row.index}`"
                class="record-row"
                :class="{
                  'record-row--black': row.player === 'b',
                  'record-row--white': row.player !== 'b',
                }"
              >
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
                <span class="record-action-icons">
                  <button
                    v-if="canForkRecordAction(row)"
                    class="record-action-icon record-action-icon--branch"
                    type="button"
                    :title="t('record.branchAction')"
                    :aria-label="t('record.branchAction')"
                    @click.stop="startRecordBranch(row)"
                  >
                    <GameIcon name="branch" />
                  </button>
                  <span
                    v-if="isCurrentRecordAction(row)"
                    class="record-action-icon record-action-icon--current"
                    :title="t('record.currentAction')"
                    :aria-label="t('record.currentAction')"
                  >
                    <GameIcon name="current" />
                  </span>
                  <button
                    v-else-if="canJumpToRecordAction(row)"
                    class="record-action-icon record-action-icon--jump"
                    type="button"
                    :title="t('record.jumpToAction')"
                    :aria-label="t('record.jumpToAction')"
                    @click.stop="rollbackToRecordAction(row)"
                  >
                    <GameIcon name="jump" />
                  </button>
                </span>
              </div>
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
            size="secondary"
            :style="menuButtonStyle"
            :open="recordPanelOpen"
            :aria-expanded="recordPanelOpen"
            @click="clickRecordMenuButton"
          >
            <span>{{ t('button.record') }}</span>
          </GameButton>
          <GameButton
            size="secondary"
            :style="menuButtonStyle"
            :open="gameSettings.showClock"
            :aria-expanded="gameSettings.showClock"
            @click="toggleClockPanel"
          >
            <span>{{ t('button.clock') }}</span>
          </GameButton>
          <GameButton
            size="secondary"
            :style="menuButtonStyle"
            @click="openSettingsDialog"
          >
            <span>{{ t('main.settings') }}</span>
          </GameButton>
          <GameButton
            v-if="onlineRoomRef"
            size="secondary"
            :style="menuButtonStyle"
            @click="openShareRoomDialog"
          >
            <span>{{ t('button.shareRoom') }}</span>
          </GameButton>
          <GameButton
            size="secondary"
            :style="menuButtonStyle"
            @click="clickReturnToMainMenuButton"
          >
            <span>{{ t('button.returnToMainMenu') }}</span>
          </GameButton>
          <GameButton
            v-for="button in menuButtons"
            :key="button.id"
            size="secondary"
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
              size="secondary"
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
              <GameSlider
                v-model="gameSettings.soundVolume"
                :aria-label="t('settings.soundVolume')"
                :style="menuButtonStyle"
                :min="0"
                :max="1"
                :step="0.01"
                @change="playUISound"
              />
            </label>
            <div class="settings-row settings-row--renderer">
              <span>{{ t('settings.renderer') }}</span>
              <div class="settings-renderer-control">
                <div class="settings-radio-group">
                  <GameToggle
                    v-model="gameSettings.renderer"
                    type="radio"
                    value="auto"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('settings.rendererAuto') }}</span>
                  </GameToggle>
                  <GameToggle
                    v-model="gameSettings.renderer"
                    type="radio"
                    value="webgl"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('settings.rendererWebGL') }}</span>
                  </GameToggle>
                  <GameToggle
                    v-model="gameSettings.renderer"
                    type="radio"
                    value="canvas"
                    :style="menuButtonStyle"
                  >
                    <span>{{ t('settings.rendererCanvas') }}</span>
                  </GameToggle>
                </div>
                <span class="settings-status">{{ rendererStatusText }}</span>
                <span class="settings-note">{{ t('settings.rendererRestartHint') }}</span>
              </div>
            </div>
            <div class="settings-row">
              <span>{{ t('settings.autoFullscreen') }}</span>
              <GameToggle
                v-model="gameSettings.autoFullscreen"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.autoSwitchView') }}</span>
              <GameToggle
                v-model="gameSettings.autoSwitchViewPlayer"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.travelAnimation') }}</span>
              <GameToggle
                v-model="gameSettings.showMoveTravelAnimation"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGN') }}</span>
              <GameButton
                size="small"
                :style="menuButtonStyle"
                @click="openFiveDPGNSettingsDialog"
              >
                <span>{{ t('button.open') }}</span>
              </GameButton>
            </div>
          </div>
          <div class="dialog-actions">
            <GameButton
              size="secondary"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'five-dpgn-settings'"
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.fiveDPGNSettingsTitle') }}</h2>
          <div class="settings-list">
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGNPieceSymbols') }}</span>
              <GameToggle
                v-model="gameSettings.fiveDPGN.includePieceSymbols"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGNTravelMarkers') }}</span>
              <GameToggle
                v-model="gameSettings.fiveDPGN.includeTravelMarkers"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGNCaptureMarkers') }}</span>
              <GameToggle
                v-model="gameSettings.fiveDPGN.includeCaptureMarkers"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGNCheckMarkers') }}</span>
              <GameToggle
                v-model="gameSettings.fiveDPGN.includeCheckMarkers"
                :style="menuButtonStyle"
              />
            </div>
            <div class="settings-row">
              <span>{{ t('settings.fiveDPGNPromotionMarkers') }}</span>
              <GameToggle
                v-model="gameSettings.fiveDPGN.includePromotionMarkers"
                :style="menuButtonStyle"
              />
            </div>
          </div>
          <div class="dialog-actions">
            <GameButton
              size="secondary"
              :style="menuButtonStyle"
              @click="returnToSettingsDialog"
            >
              <span>{{ t('button.back') }}</span>
            </GameButton>
            <GameButton
              size="secondary"
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
              size="secondary"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.cancel') }}</span>
            </GameButton>
            <GameButton
              size="secondary"
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
              size="secondary"
              :style="menuButtonStyle"
              @click="copyExportText"
            >
              <span>{{ t('button.copy') }}</span>
            </GameButton>
            <GameButton
              size="secondary"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'share'"
          class="dialog-card"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.shareRoomTitle') }}</h2>
          <textarea
            v-model="shareLink"
            class="dialog-textarea"
            readonly
            spellcheck="false"
          ></textarea>
          <p
            class="dialog-message"
            :class="{ 'dialog-message--empty': !shareCopyStatus }"
            aria-live="polite"
          >
            {{ shareCopyStatus || t('share.copied') }}
          </p>
          <div class="dialog-actions">
            <GameButton
              size="secondary"
              :style="menuButtonStyle"
              @click="copyShareLink()"
            >
              <span>{{ t('button.copy') }}</span>
            </GameButton>
            <GameButton
              size="secondary"
              :style="menuButtonStyle"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </GameButton>
          </div>
        </div>

        <div
          v-else-if="dialogMode === 'shared-room'"
          class="dialog-card dialog-card--narrow"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">{{ t('dialog.sharedRoomTitle') }}</h2>
          <div
            v-if="sharedRoom?.loading"
            class="dialog-message"
            aria-live="polite"
          >
            {{ t('share.loadingRoom') }}
          </div>
          <div
            v-else-if="sharedRoom?.room"
            class="shared-room-content"
          >
            <div class="shared-room-name">{{ sharedRoom.room.name }}</div>
            <div class="shared-room-meta">
              {{ getMatchServerDisplayAddress(sharedRoom.server) }}
            </div>
            <div class="shared-room-meta">
              <span
                class="match-room-player"
                :class="{ 'match-room-player--online': sharedRoom.room.seats[0]?.online }"
              >{{ getMatchRoomSeatLabel(sharedRoom.room.seats[0]) }}</span>
              <span>{{ t('match.playersVersusSeparator') }}</span>
              <span
                class="match-room-player"
                :class="{ 'match-room-player--online': sharedRoom.room.seats[1]?.online }"
              >{{ sharedRoom.room.seats[1] ? getMatchRoomSeatLabel(sharedRoom.room.seats[1]) : '?' }}</span>
              <span>{{ getMatchRoomStatusSuffix(sharedRoom.room) }}</span>
            </div>
            <div class="shared-room-meta">
              {{ getMatchRoomSettingsMeta(sharedRoom.room) }}
            </div>
          </div>
          <p
            v-else
            class="dialog-message dialog-message-error"
            aria-live="polite"
          >
            {{ sharedRoom?.error || t('share.roomNotFound') }}
          </p>
          <div class="dialog-actions">
            <GameButton
              v-if="sharedRoom?.room?.ownSession && sharedRoom.room.status !== 'finished'"
              size="secondary"
              :style="menuButtonStyle"
              badge="!"
              @click="returnToSharedRoom"
            >
              <span>{{ t('match.returnToGame') }}</span>
            </GameButton>
            <GameButton
              v-else-if="sharedRoom?.room?.status === 'waiting'"
              size="secondary"
              :style="menuButtonStyle"
              @click="joinSharedRoom"
            >
              <span>{{ t('match.join') }}</span>
            </GameButton>
            <GameButton
              v-else-if="sharedRoom?.room && canViewMatchRoom(sharedRoom.room)"
              size="secondary"
              :style="menuButtonStyle"
              @click="viewSharedRoom"
            >
              <span>{{ getViewMatchRoomLabel(sharedRoom.room) }}</span>
            </GameButton>
            <GameButton
              size="secondary"
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
              size="secondary"
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
              size="secondary"
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
  height: 100vh; /* firefox */
  inset: 0;
  background-color: #8293b3;
  overflow: hidden;
  user-select: none;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
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
  background-color: #7889aa;
  pointer-events: auto;
}

.main-menu-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.main-menu-annihilation {
  position: absolute;
  top: calc(var(--button-content-gap) * 2);
  right: calc(var(--button-content-gap) * 2);
  z-index: 3;
  display: block;
  text-align: center;
  min-width: 128px;
  font-size: 20px;
  line-height: 1;
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  pointer-events: auto;
}

.main-menu-annihilation-score {
  white-space: nowrap;
  transform: translateY(var(--ui-text-y));
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
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: var(--main-menu-button-gap);
  transform: translateX(-50%);
}

.main-disclaimer {
  position: absolute;
  left: var(--main-menu-disclaimer-left);
  top: var(--main-menu-disclaimer-top);
  z-index: 1;
  width: var(--main-menu-disclaimer-width);
  margin: 0;
  color: var(--main-title-color);
  font-size: var(--main-menu-disclaimer-font-size);
  text-align: center;
  line-height: 1.25;
  text-shadow:
    var(--main-title-tertiary-shadow-x)
    var(--main-title-tertiary-shadow-y)
    0
    var(--main-title-shadow-color);
  pointer-events: none;
  user-select: none;
}

.main-disclaimer-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: max(1px, calc(var(--main-menu-disclaimer-font-size) * 0.06));
  text-underline-offset: 0.12em;
  pointer-events: auto;
}

.main-disclaimer-link:hover,
.main-disclaimer-link:focus-visible {
  color: var(--main-arrow-fill-color);
  outline: none;
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

.match-settings-panel {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow: auto;
}

.match-settings-list {
  width: min(680px, 100%);
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

.match-server-main,
.match-room-main {
  flex: 1 1 auto;
  min-width: 0;
}

.match-room-main {
  display: grid;
  grid-template-columns: minmax(max-content, 100px) minmax(0, 1fr);
  column-gap: calc(var(--button-content-gap) * 0.75);
  align-items: center;
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

.match-room-side {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.match-room-meta-stack {
  min-width: 0;
  text-align: left;
}

.match-server-meta,
.match-room-meta,
.match-error,
.match-empty {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.match-room-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-room-player--online {
  color: rgb(92 135 95);
  opacity: 1;
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

.match-room-fields {
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
}

.match-server--custom-room .match-room {
  padding-top: 0;
}

.match-server--custom-room .match-room-fields {
  flex: 0 1 440px;
  min-width: 0;
}

.match-radio-group,
.settings-radio-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
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

.clock-card {
  position: absolute;
  left: var(--button-top);
  top: var(--button-top);
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 260px;
  padding: calc(var(--button-content-gap) * 1.25) calc(var(--button-content-gap) * 1.75);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  font-size: 20px;
  line-height: 1;
  pointer-events: none;
}

.clock-row {
  display: grid;
  grid-template-columns: minmax(64px, 1fr) 64px auto 64px;
  gap: calc(var(--button-content-gap) * 0.75);
  align-items: baseline;
  opacity: 0.72;
  white-space: nowrap;
}

.clock-row--active {
  opacity: 1;
}

.clock-player {
  transform: translateY(var(--ui-text-y));
}

.clock-time {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.clock-separator {
  opacity: 0.65;
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
  grid-template-columns: max-content minmax(0, 1fr) calc(var(--button-icon-size) * 3.2);
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.75);
}

.record-section--plain {
  display: contents;
}

.record-section--branch,
.record-section--deduction,
.record-section--pending {
  box-sizing: border-box;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: max-content minmax(0, 1fr) calc(var(--button-icon-size) * 3.2);
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.75);
  margin: calc(var(--button-content-gap) * 0.25) 0 calc(var(--button-content-gap) * 0.25) var(--record-section-indent, 0px);
  padding-left: calc(var(--button-content-gap) * 1.35);
  border-left: 3px solid;
}

.record-section--branch,
.record-section--deduction {
  border-left-color: var(--main-arrow-fill-color);
}

.record-section--pending {
  border-left-color: rgb(220 206 96);
}

.record-row {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: baseline;
  padding: 2px var(--button-content-gap);
  border-radius: 8px;
  cursor: default;
}

.record-row--white {
  background: var(--record-white-bg);
  color: var(--record-white-text);
}

.record-row--black {
  background: var(--record-black-bg);
  color: var(--record-black-text);
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

.record-action-icons {
  display: grid;
  grid-template-columns: repeat(2, calc(var(--button-icon-size) * 0.85));
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 0.45);
  align-self: center;
  min-width: 0;
}

.record-action-icon {
  display: inline-grid;
  place-items: center;
  width: calc(var(--button-icon-size) * 0.85);
  height: calc(var(--button-icon-size) * 0.85);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.record-action-icon--current {
  grid-column: 2;
  opacity: 0.82;
}

.record-action-icon--branch {
  grid-column: 1;
}

.record-action-icon--branch,
.record-action-icon--jump {
  opacity: 0;
  cursor: pointer;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.record-action-icon--jump {
  grid-column: 2;
}

.record-row:hover .record-action-icon--branch,
.record-row:focus-within .record-action-icon--branch,
.record-row:hover .record-action-icon--jump,
.record-row:focus-within .record-action-icon--jump {
  opacity: 0.72;
  pointer-events: auto;
}

.record-action-icon--branch:hover,
.record-action-icon--branch:focus-visible,
.record-action-icon--jump:hover,
.record-action-icon--jump:focus-visible {
  opacity: 1;
  outline: none;
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
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: var(--button-top);
  background: var(--overlay-mask-color);
  pointer-events: auto;
}

.loading-backdrop {
  width: 100vw;
  height: 100vh;
  min-height: 100dvh;
  min-height: 100lvh;
  background: #8293b3;
}

.secondary-menu-card {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  box-sizing: border-box;
  max-height: max(160px, calc(var(--app-height) - var(--button-top) * 2));
  overflow: auto;
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
  box-sizing: border-box;
  width: min(720px, calc(100vw - var(--button-top) * 4));
  max-height: max(160px, calc(var(--app-height) - var(--button-top) * 2));
  overflow: auto;
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
  min-height: min(220px, 36vh);
  min-height: min(220px, 36dvh);
  flex: 1 1 auto;
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

.shared-room-content {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
  min-width: min(520px, calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10));
  min-height: 0;
  color: var(--button-text-color);
  text-align: center;
}

.shared-room-name {
  overflow: hidden;
  font-size: 24px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shared-room-meta {
  overflow: hidden;
  font-size: 16px;
  line-height: 1.25;
  opacity: 0.82;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 0;
  max-height: min(58vh, 560px);
  max-height: min(58dvh, 560px);
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
  min-height: 0;
  width: 100%;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
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
  white-space: nowrap;
}

.settings-row--stacked {
  align-items: center;
}

.settings-row--stacked > span {
  transform: translateY(var(--ui-text-y));
}

.settings-row--renderer {
  align-items: flex-start;
}

.settings-renderer-control {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
}

.settings-note {
  max-width: 240px;
  color: var(--button-text-color);
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.72;
  text-align: right;
  white-space: normal;
}

.settings-status {
  max-width: 260px;
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.2;
  text-align: right;
  transform: translateY(var(--ui-text-y));
  white-space: normal;
}

.piece-icon {
  display: inline-flex;
  width: var(--button-icon-size);
  height: var(--button-icon-size);
  object-fit: contain;
  pointer-events: none;
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
