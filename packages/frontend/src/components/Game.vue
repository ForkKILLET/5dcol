<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { FiveDPGN, Player } from '@5dcol/core'
import type { Action } from '@5dcol/core'
import {
  type ChatMessage,
  type MatchClock,
  type MatchGameState,
  type MatchPresence,
  type MatchRoom,
  type MatchRoomSettings,
  type MatchRoomStatus,
  type StudyBoardFocus,
  type StudyCommand,
  type StudyDocument,
  type StudyFollowMode,
  type StudyMember,
  type StudyPatch,
  type StudyPresence,
  type StudyPosition,
  type StudyRoom,
} from '@5dcol/shared/protocol'

import { Color4 } from '@engine/basic'
import { Animations, ButtonColors, Colors, Sizes, type ButtonColorPreset } from '@engine/constant'
import { Game, type GameExportFormat, type GameExportMode, type GameExportRequest, type GameRecordCursor, type GameRecordMoveFocusTarget, type GameRecordMoveSegment, type GameRecordRow, type GameStatusView, type GameToolbarButton } from '@engine/game'
import { isModifierKeyEvent, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, type GameWorkspaceState } from '@engine/gameState'
import { Logger, type GameMessage } from '@engine/logger'
import { getMainMenuLayout } from '@engine/mainMenuLayout'
import { MatchClient, type MatchRoomStateSubscription, type MatchServerState, type StudyRoomStateSubscription } from '@engine/matchClient'
import { formatDuration } from '@engine/record'
import {
  getRecordGlyphColor4,
  parseStoredRecordGlyphTemplates,
  RECORD_GLYPH_DEFAULT_COLOR,
  RECORD_GLYPH_TEMPLATE_STORAGE_KEY,
  type CustomRecordGlyphTemplate,
  uniqueRecordGlyphTemplates,
} from '@engine/recordGlyph'
import { getRecordMarkerAuthorColor, getRecordMarkerTextColor, parseRecordMarkerColor } from '@engine/recordMarker'
import { type Renderer } from '@engine/renderer'
import {
  createGameRenderer,
  parseRendererPreferenceParam,
  type RendererBackend,
  type RendererFallbackReason,
} from '@engine/rendererFactory'
import { type LoopingSound, SoundManager } from '@engine/sound'
import { getDefaultLanguage, isLanguage, LANGUAGES, type Language } from '@/i18n'
import {
  useMatch,
  type StoredOnlineRoom,
  type StoredOnlineSession,
} from '@/composables/match'
import { useLocalVersus, type LocalVersusSummary } from '@/composables/localVersus'
import { useLastRoom, type LastRoom } from '@/composables/lastRoom'
import { useGameSettings } from '@/composables/settings'
import { useLocalStudies, useStudyWorkspaces } from '@/composables/study'
import { useDialogStack } from '@/composables/dialogStack'
import { normalizeOnlineServerAddress } from '@/composables/online'
import { usePanelLayout, type GamePanelGroup, type GamePanelId, type GamePanelSide } from '@/composables/panelLayout'
import { removeStorageValue, useStorageRef } from '@/composables/storage'
import { UiSoundKey } from '@/composables/uiSound'
import ChatPanel from './ChatPanel.vue'
import ClockPanel from './ClockPanel.vue'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'
import GameIcon from './GameIcon.vue'
import GamePanelPicker, { type GamePanelPickerItem } from './GamePanelPicker.vue'
import GameSidePanelGroup, { type GameSidePanelTab } from './GameSidePanelGroup.vue'
import GameSidePanelStack from './GameSidePanelStack.vue'
import GameToggle from './GameToggle.vue'
import MainMenuAnimation from './MainMenuAnimation.vue'
import MembersPanel from './MembersPanel.vue'
import RecordPanel from './RecordPanel.vue'
import SettingsDialog from './SettingsDialog.vue'
import StudyPage from './StudyPage.vue'
import VersusPage from './VersusPage.vue'

const gameRoot = useTemplateRef('gameRoot')
const canvas = useTemplateRef('canvas')
const secondaryMenuCard = ref<HTMLElement | null>(null)

const VIEW_PLAYER_STORAGE_KEY = '5dcol.viewPlayer'
const LANGUAGE_STORAGE_KEY = '5dcol.language'

const messages = reactive<GameMessage[]>([])
const toolbarButtons = ref<GameToolbarButton[]>([])
const customRecordGlyphTemplates = useStorageRef<CustomRecordGlyphTemplate[]>(RECORD_GLYPH_TEMPLATE_STORAGE_KEY, [], {
  parse: parseStoredRecordGlyphTemplates,
  serialize: value => JSON.stringify(uniqueRecordGlyphTemplates(value)),
})
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
const recordText = ref('')
const recordActions = ref<GameRecordRow[]>([])
const recordHasPendingMoves = ref(false)
const recordCurrentActionIndex = ref(0)
const recordCurrentCursor = ref({ recordLineId: 0, recordActionIndex: 0 })
const recordFocusedMove = ref<(GameRecordMoveFocusTarget & { pulseId: number }) | null>(null)
const onlineStudyFocusedBoard = ref<StudyBoardFocus | null>(null)
const onlineStudyMembers = ref<StudyMember[]>([])
const onlineStudyPresence = ref<StudyPresence[]>([])
const onlineStudyChatMessages = ref<ChatMessage[]>([])
const onlineStudyFollowUserId = ref<string | null>(null)
let recordFocusedMovePulseId = 0
let focusedOnlineStudyMemberPulseId = 0
const focusedOnlineStudyMember = ref<{ userId: string; pulseId: number } | null>(null)
const secondaryMenuOpen = ref(false)
type DialogMode = 'language' | 'help' | 'settings' | 'import' | 'export' | 'share' | 'shared-room'
type GameImportFormat = 'pgn' | 'fen'
type GameImportTarget = 'active-game' | 'local-versus' | 'local-study'
type SettingsDialogTab = 'volume' | 'appearance' | 'game' | 'online' | 'fiveDPGN'
type StudyOpenSource =
  | { kind: 'local' }
  | { kind: 'online', serverAddress: string, roomId: string, version: number }
type MainMenuMode = 'home' | 'versus' | 'study'
const dialogStack = useDialogStack<DialogMode>()
const dialogMode = dialogStack.current
const settingsDialogInitialTab = ref<SettingsDialogTab>('volume')
const importText = ref('')
const importError = ref('')
const importFormat = ref<GameImportFormat>('pgn')
const importTarget = ref<GameImportTarget>('active-game')
const exportText = ref('')
const exportFormat = ref<GameExportFormat>('pgn')
const exportMode = ref<GameExportMode>('tree')
const exportHasPendingMoves = ref(false)
const exportCopyStatus = ref('')
const shareLink = ref('')
const shareCopyStatus = ref('')
const loading = ref(true)
const loadingError = ref('')
const requiredAssetsReady = ref(false)
const textureLoadProgress = ref({ completed: 0, total: 0 })
const soundLoadProgress = ref({ completed: 0, total: 0 })
const activeRendererBackend = ref<RendererBackend | null>(null)
const rendererFallbackReason = ref<RendererFallbackReason | null>(null)
const gameStarted = ref(false)
const mainMenuMode = ref<MainMenuMode>('home')
const activeLocalVersus = ref<LocalVersusSummary | null>(null)
const activeLocalStudy = ref<{ id: string; title: string } | null>(null)
const activeOnlineStudy = ref<{ serverAddress: string; roomId: string; version: number; title: string } | null>(null)
const coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const initialViewportSize = getViewportSize()
const viewportWidth = ref(initialViewportSize.width)
const viewportHeight = ref(initialViewportSize.height)
const hasCoarsePointer = ref(coarsePointerQuery.matches)
const systemPrefersDark = ref(systemThemeQuery.matches)
const onlineSession = ref<StoredOnlineSession | null>(null)
const onlineRoomRef = ref<StoredOnlineRoom | null>(null)
const onlineRoomStatus = ref<MatchRoomStatus | null>(null)
const onlineRoomSettings = ref<MatchRoomSettings | null>(null)
const onlineRoomSeats = ref<MatchRoom['seats'] | null>(null)
const onlineRoomStartedAt = ref<number | null>(null)
const onlineRoomWinner = ref<Player | null>(null)
const onlineRoomFinishReason = ref<MatchRoom['finishReason'] | null>(null)
const onlineRoomReady = ref(false)
const onlinePlayer = ref<Player | null>(null)
const onlinePresence = ref<MatchPresence | null>(null)
const onlineClock = ref<MatchClock | null>(null)
const onlineSpectatorCount = ref(0)
const clockNow = ref(Date.now())
const onlineConnectionStatus = ref<OnlineConnectionStatus>('offline')
const onlineError = ref('')
const onlineStudySaveStatus = ref<OnlineStudySaveStatus>('saved')
const documentFocused = ref(document.hasFocus())
const viewPlayer = useStorageRef<Player>(VIEW_PLAYER_STORAGE_KEY, Player.W, {
  parse: raw => raw === 'black' ? Player.B : Player.W,
  serialize: player => player === Player.W ? 'white' : 'black',
})
const gameSettings = useGameSettings()
const clockAvailable = computed(() => gameStarted.value && onlineSession.value !== null && onlineClock.value !== null)
const panelLayout = usePanelLayout({
  clockAvailable,
  onlineStudyActive: computed(() => activeOnlineStudy.value !== null),
  viewportWidth,
})
const panelPickerOpen = ref(false)
const panelPickerGroupId = ref<string | null>(null)
const recordPanelOpen = computed({
  get: () => panelLayout.isPanelOpen('record'),
  set: (open: boolean) => panelLayout.setPanelOpen('record', open),
})
const membersPanelOpen = computed({
  get: () => panelLayout.isPanelOpen('members'),
  set: (open: boolean) => panelLayout.setPanelOpen('members', open),
})
const logger = new Logger(messages)
let game: Game | null = null
let gameRenderer: Renderer | null = null
let soundManager: SoundManager | null = null
let ambienceLoop: LoopingSound | null = null
let ambienceVolumeApplied: number | null = null
let onlinePollTimer: number | null = null
let onlineReconnectTimer: number | null = null
let clockTimer: number | null = null
let onlineRoomStateSubscription: MatchRoomStateSubscription | null = null
let onlineStudyStateSubscription: StudyRoomStateSubscription | null = null
let onlineStudySubmitPending = false
let onlineStudyPresenceSignature = ''
let gameResizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null
let onlineRoomStateSubscriptionActive = false
let onlineActionsSignature = ''
let onlineLiveActions: Action[] = []
let pendingLocalActionsSignature = ''
let autoEnterLastRoomAttempted = false
const onlineLiveActionCount = ref(0)
const hasNewLiveActions = ref(false)
const spectatorDeductionStartActionIndex = ref<number | null>(null)

const query = new URLSearchParams(window.location.search)
const DOCUMENT_TITLE = '5D Chess Online'
const ORIGINAL_GAME_TITLE = '5D Chess With Multiverse Time Travel'
const ORIGINAL_GAME_STEAM_URL = 'https://store.steampowered.com/app/1349230/5D_Chess_With_Multiverse_Time_Travel/'
const ONLINE_RECONNECT_DELAY_MS = 1000
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
provide(UiSoundKey, playUISound)

type OnlineConnectionStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting'
type OnlineStudySaveStatus = 'saved' | 'saving' | 'failed'
type LastRoomInput = LastRoom extends infer Room
  ? Room extends LastRoom ? Omit<Room, 'updatedAt'> : never
  : never
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves', 'return-live-game'])
const recordActionButtonIds = new Set(['export-5dpgn'])

const { t, locale } = useI18n({ useScope: 'global' })
watch(language, value => {
  locale.value = value
}, { immediate: true })

const {
  canViewMatchRoom,
  clearLastOnlineGame,
  getMatchRoomSeatLabel,
  getMatchRoomSettingsMeta,
  getMatchRoomStatusSuffix,
  getMatchServerDisplayAddress,
  getOrAddMatchServer,
  getViewMatchRoomLabel,
  hasUnfinishedOnlineGame,
  joinMatchRoom,
  matchNickname,
  matchPanelMode,
  matchUserId,
  parseSharedRoomHash,
  returnToMatchRoom,
  sharedRoom,
  stopMatchServerRefresh,
  storeLastOnlineGame,
  syncLastOnlineGameFromServer,
  viewMatchRoom,
} = useMatch()
const {
  createGame: createLocalVersusGame,
  createGameFromText: createLocalVersusGameFromText,
  deleteGame: deleteLocalVersusGame,
  getGame: getLocalVersusGame,
  touchGame: touchLocalVersusGame,
} = useLocalVersus()
const {
  createStudyFromText: createLocalStudyFromText,
  getStudy: getLocalStudy,
  upsertStudy: upsertLocalStudy,
} = useLocalStudies()
const {
  getStudyWorkspace,
  upsertStudyWorkspace,
} = useStudyWorkspaces()
const {
  clearLastRoom,
  lastRoom,
  setLastRoom,
} = useLastRoom()

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
  if (! gameStarted.value) return ''
  if (activeOnlineStudy.value) return getOnlineStudyStatusText()
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

function getOnlineStudyStatusText() {
  if (onlineError.value) return t('online.error', { message: onlineError.value })
  switch (onlineConnectionStatus.value) {
    case 'connecting':
      return t('online.connecting')
    case 'reconnecting':
      return t('online.reconnecting')
    case 'offline':
      return t('online.offline')
    case 'connected':
      break
  }

  switch (onlineStudySaveStatus.value) {
    case 'saving':
      return t('online.studySaving')
    case 'failed':
      return t('online.studySaveFailed')
    case 'saved':
      return t('online.studySaved')
  }
}

function appendOnlineSpectatorCount(status: string) {
  if (! status || onlineSpectatorCount.value <= 0) return status
  return `${status} - ${t('online.spectators', { count: onlineSpectatorCount.value })}`
}

const clockRows = computed(() => {
  if (! clockAvailable.value || ! onlineClock.value) return []

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
  && gameSettings.turnAlertTitle
  && ! gameStatus.value.ended
  && onlineSession.value !== null
  && onlinePlayer.value !== null
  && gameStatus.value.player === onlinePlayer.value
  && ! documentFocused.value
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
const panelSides = ['left', 'right'] as const
const panelPickerItems = computed<GamePanelPickerItem[]>(() => (
  panelLayout.hiddenPanelIds.value.map(id => ({
    id,
    icon: getPanelIcon(id),
    label: getPanelLabel(id),
  }))
))
const uiOverlayOpen = computed(() => (
  secondaryMenuOpen.value || panelPickerOpen.value || dialogMode.value !== 'none' || ! gameStarted.value
))
const isOnlineSpectator = computed(() => onlineRoomStatus.value !== null && onlinePlayer.value === null)
const shouldShowReturnLiveButton = computed(() => (
  isOnlineSpectator.value
  && (
    hasNewLiveActions.value
    || spectatorDeductionStartActionIndex.value !== null
    || recordCurrentActionIndex.value !== onlineLiveActionCount.value
  )
))
const themePlayer = computed(() => {
  if (gameSettings.themeColor === 'black') return Player.B
  if (gameSettings.themeColor === 'white') return Player.W
  if (gameSettings.themeColor === 'system') {
    return systemPrefersDark.value ? Player.B : Player.W
  }
  return viewPlayer.value
})
const themeButtonPreset = computed(() => (
  themePlayer.value === Player.B ? ButtonColors.Black : ButtonColors.White
))
const themeHoverButtonPreset = computed(() => (
  themePlayer.value === Player.B ? ButtonColors.GreenBlack : ButtonColors.GreenWhite
))
const themeDisabledButtonPreset = computed(() => (
  themePlayer.value === Player.B ? ButtonColors.DisabledBlack : ButtonColors.DisabledWhite
))
const menuButtonStyle = computed(() => getPresetButtonStyle(
  themeButtonPreset.value,
  themeHoverButtonPreset.value,
  themeDisabledButtonPreset.value,
))
const mainMenuVisible = computed(() => ! loading.value && ! gameStarted.value)
const mainMenuLayout = computed(() => getMainMenuLayout(viewportWidth.value, viewportHeight.value))
const exportTextareaLineCount = computed(() => {
  const wrapColumn = 72
  const lineCount = exportText.value
    .split(/\r\n|\r|\n/)
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / wrapColumn)), 0)
  return Math.max(8, lineCount)
})
const gameButtonScale = computed(() => (
  hasCoarsePointer.value
    ? Math.min(1, Math.max(0.62, viewportHeight.value / 720))
    : 1
))
const uiStyle = computed(() => {
  const menuCardPreset = themeButtonPreset.value
  const buttonScale = gameButtonScale.value
  const scaled = (value: number) => value * buttonScale
  return {
    ...menuButtonStyle.value,
    '--button-width': `${scaled(Sizes.ButtonWidth)}px`,
    '--secondary-button-width': `${scaled(Sizes.SecondaryButtonWidth)}px`,
    '--button-circle-size': `${scaled(Sizes.ButtonHeight)}px`,
    '--button-height': `${scaled(Sizes.ButtonHeight)}px`,
    '--button-top': `${scaled(Sizes.ButtonTop)}px`,
    '--button-shadow-offset': `${scaled(Sizes.ButtonShadowOffset)}px`,
    '--button-small-height': `${scaled(Sizes.ButtonSmallHeight)}px`,
    '--small-button-shadow-offset': `${scaled(Sizes.SmallButtonShadowOffset)}px`,
    '--button-small-shadow-offset': `${scaled(Sizes.SmallButtonShadowOffset)}px`,
    '--button-tiny-height': `${scaled(Sizes.ButtonTinyHeight)}px`,
    '--button-tiny-shadow-offset': `${scaled(Sizes.ButtonTinyShadowOffset)}px`,
    '--badge-shadow-offset': `${scaled(Sizes.BadgeShadowOffset)}px`,
    '--button-border': `${scaled(Sizes.ButtonBorder)}px`,
    '--button-small-border': `${scaled(Sizes.ButtonSmallBorder)}px`,
    '--button-tiny-border': `${scaled(Sizes.ButtonTinyBorder)}px`,
    '--button-font-size': `${scaled(Sizes.ButtonFontSize)}px`,
    '--button-small-font-size': `${scaled(Sizes.ButtonSmallFontSize)}px`,
    '--button-tiny-font-size': `${scaled(Sizes.ButtonTinyFontSize)}px`,
    '--button-icon-size': `${scaled(Sizes.ButtonIconSize)}px`,
    '--button-small-icon-size': `${scaled(Sizes.ButtonSmallIconSize)}px`,
    '--button-tiny-icon-size': `${scaled(Sizes.ButtonTinyIconSize)}px`,
    '--button-content-gap': `${scaled(Sizes.ButtonContentGap)}px`,
    '--button-small-content-gap': `${scaled(Sizes.ButtonSmallContentGap)}px`,
    '--button-tiny-content-gap': `${scaled(Sizes.ButtonTinyContentGap)}px`,
    '--app-width': `${viewportWidth.value}px`,
    '--app-height': `${viewportHeight.value}px`,
    '--export-textarea-lines': String(exportTextareaLineCount.value),
    '--button-shadow-color': Color4.toRgbaString(Colors.Shadow),
    '--button-pulse-duration': `${Animations.PulseEffectDuration * 2}ms`,
    '--overlay-mask-color': Color4.toRgbaString(Colors.OverlayMask),
    '--menu-card-border-color': Color4.toRgbaString(menuCardPreset.border),
    '--menu-card-fill-color': Color4.toRgbaString(menuCardPreset.fill),
    '--record-white-bg': Color4.toRgbaString(ButtonColors.White.border),
    '--record-white-text': Color4.toRgbaString(ButtonColors.White.text),
    '--record-black-bg': Color4.toRgbaString(Color4.fromRgba(82, 82, 92, 1)),
    '--record-black-text': Color4.toRgbaString(ButtonColors.Black.text),
    '--record-block-border-width': `${Sizes.RecordBlockBorderWidth}px`,
    '--record-participant-color': getRecordAuthorColor(getRecordAuthorId()),
    '--record-participant-text-color': Color4.toRgbaString(getRecordMarkerTextColor(parseRecordMarkerColor(getRecordAuthorColor(getRecordAuthorId())))),
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

function getPresetButtonStyle(
  preset: ButtonColorPreset,
  hoverPreset: ButtonColorPreset = ButtonColors.GreenWhite,
  disabledPreset: ButtonColorPreset = themeDisabledButtonPreset.value,
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
  const disabledColors = {
    border: Color4.toRgbaString(disabledPreset.border),
    fill: Color4.toRgbaString(disabledPreset.fill),
    text: Color4.toRgbaString(disabledPreset.text),
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
    '--button-disabled-border-color': disabledColors.border,
    '--button-disabled-fill-color': disabledColors.fill,
    '--button-disabled-text-color': disabledColors.text,
  }
}

function getButtonStyle(button: GameToolbarButton) {
  const disabledColors = button.disabled ? button.colors : {
    border: menuButtonStyle.value['--button-disabled-border-color'],
    fill: menuButtonStyle.value['--button-disabled-fill-color'],
    text: menuButtonStyle.value['--button-disabled-text-color'],
  }
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
    '--button-disabled-border-color': disabledColors.border,
    '--button-disabled-fill-color': disabledColors.fill,
    '--button-disabled-text-color': disabledColors.text,
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

function getRecordAuthorId() {
  if (activeOnlineStudy.value && matchUserId.value) return matchUserId.value
  return onlineSession.value?.userId ?? 'local'
}

function getRecordAuthorColor(authorId: string) {
  return getRecordMarkerAuthorColor(authorId)
}

function getStudyMemberDisplayName(member: StudyMember | undefined, presence: StudyPresence | undefined): string {
  return member?.nickname?.trim()
    || presence?.nickname?.trim()
    || (member?.userId === matchUserId.value ? matchNickname.value.trim() : '')
    || t('members.anonymous')
}

function resolveRecordCursorTarget(
  target: { recordLineId: number, recordActionIndex: number } | null | undefined,
): GameRecordCursor | null {
  if (! target) return null
  const cursor = recordActions.value.find(row => (
    row.kind === 'cursor'
    && row.recordLineId === target.recordLineId
    && row.recordActionIndex === target.recordActionIndex
  ))
  return cursor?.kind === 'cursor' ? cursor : null
}

const recordPresenceCursors = computed(() => (
  onlineStudyPresence.value
    .filter(presence => presence.userId !== matchUserId.value)
    .map((presence) => {
      const cursor = game?.getRecordCursorFromStudyPosition(presence.cursor)
      if (! cursor) return null
      return {
        id: presence.userId,
        userId: presence.userId,
        nickname: presence.nickname,
        color: getRecordAuthorColor(presence.userId),
        recordLineId: cursor.recordLineId,
        recordActionIndex: cursor.recordActionIndex,
      }
    })
    .filter((cursor): cursor is NonNullable<typeof cursor> => cursor !== null)
))
const onlineStudyMemberRows = computed(() => {
  const presenceByUser = new Map(onlineStudyPresence.value.map(presence => [presence.userId, presence]))
  const memberByUser = new Map(onlineStudyMembers.value.map(member => [member.userId, member]))
  const userIds = [
    ...onlineStudyMembers.value.map(member => member.userId),
    ...onlineStudyPresence.value
      .map(presence => presence.userId)
      .filter(userId => ! memberByUser.has(userId)),
  ]
  const toBadge = (userId: string) => {
    const member = memberByUser.get(userId)
    const presence = presenceByUser.get(userId)
    return {
      id: userId,
      name: getStudyMemberDisplayName(member, presence),
      color: member?.color ?? getRecordAuthorColor(userId),
    }
  }

  return userIds.map((userId) => {
    const member = memberByUser.get(userId)
    const presence = presenceByUser.get(userId)
    const cursor = resolveRecordCursorTarget(presence ? game?.getRecordCursorFromStudyPosition(presence.cursor) : null)
    const current = userId === matchUserId.value
    const following = onlineStudyFollowUserId.value === userId
    return {
      id: userId,
      name: getStudyMemberDisplayName(member, presence),
      role: member ? t(`members.role.${member.role}`) : t('members.role.member'),
      color: member?.color ?? getRecordAuthorColor(userId),
      online: Boolean(presence),
      current,
      following,
      followingMembers: presence?.mode === 'following' && presence.followingUserId
        ? [toBadge(presence.followingUserId)]
        : [],
      followedBy: current
        ? onlineStudyPresence.value
          .filter(item => item.userId !== userId && item.mode === 'following' && item.followingUserId === userId)
          .map(item => toBadge(item.userId))
        : [],
      canJump: Boolean(cursor) && ! current,
      canFollow: ! current && (Boolean(cursor) || following),
    }
  })
})

function getRecordGlyphColor(glyph: string) {
  return getRecordGlyphColor4(glyph, customRecordGlyphTemplates.value)
}

function getFiveDPGNGlyphTemplates(): FiveDPGN.StudyGlyphTemplate[] {
  return customRecordGlyphTemplates.value.map((template, index) => ({
    nag: 140 + index,
    glyph: template.glyph,
    color: template.color,
  }))
}

function importFiveDPGNGlyphTemplates(input: string) {
  const templates = FiveDPGN.parseStudyGlyphTemplates(input)
    .map((template): CustomRecordGlyphTemplate => ({
      glyph: template.glyph,
      color: template.color ?? RECORD_GLYPH_DEFAULT_COLOR,
    }))
  if (templates.length === 0) return
  customRecordGlyphTemplates.value = uniqueRecordGlyphTemplates([
    ...customRecordGlyphTemplates.value,
    ...templates,
  ])
}

function updateRecord(request: GameExportRequest) {
  recordText.value = request.text
  recordActions.value = request.actions
  recordHasPendingMoves.value = request.hasPendingMoves
  recordCurrentActionIndex.value = request.currentActionIndex
  recordCurrentCursor.value = request.currentCursor
  syncOnlineStudyPresence(request.currentCursor)

  if (game && activeLocalStudy.value) {
    upsertLocalStudy(game.getStudyDocument(activeLocalStudy.value))
  }
  const studyWorkspaceId = getActiveStudyWorkspaceId()
  if (studyWorkspaceId) {
    upsertStudyWorkspace(studyWorkspaceId, {
      ...(getStudyWorkspace(studyWorkspaceId) ?? {}),
      recordCursor: request.currentCursor,
    })
  }
  if (activeLocalVersus.value) {
    touchLocalVersusGame(activeLocalVersus.value.id)
  }
}

function updateWorkspace(workspace: GameWorkspaceState) {
  onlineStudyFocusedBoard.value = workspace.focusedBoard ? { ...workspace.focusedBoard } : null
  syncOnlineStudyPresence(recordCurrentCursor.value)

  const studyWorkspaceId = getActiveStudyWorkspaceId()
  if (studyWorkspaceId) upsertStudyWorkspace(studyWorkspaceId, workspace)
}

function getActiveStudyWorkspaceId(): string | null {
  if (activeLocalStudy.value) return activeLocalStudy.value.id
  if (activeOnlineStudy.value) {
    return getOnlineStudyWorkspaceId(activeOnlineStudy.value.serverAddress, activeOnlineStudy.value.roomId)
  }
  return null
}

function getStudyWorkspaceId(study: StudyDocument, source: StudyOpenSource): string {
  return source.kind === 'local'
    ? study.id
    : getOnlineStudyWorkspaceId(source.serverAddress, source.roomId)
}

function getOnlineStudyWorkspaceId(serverAddress: string, roomId: string): string {
  return `online:${normalizeOnlineServerAddress(serverAddress)}:${roomId}`
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

function focusRecordMoveFromBoard(target: GameRecordMoveFocusTarget) {
  if (! gameStarted.value) return
  const request = game?.getFiveDPGNExport()
  if (request) updateRecord(request)
  recordFocusedMove.value = { ...target, pulseId: ++ recordFocusedMovePulseId }
  recordPanelOpen.value = true
}

function syncOnlineStudyPresence(
  cursor: { recordLineId: number, recordActionIndex: number },
  focusedBoard: StudyBoardFocus | null = onlineStudyFocusedBoard.value,
) {
  if (! activeOnlineStudy.value || ! onlineStudyStateSubscription || onlineConnectionStatus.value !== 'connected') return
  const position = game?.getStudyPositionForRecordCursor(cursor)
  if (! position) return

  const follow = getOnlineStudyPresenceFollowState()
  const signature = JSON.stringify({ position, focusedBoard, ...follow })
  if (signature === onlineStudyPresenceSignature) return
  onlineStudyPresenceSignature = signature
  onlineStudyStateSubscription.sendPresence(position, follow.mode, follow.followingUserId, focusedBoard)
}

function getOnlineStudyPresenceFollowState(): { mode: StudyFollowMode, followingUserId?: string } {
  const followingUserId = onlineStudyFollowUserId.value
  if (! followingUserId) return { mode: 'free' }
  return { mode: 'following', followingUserId }
}

function isCurrentOnlineStudyUserFollowed() {
  const currentUserId = matchUserId.value
  if (! currentUserId) return false
  return onlineStudyPresence.value.some(presence => (
    presence.userId !== currentUserId
    && presence.mode === 'following'
    && presence.followingUserId === currentUserId
  ))
}

function shouldPreserveOnlineStudyFollowOnManualCursorMove() {
  return Boolean(activeOnlineStudy.value && isCurrentOnlineStudyUserFollowed())
}

function upsertOnlineStudyPresence(presence: StudyPresence) {
  const index = onlineStudyPresence.value.findIndex(item => item.userId === presence.userId)
  if (index >= 0) onlineStudyPresence.value[index] = presence
  else onlineStudyPresence.value.push(presence)
  followOnlineStudyPresenceCursor(presence)
}

function followOnlineStudyPresenceCursor(presence: StudyPresence) {
  if (presence.userId !== onlineStudyFollowUserId.value) return
  const cursor = resolveRecordCursorTarget(game?.getRecordCursorFromStudyPosition(presence.cursor))
  if (! cursor) return
  recordPanelOpen.value = true
  rollbackToRecordCursor(cursor, {
    preserveOnlineStudyFollow: true,
    sound: false,
  })
  if (presence.focusedBoard) game?.focusBoard(presence.focusedBoard.l, presence.focusedBoard.m)
}

function followOnlineStudyCurrentPresence() {
  const followingUserId = onlineStudyFollowUserId.value
  if (! followingUserId) return
  const presence = onlineStudyPresence.value.find(item => item.userId === followingUserId)
  if (presence) followOnlineStudyPresenceCursor(presence)
}

function upsertOnlineStudyChatMessage(message: ChatMessage) {
  const index = onlineStudyChatMessages.value.findIndex(item => item.id === message.id)
  if (index >= 0) onlineStudyChatMessages.value[index] = message
  else onlineStudyChatMessages.value.push(message)
  onlineStudyChatMessages.value.sort((a, b) => a.createdAt - b.createdAt)
}

function sendOnlineStudyChatMessage(text: string) {
  if (! activeOnlineStudy.value || ! onlineStudyStateSubscription || onlineConnectionStatus.value !== 'connected') {
    onlineError.value = t('online.reconnecting')
    onlineConnectionStatus.value = 'reconnecting'
    return
  }
  onlineError.value = ''
  onlineStudyStateSubscription.sendChatMessage(text)
}

function toggleClockPanel() {
  if (! gameStarted.value || ! clockAvailable.value) return
  playUISound()
  gameSettings.showClock = panelLayout.togglePanel('clock')
}

function getPanelLabel(id: GamePanelId): string {
  switch (id) {
    case 'record':
      return t('button.record')
    case 'members':
      return t('button.members')
    case 'chat':
      return t('button.chat')
    case 'clock':
      return t('button.clock')
  }
}

function getPanelIcon(id: GamePanelId): GamePanelPickerItem['icon'] {
  switch (id) {
    case 'members':
      return 'members'
    case 'chat':
      return 'chat'
    case 'record':
      return 'record'
    case 'clock':
      return 'clock'
  }
}

function getPanelTabs(group: GamePanelGroup): GameSidePanelTab[] {
  return panelLayout.getGroupPanels(group).map(id => ({
    id,
    icon: getPanelIcon(id),
    label: getPanelLabel(id),
  }))
}

function openPanelPicker(groupId: string | null = null) {
  if (! gameStarted.value) return
  playUISound()
  panelPickerGroupId.value = groupId
  panelPickerOpen.value = true
}

function togglePanelPicker(groupId: string | null = null) {
  if (panelPickerOpen.value && panelPickerGroupId.value === groupId) {
    playUISound()
    closePanelPicker()
    return
  }
  openPanelPicker(groupId)
}

function closePanelPicker() {
  panelPickerOpen.value = false
  panelPickerGroupId.value = null
}

function addPanelToSide(panelId: GamePanelId, side: GamePanelSide) {
  playUISound()
  if (panelId === 'record') prepareRecordPanelOpen()
  if (panelId === 'clock') gameSettings.showClock = true
  panelLayout.addPanelToSide(panelId, side)
  closePanelPicker()
  syncGameViewportInsets()
}

function addPanelToGroup(panelId: GamePanelId, groupId: string) {
  playUISound()
  if (panelId === 'record') prepareRecordPanelOpen()
  if (panelId === 'clock') gameSettings.showClock = true
  panelLayout.addPanelToGroup(panelId, groupId)
  closePanelPicker()
  syncGameViewportInsets()
}

function selectPanelTab(groupId: string, panelId: GamePanelId) {
  playUISound()
  if (panelId === 'record') prepareRecordPanelOpen()
  panelLayout.setGroupActivePanel(groupId, panelId)
}

function closePanel(panelId: GamePanelId) {
  playUISound()
  if (panelId === 'clock') gameSettings.showClock = false
  panelLayout.setPanelOpen(panelId, false)
  syncGameViewportInsets()
}

function prepareRecordPanelOpen() {
  const request = game?.getFiveDPGNExport()
  if (request) updateRecord(request)
}

function getPanelStackTop(_side: GamePanelSide): string {
  return 'var(--button-top)'
}

function getPanelStackBottom(_side: GamePanelSide): string {
  return 'calc(var(--button-top) + var(--button-height) + var(--button-shadow-offset) + var(--button-content-gap) * 2)'
}

function getPanelStackMinSize(side: GamePanelSide): number {
  return side === 'right' ? Sizes.RecordPanelMinWidth : 260
}

function updateSidePanelWidth(side: GamePanelSide, width: number) {
  panelLayout.setSideSize(side, width)
  syncGameViewportInsets()
}

function ensureClockPanelOpenIfNeeded() {
  if (! clockAvailable.value || ! gameSettings.showClock) return
  panelLayout.setPanelOpen('clock', true)
}

function startSidePanelGroupResize(side: GamePanelSide, groupId: string, event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : event.target instanceof HTMLElement
      ? event.target
      : null
  if (! handle) return

  const stack = handle.closest<HTMLElement>('.game-side-panel-stack')
  const totalHeight = stack?.getBoundingClientRect().height ?? 0
  const snapshot = panelLayout.getGroupResizeSnapshot(side, groupId)
  if (! snapshot || totalHeight <= 0) return

  const pointerId = event.pointerId
  const startClientY = event.clientY
  handle.setPointerCapture(pointerId)
  document.documentElement.classList.add('game-side-panel-vertical-resizing')

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    panelLayout.resizeGroupPair(side, snapshot, moveEvent.clientY - startClientY, totalHeight)
  }

  const stop = (stopEvent: PointerEvent | Event) => {
    if ('pointerId' in stopEvent && stopEvent.pointerId !== pointerId) return
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
    handle.removeEventListener('lostpointercapture', stop)
    window.removeEventListener('blur', stop)
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    document.documentElement.classList.remove('game-side-panel-vertical-resizing')
  }

  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
  handle.addEventListener('lostpointercapture', stop)
  window.addEventListener('blur', stop)
}

function jumpToOnlineStudyMember(userId: string) {
  const presence = onlineStudyPresence.value.find(item => item.userId === userId)
  if (! presence) return
  const cursor = resolveRecordCursorTarget(game?.getRecordCursorFromStudyPosition(presence.cursor))
  if (! cursor) return
  recordPanelOpen.value = true
  setOnlineStudyFollowUser(null)
  rollbackToRecordCursor(cursor)
}

function followOnlineStudyMember(userId: string) {
  const nextUserId = onlineStudyFollowUserId.value === userId ? null : userId
  setOnlineStudyFollowUser(nextUserId)
  playUISound()
  if (! nextUserId) return

  const presence = onlineStudyPresence.value.find(item => item.userId === nextUserId)
  if (presence) followOnlineStudyPresenceCursor(presence)
}

function setOnlineStudyFollowUser(userId: string | null) {
  onlineStudyFollowUserId.value = userId
  onlineStudyPresenceSignature = ''
  syncOnlineStudyPresence(recordCurrentCursor.value)
}

function focusOnlineStudyMember(userId: string | null) {
  if (! activeOnlineStudy.value) return
  playUISound()
  membersPanelOpen.value = true
  if (! userId) return
  focusedOnlineStudyMember.value = {
    userId,
    pulseId: ++ focusedOnlineStudyMemberPulseId,
  }
}

function playMainMenuAnnihilateSound() {
  soundManager?.play('vibraslap_short.ogg', { volume: gameSettings.uiVolume })
}

function focusRecordSegment(segment: GameRecordMoveSegment) {
  if (! gameStarted.value) return
  playUISound()
  game?.focusRecordMoveSegment(segment)
}

function rollbackToRecordCursor(
  cursor: GameRecordCursor,
  {
    preserveOnlineStudyFollow = false,
    sound = true,
  }: { preserveOnlineStudyFollow?: boolean, sound?: boolean } = {},
) {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  if (
    activeOnlineStudy.value
    && ! preserveOnlineStudyFollow
    && ! shouldPreserveOnlineStudyFollowOnManualCursorMove()
  ) setOnlineStudyFollowUser(null)
  if (sound) playUISound()
  game?.rollbackToRecordCursor(cursor)
}

function isRecordCursor(row: GameRecordRow): row is GameRecordCursor {
  return row.kind === 'cursor'
}

function jumpRecordCursor(direction: -1 | 1) {
  if (! gameStarted.value) return
  if (onlineSession.value) return

  const cursors = recordActions.value.filter(isRecordCursor)
  const currentIndex = cursors.findIndex(cursor => cursor.current === true)
  if (currentIndex < 0) return

  const current = cursors[currentIndex]!
  const target = cursors.find(cursor => (
    cursor.recordLineId === current.recordLineId
    && cursor.recordActionIndex === current.recordActionIndex + direction
  ))
  if (! target) return

  if (game?.rollbackToRecordCursor(target)) {
    if (activeOnlineStudy.value && ! shouldPreserveOnlineStudyFollowOnManualCursorMove()) {
      setOnlineStudyFollowUser(null)
    }
    playUISound()
  }
}

function jumpRecordBlockBoundary(boundary: 'start' | 'end') {
  if (! gameStarted.value) return
  if (onlineSession.value) return

  const cursors = recordActions.value.filter(isRecordCursor)
  const current = cursors.find(cursor => cursor.current === true)
  if (! current) return

  const blockCursors = cursors.filter(cursor => cursor.recordLineId === current.recordLineId)
  const target = blockCursors.reduce<GameRecordCursor | null>((selected, cursor) => {
    if (! selected) return cursor
    return boundary === 'start'
      ? (cursor.recordActionIndex < selected.recordActionIndex ? cursor : selected)
      : (cursor.recordActionIndex > selected.recordActionIndex ? cursor : selected)
  }, null)
  if (! target) return
  if (
    target.recordLineId === current.recordLineId
    && target.recordActionIndex === current.recordActionIndex
  ) return

  if (game?.rollbackToRecordCursor(target)) {
    if (activeOnlineStudy.value && ! shouldPreserveOnlineStudyFollowOnManualCursorMove()) {
      setOnlineStudyFollowUser(null)
    }
    playUISound()
  }
}

function cycleRecordCursorVariation() {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  if (game?.cycleRecordCursorVariation()) {
    if (activeOnlineStudy.value && ! shouldPreserveOnlineStudyFollowOnManualCursorMove()) {
      setOnlineStudyFollowUser(null)
    }
    playUISound()
  }
}

function deleteRecordFuture(cursor: GameRecordCursor) {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  if (game?.deleteRecordFutureAtCursor(cursor)) {
    if (activeOnlineStudy.value && ! shouldPreserveOnlineStudyFollowOnManualCursorMove()) {
      setOnlineStudyFollowUser(null)
    }
    playUISound()
  }
}

function replaceRecordActionComments(payload: {
  recordLineId: number
  recordActionIndex: number
  position: 'after'
  texts: string[]
}) {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  if (game?.replaceRecordActionComments(payload)) playUISound()
}

function replaceRecordMoveGlyphs(payload: {
  recordLineId: number
  recordActionIndex: number
  moveIndex: number
  glyphs: string[]
}) {
  if (! gameStarted.value) return
  if (onlineSession.value) return
  if (game?.replaceRecordMoveGlyphs(payload)) playUISound()
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
  dialogStack.push('language')
}

function openHelpDialog() {
  playUISound()
  dialogStack.open('help')
}

function openSettingsDialog(initialTab: SettingsDialogTab = 'volume') {
  playUISound()
  secondaryMenuOpen.value = false
  settingsDialogInitialTab.value = initialTab
  dialogStack.push('settings')
}

function toggleSettingsDialog() {
  if (dialogMode.value === 'settings') {
    playUISound()
    closeDialog()
    return
  }

  openSettingsDialog()
}

function openFiveDPGNSettingsFromExport() {
  openSettingsDialog('fiveDPGN')
}

function openOnlineSettingsDialog() {
  openSettingsDialog('online')
}

function openGitHub() {
  playUISound()
  window.open('https://github.com/ForkKILLET/5dcol', '_blank', 'noopener,noreferrer')
}

function openVersusPage() {
  playUISound()
  mainMenuMode.value = 'versus'
}

function closeVersusPage() {
  playUISound()
  stopMatchServerRefresh()
  matchPanelMode.value = 'servers'
  mainMenuMode.value = 'home'
}

function openStudyPage() {
  playUISound()
  mainMenuMode.value = 'study'
}

function closeStudyPage() {
  playUISound()
  mainMenuMode.value = 'home'
}

async function returnToSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room || state.kind !== 'match') return
  closeDialog(false)
  await returnToMatchRoom(state.server, state.room)
}

async function joinSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room || state.kind !== 'match') return
  closeDialog(false)
  await joinMatchRoom(state.server, state.room.id)
}

async function viewSharedRoom() {
  const state = sharedRoom.value
  if (! state?.room || state.kind !== 'match') return
  closeDialog(false)
  await viewMatchRoom(state.server, state.room)
}

async function openSharedStudy() {
  const state = sharedRoom.value
  if (! state?.room || state.kind !== 'study') return
  closeDialog(false)
  const client = new MatchClient(state.server.address)
  const response = await client.joinStudy(state.room.id, {
    userId: matchUserId.value ?? undefined,
    nickname: matchNickname.value,
  })
  matchUserId.value = response.user.id
  startStudyGame(response.room.document, {
    kind: 'online',
    serverAddress: state.server.address,
    roomId: response.room.id,
    version: response.room.version,
  })
}

function returnToSharedStudy() {
  closeDialog(false)
}

function isCurrentSharedStudyRoom(): boolean {
  const state = sharedRoom.value
  return Boolean(
    state?.kind === 'study'
    && state.room
    && activeOnlineStudy.value
    && activeOnlineStudy.value.serverAddress === state.server.address
    && activeOnlineStudy.value.roomId === state.room.id,
  )
}

function getSharedStudyMeta(study: StudyRoom) {
  return [
    t('study.meta', {
      actions: study.document.actions.length,
      annotations: study.document.annotations.length,
      date: new Date(study.updatedAt).toLocaleDateString(),
    }),
    t('study.members', {
      count: String(study.members.length),
    }),
  ].join(' - ')
}

function getSharedStudySettingsMeta(study: StudyRoom) {
  return study.private
    ? t('study.private')
    : t('study.public')
}

function selectLanguage(nextLanguage: Language) {
  playUISound()
  language.value = nextLanguage
  closeDialog(false)
}

function openImportDialog(target: GameImportTarget = 'active-game') {
  playUISound()
  secondaryMenuOpen.value = false
  importTarget.value = target
  importFormat.value = 'pgn'
  importText.value = ''
  importError.value = ''
  dialogStack.open('import')
}

function openExportDialog(request: GameExportRequest) {
  playUISound()
  secondaryMenuOpen.value = false
  exportFormat.value = request.format
  exportMode.value = request.mode
  syncExportDialogText()
  exportCopyStatus.value = ''
  dialogStack.open('export')
}

function syncExportDialogText() {
  const request = game?.getFiveDPGNExport(exportMode.value, exportFormat.value)
  if (! request) return

  exportText.value = request.text
  exportHasPendingMoves.value = request.hasPendingMoves
}

async function openShareRoomDialog() {
  playUISound()
  secondaryMenuOpen.value = false
  shareCopyStatus.value = ''
  shareLink.value = getCurrentRoomShareLink()
  dialogStack.open('share')
  await copyShareLink(false)
}

function closeDialog(playSound = true) {
  if (playSound && dialogMode.value !== 'none') playUISound()
  dialogStack.close()
  importError.value = ''
  exportCopyStatus.value = ''
  shareCopyStatus.value = ''
}

function backDialog() {
  if (dialogMode.value === 'none') return
  playUISound()
  if (dialogMode.value === 'settings' && dialogStack.previous.value === 'export') {
    syncExportDialogText()
  }
  dialogStack.back()
  if (dialogStack.stack.value.length === 0) {
    importError.value = ''
    exportCopyStatus.value = ''
    shareCopyStatus.value = ''
  }
}

function syncGameInputState() {
  game?.setGameInputDisabled(uiOverlayOpen.value)
}

function syncGameViewportInsets() {
  const insets = panelLayout.viewportInsets.value
  game?.setViewportInsets({
    left: insets.left,
    right: insets.right,
  })
}

function getViewportSize() {
  const rootRect = gameRoot.value?.getBoundingClientRect()
  if (rootRect && rootRect.width > 0 && rootRect.height > 0) {
    return {
      width: Math.ceil(rootRect.width),
      height: Math.ceil(rootRect.height),
    }
  }

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

function syncResize() {
  resizeFrame = null
  const size = getViewportSize()
  viewportWidth.value = size.width
  viewportHeight.value = size.height
  syncGameViewportInsets()
  gameRenderer?.resize()
}

function scheduleResize() {
  if (resizeFrame !== null) return
  resizeFrame = window.requestAnimationFrame(syncResize)
}

function handleWindowResize() {
  scheduleResize()
}

function handleCoarsePointerChange() {
  hasCoarsePointer.value = coarsePointerQuery.matches
}

function handleSystemThemeChange() {
  systemPrefersDark.value = systemThemeQuery.matches
}

function submitImportDialog() {
  const text = importText.value.trim()
  if (! text) return
  playUISound()

  if (importTarget.value === 'local-versus') {
    const result = createLocalVersusGameFromText(text, {
      title: t('versus.imported'),
    })
    if (! result.game) {
      importError.value = result.error || t('error.importFailed')
      return
    }
    importFiveDPGNGlyphTemplates(text)
    closeDialog(false)
    startLocalGame(result.game)
    return
  }

  if (importTarget.value === 'local-study') {
    const result = createLocalStudyFromText(text, {
      title: t('study.imported'),
    })
    if (! result.study) {
      importError.value = result.error || t('error.importFailed')
      return
    }
    importFiveDPGNGlyphTemplates(text)
    closeDialog(false)
    startStudyGame(result.study, { kind: 'local' }, { playSound: false })
    return
  }

  if (game) {
    const error = game.importFiveDPGNText(text)
    if (error) {
      importError.value = error === 'Failed to import game record' || error === 'Failed to import 5dpgn'
        ? t('error.importFailed')
        : error
      return
    }
    importFiveDPGNGlyphTemplates(text)
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
  const study = activeOnlineStudy.value
  const url = new URL(window.location.href)
  if (room) {
    url.hash = `versus=${encodeURIComponent(JSON.stringify({
        server: room.serverAddress,
        room: room.roomId,
      }))}`
  }
  else if (study) {
    url.hash = `study=${encodeURIComponent(JSON.stringify({
        server: study.serverAddress,
        room: study.roomId,
      }))}`
  }
  else {
    url.hash = ''
  }
  return url.toString()
}

async function openSharedRoomFromHash() {
  const payload = parseSharedRoomHash(window.location.hash)
  if (! payload) return

  clearSharedRoomHash()
  const server = getOrAddMatchServer(payload.server)
  sharedRoom.value = {
    kind: payload.kind,
    server,
    room: null,
    roomId: payload.room,
    loading: true,
    error: '',
  }
  dialogStack.open('shared-room')

  try {
    if (payload.kind === 'match') {
      await openSharedMatchRoomFromHashPayload(server, payload.room)
    }
    else {
      await openSharedStudyRoomFromHashPayload(server, payload.room)
    }
  }
  catch (err) {
    server.rooms = []
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
    sharedRoom.value = {
      kind: payload.kind,
      server,
      room: null,
      roomId: payload.room,
      loading: false,
      error: server.error || t('match.failedMessage'),
    }
  }
}

function clearSharedRoomHash() {
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(window.history.state, '', url)
}

async function openSharedMatchRoomFromHashPayload(server: MatchServerState, roomId: string) {
  const client = new MatchClient(server.address)
  const [info, state] = await Promise.all([
    client.getInfo(),
    client.getRoomState(roomId, { userId: matchUserId.value ?? undefined }),
  ])
  server.name = info.name
  server.rooms = upsertMatchRoom(server.rooms, state.room)
  server.status = 'connected'
  server.error = ''
  syncLastOnlineGameFromServer(server)

  sharedRoom.value = {
    kind: 'match',
    server,
    room: state.room,
    roomId,
    loading: false,
    error: '',
  }
}

async function openSharedStudyRoomFromHashPayload(server: MatchServerState, roomId: string) {
  const client = new MatchClient(server.address)
  const [info, state] = await Promise.all([
    client.getInfo(),
    client.getStudyState(roomId),
  ])
  server.name = info.name
  server.status = 'connected'
  server.error = ''

  sharedRoom.value = {
    kind: 'study',
    server,
    room: state.room,
    roomId,
    loading: false,
    error: '',
  }
}

function upsertMatchRoom(rooms: MatchRoom[], room: MatchRoom): MatchRoom[] {
  const next = rooms.filter(current => current.id !== room.id)
  next.push(room)
  return next
}

function getSharedRoomDialogTitle() {
  const state = sharedRoom.value
  if (state?.kind === 'match') return t('share.sharedVersusRoomTitle')
  if (state?.kind === 'study') return t('share.sharedStudyRoomTitle')
  return t('dialog.sharedRoomTitle')
}

function isShortcutBlocked(e: KeyboardEvent): boolean {
  return (
    e.repeat
    || isModifierKeyEvent(e)
    || isTextInputEvent(e)
    || dialogMode.value !== 'none'
  )
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (! loading.value && ! gameStarted.value) startAmbience()

  if (e.key === 'Escape') {
    e.preventDefault()
    if (dialogMode.value !== 'none') backDialog()
    else if (panelPickerOpen.value) closePanelPicker()
    else if (! gameStarted.value && mainMenuMode.value === 'versus') {
      closeVersusPage()
    }
    else if (! gameStarted.value && mainMenuMode.value === 'study') {
      closeStudyPage()
    }
    else if (gameStarted.value) toggleSecondaryMenu()
    return
  }

  if (
    e.key === '`'
    && ! loading.value
    && ! e.repeat
    && ! isModifierKeyEvent(e)
    && ! isTextInputEvent(e)
    && (dialogMode.value === 'none' || dialogMode.value === 'settings')
  ) {
    e.preventDefault()
    toggleSettingsDialog()
    return
  }

  if (! gameStarted.value || isShortcutBlocked(e)) return

  switch (e.key) {
    case '{':
      e.preventDefault()
      jumpRecordBlockBoundary('start')
      break
    case '}':
      e.preventDefault()
      jumpRecordBlockBoundary('end')
      break
    case '[':
      e.preventDefault()
      if (e.shiftKey) jumpRecordBlockBoundary('start')
      else jumpRecordCursor(-1)
      break
    case ']':
      e.preventDefault()
      if (e.shiftKey) jumpRecordBlockBoundary('end')
      else jumpRecordCursor(1)
      break
    case '\\':
      e.preventDefault()
      cycleRecordCursorVariation()
      break
    case 'r':
      e.preventDefault()
      toggleRecordPanel()
      break
    case 'p':
      e.preventDefault()
      togglePanelPicker()
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
  soundManager?.play('lightswitch.ogg', { volume: gameSettings.uiVolume })
  if (! loading.value) startAmbience()
}

function playBellSound() {
  soundManager?.play('bell.ogg', { volume: gameSettings.bellVolume })
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
  void tryAutoEnterLastRoom()
}

async function tryAutoEnterLastRoom() {
  if (autoEnterLastRoomAttempted) return
  autoEnterLastRoomAttempted = true
  if (! gameSettings.autoEnterLastRoom) return
  if (loading.value || gameStarted.value || dialogMode.value !== 'none' || sharedRoom.value !== null) return
  if (! gameRenderer || ! soundManager || ! lastRoom.value) return

  const room = lastRoom.value
  try {
    switch (room.kind) {
      case 'local-versus':
        autoEnterLocalVersusRoom(room)
        return
      case 'local-study':
        autoEnterLocalStudyRoom(room)
        return
      case 'online-versus':
        await autoEnterOnlineVersusRoom(room)
        return
      case 'online-study':
        await autoEnterOnlineStudyRoom(room)
        return
    }
  }
  catch (err) {
    logger.warn(`Failed to auto-enter last room: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function autoEnterLocalVersusRoom(room: Extract<LastRoom, { kind: 'local-versus' }>) {
  const localGame = getLocalVersusGame(room.id)
  if (! localGame) {
    clearLastRoom(room)
    return
  }
  startLocalGame(localGame, { playSound: false })
}

function autoEnterLocalStudyRoom(room: Extract<LastRoom, { kind: 'local-study' }>) {
  const study = getLocalStudy(room.id)
  if (! study) {
    clearLastRoom(room)
    return
  }
  startStudyGame(study, { kind: 'local' }, { playSound: false })
}

async function autoEnterOnlineVersusRoom(room: Extract<LastRoom, { kind: 'online-versus' }>) {
  const client = new MatchClient(room.serverAddress)
  const state = await client.getRoomState(room.roomId, { userId: matchUserId.value ?? undefined })
  startOnlineGame(room.serverAddress, state)
}

async function autoEnterOnlineStudyRoom(room: Extract<LastRoom, { kind: 'online-study' }>) {
  const client = new MatchClient(room.serverAddress)
  const response = await client.joinStudy(room.roomId, {
    userId: matchUserId.value ?? undefined,
    nickname: matchNickname.value,
  })
  matchUserId.value = response.user.id
  startStudyGame(response.room.document, {
    kind: 'online',
    serverAddress: room.serverAddress,
    roomId: response.room.id,
    version: response.room.version,
  }, { playSound: false })
}

function rememberLastRoom(room: LastRoomInput) {
  setLastRoom({
    ...room,
    updatedAt: Date.now(),
  })
}

function startLocalGame(
  localGame: LocalVersusSummary | null = null,
  { playSound = true }: { playSound?: boolean } = {},
) {
  if (! gameRenderer || ! soundManager || gameStarted.value) return

  if (playSound) playUISound()
  const localVersus = localGame ?? createLocalVersusGame(t('versus.untitled'))
  rememberLastRoom({ kind: 'local-versus', id: localVersus.id })
  activeLocalVersus.value = localVersus
  activeLocalStudy.value = null
  activeOnlineStudy.value = null
  stopOnlineStudyStateSubscription()
  onlineStudySubmitPending = false
  game = new Game({
    renderer: gameRenderer,
    inputElement: canvas.value!,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    storageKey: localVersus.storageKey,
    onToolbarChange: buttons => {
      toolbarButtons.value = buttons
    },
    onRecordChange: updateRecord,
    onStatusChange: updateGameStatus,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: gameSettings.autoSwitchViewPlayer,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    fiveDPGNOptions: gameSettings.fiveDPGN,
    getPointerDragThreshold: () => gameSettings.pointerDragThreshold,
    getFiveDPGNExportMetadata,
    getFiveDPGNGlyphTemplates,
    onViewPlayerChange: updateViewPlayer,
    onImportRequest: openImportDialog,
    onExportRequest: openExportDialog,
    onReturnToMainMenuRequest: returnToMainMenu,
    getUISoundVolume: () => gameSettings.uiVolume,
    getBellSoundVolume: () => gameSettings.bellVolume,
    getRecordAuthorId,
    getRecordAuthorColor,
    getRecordGlyphColor,
    onWorkspaceChange: updateWorkspace,
    onRecordMoveFocusRequest: focusRecordMoveFromBoard,
  })
  gameStarted.value = true
  syncGameInputState()
  game.start()
  syncGameViewportInsets()
}

function startStudyGame(
  study: StudyDocument,
  source: StudyOpenSource = { kind: 'local' },
  { playSound = true }: { playSound?: boolean } = {},
) {
  if (! gameRenderer || ! soundManager || gameStarted.value) return

  if (playSound) playUISound()
  const workspace = getStudyWorkspace(getStudyWorkspaceId(study, source))
  activeLocalVersus.value = null
  activeLocalStudy.value = null
  activeOnlineStudy.value = null
  onlineRoomRef.value = null
  stopOnlineStudyStateSubscription()
  onlineError.value = ''
  onlineStudySaveStatus.value = 'saved'
  onlineStudyMembers.value = []
  onlineStudyChatMessages.value = []
  onlineStudyFollowUserId.value = null
  onlineConnectionStatus.value = source.kind === 'online' ? 'connecting' : 'offline'
  focusedOnlineStudyMember.value = null
  if (source.kind === 'online') panelLayout.setOnlineStudyDefaultPanels()
  game = new Game({
    renderer: gameRenderer,
    inputElement: canvas.value!,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    initialActions: [],
    storageKey: null,
    onToolbarChange: buttons => {
      toolbarButtons.value = buttons
    },
    onRecordChange: updateRecord,
    onStatusChange: updateGameStatus,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: gameSettings.autoSwitchViewPlayer,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    fiveDPGNOptions: gameSettings.fiveDPGN,
    getPointerDragThreshold: () => gameSettings.pointerDragThreshold,
    toolbarMode: 'study',
    getFiveDPGNExportMetadata,
    getFiveDPGNGlyphTemplates,
    onViewPlayerChange: updateViewPlayer,
    onImportRequest: openImportDialog,
    onExportRequest: openExportDialog,
    onReturnToMainMenuRequest: returnToMainMenu,
    getUISoundVolume: () => gameSettings.uiVolume,
    getBellSoundVolume: () => gameSettings.bellVolume,
    getRecordAuthorId,
    getRecordAuthorColor,
    getRecordGlyphColor,
    canForfeitGame: () => false,
    canFinishGame: () => false,
    initialWorkspace: workspace,
    onWorkspaceChange: updateWorkspace,
    onRecordMoveFocusRequest: focusRecordMoveFromBoard,
    onStudyCommandRequest: source.kind === 'online'
      ? command => sendOnlineStudyCommand(source.serverAddress, source.roomId, command)
      : undefined,
    onStudyActionSubmitRequest: source.kind === 'online'
      ? (action, position) => submitOnlineStudyAction(source.serverAddress, source.roomId, action, position)
      : undefined,
  })
  gameStarted.value = true
  mainMenuMode.value = 'home'
  syncGameInputState()
  game.start()
  if (source.kind === 'local') {
    rememberLastRoom({ kind: 'local-study', id: study.id })
    activeLocalStudy.value = { id: study.id, title: study.title }
  }
  else {
    rememberLastRoom({
      kind: 'online-study',
      serverAddress: source.serverAddress,
      roomId: source.roomId,
    })
    activeOnlineStudy.value = {
      serverAddress: source.serverAddress,
      roomId: source.roomId,
      version: source.version,
      title: study.title,
    }
    startOnlineStudyStateSubscription(source.serverAddress, source.roomId, matchUserId.value)
  }
  game.loadStudyDocument(study, { workspace })
  syncGameViewportInsets()
}

function openStudyFromPage(study: StudyDocument, source?: StudyOpenSource) {
  startStudyGame(study, source, { playSound: false })
}

function startOnlineGame(serverAddress: string, state: MatchGameState) {
  if (! gameRenderer || ! soundManager || gameStarted.value) return

  rememberLastRoom({
    kind: 'online-versus',
    serverAddress,
    roomId: state.room.id,
  })
  activeLocalStudy.value = null
  activeLocalVersus.value = null
  activeOnlineStudy.value = null
  stopOnlineStudyStateSubscription()
  if (state.session) storeOnlineSession(serverAddress, state)
  stopOnlinePolling()
  onlineRoomRef.value = {
    serverAddress,
    roomId: state.room.id,
    roomName: state.room.name,
  }
  onlineRoomStatus.value = state.room.status
  onlineRoomSettings.value = state.room.settings
  onlineRoomSeats.value = state.room.seats
  onlineRoomStartedAt.value = state.room.startedAt ?? state.room.createdAt
  onlineRoomWinner.value = state.room.winner
  onlineRoomFinishReason.value = state.room.finishReason
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
    inputElement: canvas.value!,
    soundManager,
    logger,
    debug: query.get('debug') === '1',
    initialActions: state.actions,
    storageKey: null,
    localPlayer: state.session?.player ?? null,
    viewPlayer: viewPlayer.value,
    autoSwitchViewPlayer: false,
    showMoveTravelAnimation: gameSettings.showMoveTravelAnimation,
    fiveDPGNOptions: gameSettings.fiveDPGN,
    getPointerDragThreshold: () => gameSettings.pointerDragThreshold,
    getFiveDPGNExportMetadata,
    getFiveDPGNGlyphTemplates,
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
    getUISoundVolume: () => gameSettings.uiVolume,
    getBellSoundVolume: () => gameSettings.bellVolume,
    getRecordAuthorId,
    getRecordAuthorColor,
    getRecordGlyphColor,
    onWorkspaceChange: updateWorkspace,
    onRecordMoveFocusRequest: focusRecordMoveFromBoard,
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
  ensureClockPanelOpenIfNeeded()
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
  onlineRoomSeats.value = state.room.seats
  onlineRoomStartedAt.value = state.room.startedAt ?? state.room.createdAt
  onlineRoomWinner.value = state.room.winner
  onlineRoomFinishReason.value = state.room.finishReason
  onlineRoomReady.value = state.room.status === 'playing'
  onlineClock.value = state.clock
  onlineSpectatorCount.value = state.spectatorCount
  if (gameStarted.value && ! wasReady && onlineRoomReady.value) {
    alertOwnTurn(state)
  }
  if (state.session) onlinePlayer.value = state.session.player
  onlinePresence.value = state.presence
  onlineError.value = ''
  if (state.session) storeOnlineSession(serverAddress, state)
  ensureClockPanelOpenIfNeeded()
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
    if (receivedRemoteAction) alertOwnTurn(state)

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

function alertOwnTurn(state: MatchGameState) {
  if (! isOwnTurnInState(state)) return

  if (gameSettings.turnAlertSound) {
    soundManager?.play('bell.ogg', { volume: gameSettings.bellVolume })
  }

  if (gameSettings.turnAlertNotification) {
    void showTurnNotification(state.currentPlayer)
  }
}

function isOwnTurnInState(state: MatchGameState): boolean {
  return (
    state.room.status === 'playing'
    && state.session !== null
    && state.currentPlayer === state.session.player
  )
}

async function showTurnNotification(player: Player) {
  if (documentFocused.value) return

  const permission = await requestTurnNotificationPermission()
  if (permission !== 'granted') return

  const playerLabel = player === Player.B ? t('player.black') : t('player.white')
  new Notification(DOCUMENT_TITLE, {
    body: t('notification.yourTurn', { player: playerLabel }),
    tag: '5dcol-your-turn',
  })
}

async function requestTurnNotificationPermission(): Promise<NotificationPermission | null> {
  if (! ('Notification' in window)) return null
  if (Notification.permission !== 'default') return Notification.permission
  return await Notification.requestPermission()
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
  stopOnlineStudyStateSubscription()
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

function startOnlineStudyStateSubscription(
  serverAddress: string,
  roomId: string,
  userId: string | null,
) {
  stopOnlineStudyStateSubscription()
  const client = new MatchClient(serverAddress)
  onlineStudyStateSubscription = client.subscribeStudyState(
    roomId,
    userId,
    (event) => {
      const current = activeOnlineStudy.value
      if (! current || current.serverAddress !== serverAddress || current.roomId !== roomId) return

      switch (event.type) {
        case 'study-state':
          onlineStudySubmitPending = false
          onlineStudySaveStatus.value = 'saved'
          onlineStudyMembers.value = event.room.members
          onlineStudyPresence.value = event.presence
          onlineStudyChatMessages.value = [...event.chat].sort((a, b) => a.createdAt - b.createdAt)
          followOnlineStudyCurrentPresence()
          activeOnlineStudy.value = {
            ...current,
            version: event.room.version,
            title: event.room.document.title,
          }
          break
        case 'study-patch':
          {
            const followPatch = onlineStudySubmitPending
              && isOnlineStudySubmitPatchByUser(event.patch, matchUserId.value)
            if (! game?.applyStudyPatch(event.patch, { followPatch })) {
              onlineStudySubmitPending = false
              onlineStudySaveStatus.value = 'failed'
              void syncOnlineStudyState(serverAddress, roomId)
              return
            }
            if (followPatch) onlineStudySubmitPending = false
            if (onlineStudySaveStatus.value === 'saving') onlineStudySaveStatus.value = 'saved'
          }
          activeOnlineStudy.value = {
            ...current,
            version: event.version,
          }
          break
        case 'command-rejected':
          onlineStudySubmitPending = false
          onlineStudySaveStatus.value = 'failed'
          void syncOnlineStudyState(serverAddress, roomId)
          break
        case 'presence':
          upsertOnlineStudyPresence(event.presence)
          break
        case 'chat-message':
          upsertOnlineStudyChatMessage(event.message)
          break
      }
    },
    {
      onOpen: () => {
        onlineConnectionStatus.value = 'connected'
        onlineError.value = ''
        onlineStudyPresenceSignature = ''
        syncOnlineStudyPresence(recordCurrentCursor.value)
      },
      onError: () => {
        onlineStudySubmitPending = false
        if (onlineStudySaveStatus.value === 'saving') onlineStudySaveStatus.value = 'failed'
        onlineConnectionStatus.value = 'reconnecting'
      },
    },
  )
}

function submitOnlineStudyAction(
  serverAddress: string,
  roomId: string,
  action: Action,
  position: StudyPosition,
): boolean {
  const current = activeOnlineStudy.value
  if (! current || current.serverAddress !== serverAddress || current.roomId !== roomId) return false
  if (onlineStudySubmitPending) return true

  onlineStudySubmitPending = true
  if (! sendOnlineStudyCommand(serverAddress, roomId, {
    type: 'submit-action',
    position,
    action,
  })) {
    onlineStudySubmitPending = false
  }
  return true
}

function sendOnlineStudyCommand(
  serverAddress: string,
  roomId: string,
  command: StudyCommand,
): boolean {
  const current = activeOnlineStudy.value
  if (! current || current.serverAddress !== serverAddress || current.roomId !== roomId) return false
  if (! onlineStudyStateSubscription || onlineConnectionStatus.value !== 'connected') {
    onlineError.value = t('online.reconnecting')
    onlineConnectionStatus.value = 'reconnecting'
    onlineStudySaveStatus.value = 'failed'
    return false
  }

  onlineError.value = ''
  onlineStudySaveStatus.value = 'saving'
  onlineStudyStateSubscription.sendCommand(current.version, command)
  return true
}

function isOnlineStudySubmitPatchByUser(patch: StudyPatch, userId: string | null): boolean {
  if (! userId) return false
  switch (patch.type) {
    case 'append-action':
      return patch.action.authorId === userId
    case 'create-branch':
      return patch.actions.some(action => action.authorId === userId)
    case 'remove-future':
    case 'upsert-annotation':
    case 'delete-annotation':
    case 'update-title':
    case 'update-private':
      return false
  }
}

function stopOnlineStudyStateSubscription() {
  onlineStudySubmitPending = false
  onlineStudySaveStatus.value = 'saved'
  onlineStudyPresenceSignature = ''
  onlineStudyMembers.value = []
  onlineStudyPresence.value = []
  onlineStudyChatMessages.value = []
  onlineStudyFollowUserId.value = null
  onlineStudyFocusedBoard.value = null
  focusedOnlineStudyMember.value = null
  onlineStudyStateSubscription?.unsubscribe()
  onlineStudyStateSubscription = null
}

async function syncOnlineStudyState(serverAddress: string, roomId: string) {
  try {
    const client = new MatchClient(serverAddress)
    const state = await client.getStudyState(roomId)
    const current = activeOnlineStudy.value
    if (! current || current.serverAddress !== serverAddress || current.roomId !== roomId) return
    onlineStudySubmitPending = false
    if (onlineStudySaveStatus.value !== 'failed') onlineStudySaveStatus.value = 'saved'
    activeOnlineStudy.value = {
      ...current,
      version: state.room.version,
      title: state.room.document.title,
    }
    onlineStudyMembers.value = state.room.members
    onlineStudyPresence.value = state.presence
    onlineStudyChatMessages.value = [...state.chat].sort((a, b) => a.createdAt - b.createdAt)
    game?.loadStudyDocument(state.room.document, { focus: false })
    followOnlineStudyCurrentPresence()
    onlineConnectionStatus.value = 'connected'
  }
  catch (err) {
    onlineConnectionStatus.value = 'reconnecting'
    onlineError.value = err instanceof Error ? err.message : String(err)
  }
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

function syncGameSettings() {
  soundManager?.setVolume(1)
  if (ambienceLoop && ambienceVolumeApplied !== gameSettings.ambienceVolume) {
    stopAmbience()
    startAmbience()
  }
  game?.setAutoSwitchViewPlayer(onlineRoomStatus.value !== null ? false : gameSettings.autoSwitchViewPlayer)
  game?.setShowMoveTravelAnimation(gameSettings.showMoveTravelAnimation)
  game?.setFiveDPGNOptions(gameSettings.fiveDPGN)
}

function getFiveDPGNExportMetadata(): Pick<FiveDPGN.ExportOptions, 'headers' | 'result'> {
  const exportedAt = onlineRoomStartedAt.value ?? Date.now()
  const { date, time } = formatFiveDPGNDateTime(exportedAt)
  return {
    headers: {
      Event: onlineRoomRef.value?.roomName ?? '5D Chess Online',
      Site: getFiveDPGNSite(),
      Date: date,
      Time: time,
      Round: onlineRoomRef.value?.roomId ?? '-',
      White: getFiveDPGNPlayerName(Player.W),
      Black: getFiveDPGNPlayerName(Player.B),
    },
    result: getFiveDPGNResult(),
  }
}

function formatFiveDPGNDateTime(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  }
}

function getFiveDPGNSite(): string {
  return window.location.origin && window.location.origin !== 'null'
    ? window.location.origin
    : '?'
}

function getFiveDPGNPlayerName(player: Player): string {
  const seat = onlineRoomSeats.value?.find(seat => seat?.player === player)
  if (seat) return seat.nickname || 'Anonymous'
  return player === Player.W ? 'White' : 'Black'
}

function getFiveDPGNResult(): FiveDPGN.ExportResult {
  if (onlineRoomStatus.value === 'finished') {
    if (onlineRoomFinishReason.value === 'stalemate') return '1/2-1/2'
    if (onlineRoomWinner.value === Player.W) return '1-0'
    if (onlineRoomWinner.value === Player.B) return '0-1'
    return '*'
  }

  if (gameStatus.value.kind === 'stalemate') return '1/2-1/2'
  if (gameStatus.value.kind === 'checkmate') {
    if (gameStatus.value.player === Player.W) return '1-0'
    if (gameStatus.value.player === Player.B) return '0-1'
  }

  return '*'
}

function getClockStepMs(clock: MatchClock, player: Player, now: number): number {
  if (clock.currentPlayer !== player || clock.turnStartedAt === null) return 0
  return Math.max(0, now - clock.turnStartedAt)
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

function clearSavedGameState() {
  if (activeLocalVersus.value) {
    deleteLocalVersusGame(activeLocalVersus.value.id)
    return
  }
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
  stopOnlineStudyStateSubscription()
  onlineRoomStatus.value = null
  onlineRoomSettings.value = null
  onlineRoomSeats.value = null
  onlineRoomStartedAt.value = null
  onlineRoomWinner.value = null
  onlineRoomFinishReason.value = null
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
  activeLocalVersus.value = null
  activeLocalStudy.value = null
  activeOnlineStudy.value = null
  game?.dispose()
  game = null
  toolbarButtons.value = []
  recordText.value = ''
  recordActions.value = []
  recordHasPendingMoves.value = false
  recordCurrentActionIndex.value = 0
  recordCurrentCursor.value = { recordLineId: 0, recordActionIndex: 0 }
  recordFocusedMove.value = null
  focusedOnlineStudyMember.value = null
  secondaryMenuOpen.value = false
  closeDialog(false)
  gameStarted.value = false
  mainMenuMode.value = 'home'
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
  ambienceVolumeApplied = gameSettings.ambienceVolume
  ambienceLoop = soundManager?.playLoop('ambience.ogg', { volume: ambienceVolumeApplied }) ?? null
}

function stopAmbience() {
  ambienceLoop?.stop()
  ambienceLoop = null
  ambienceVolumeApplied = null
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

function blurActiveElement() {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}

function getSecondaryMenuFocusableElements(): HTMLElement[] {
  const card = secondaryMenuCard.value
  if (! card) return []

  return Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => (
      ! element.hasAttribute('disabled')
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ))
}

function trapSecondaryMenuTab(e: KeyboardEvent) {
  const card = secondaryMenuCard.value
  if (! card) return

  const focusable = getSecondaryMenuFocusableElements()
  if (focusable.length === 0) {
    e.preventDefault()
    card.focus({ preventScroll: true })
    return
  }

  const active = document.activeElement
  const activeIndex = active instanceof HTMLElement ? focusable.indexOf(active) : -1
  e.preventDefault()

  if (e.shiftKey) {
    const previousIndex = activeIndex > 0 ? activeIndex - 1 : focusable.length - 1
    focusable[previousIndex]!.focus({ preventScroll: true })
    return
  }

  const nextIndex = activeIndex >= 0 && active !== card ? (activeIndex + 1) % focusable.length : 0
  focusable[nextIndex]!.focus({ preventScroll: true })
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
  if (typeof ResizeObserver !== 'undefined' && gameRoot.value) {
    gameResizeObserver = new ResizeObserver(scheduleResize)
    gameResizeObserver.observe(gameRoot.value)
  }
  coarsePointerQuery.addEventListener('change', handleCoarsePointerChange)
  systemThemeQuery.addEventListener('change', handleSystemThemeChange)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  clockTimer = window.setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
  scheduleResize()
  void init()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  window.visualViewport?.removeEventListener('resize', handleWindowResize)
  gameResizeObserver?.disconnect()
  gameResizeObserver = null
  if (resizeFrame !== null) {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = null
  }
  coarsePointerQuery.removeEventListener('change', handleCoarsePointerChange)
  systemThemeQuery.removeEventListener('change', handleSystemThemeChange)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('blur', handleWindowBlur)
  stopMatchServerRefresh()
  stopOnlinePolling()
  stopOnlineRoomStateSubscription()
  stopOnlineStudyStateSubscription()
  stopAmbience()
  if (clockTimer !== null) window.clearInterval(clockTimer)
  game?.dispose()
  gameRenderer?.dispose()
  soundManager?.dispose()
  document.title = DOCUMENT_TITLE
})

watch(uiOverlayOpen, syncGameInputState)
watch(panelLayout.viewportInsets, syncGameViewportInsets)
watch(shouldMarkTitleForTurn, syncDocumentTitle, { immediate: true })
watch(() => gameSettings.turnAlertNotification, (enabled) => {
  if (enabled) void requestTurnNotificationPermission()
})
watch(secondaryMenuOpen, (open) => {
  if (! open) return
  void nextTick(() => {
    secondaryMenuCard.value?.focus({ preventScroll: true })
  })
})
watch(dialogMode, (mode, previousMode) => {
  if (mode !== 'none' || previousMode === 'none' || loading.value) return
  void nextTick(() => {
    if (dialogMode.value === 'none') blurActiveElement()
  })
})
watch(gameSettings, () => {
  syncGameSettings()
}, { deep: true })
watch([exportFormat, exportMode], () => {
  exportCopyStatus.value = ''
  syncExportDialogText()
})
</script>

<template>
  <div
    ref="gameRoot"
    class="game"
  >
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
        <MainMenuAnimation
          :visible="mainMenuVisible"
          :mode="mainMenuMode"
          :width="viewportWidth"
          :height="viewportHeight"
          :layout="mainMenuLayout"
          @interact="startAmbience"
          @ui-sound="playUISound"
          @annihilate-sound="playMainMenuAnnihilateSound"
        />
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
              :badge="hasUnfinishedOnlineGame ? '!' : ''"
              @click="openVersusPage"
            >
              <span>{{ t('main.versus') }}</span>
            </GameButton>
            <GameButton
              size="main"
              :style="menuButtonStyle"
              @click="openStudyPage"
            >
              <span>{{ t('main.study') }}</span>
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
        <VersusPage
          :active="mainMenuMode === 'versus'"
          :game-started="gameStarted"
          :main-menu-mode="mainMenuMode"
          :can-start-online-game="Boolean(gameRenderer && soundManager)"
          @close="closeVersusPage"
          @import-record="openImportDialog('local-versus')"
          @open-online-settings="openOnlineSettingsDialog"
          @start-local-game="startLocalGame"
          @start-online-game="startOnlineGame"
          @ui-sound="playUISound"
        />
        <StudyPage
          :active="mainMenuMode === 'study'"
          @close="closeStudyPage"
          @import-record="openImportDialog('local-study')"
          @open-online-settings="openOnlineSettingsDialog"
          @open-study="openStudyFromPage"
          @ui-sound="playUISound"
        />
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
          :pressed="button.pressed"
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
          class="language-button"
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
          :aria-label="t('panel.pickerTitle')"
          :aria-expanded="panelPickerOpen"
          @click="togglePanelPicker()"
        >
          <GameIcon name="panels" />
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
        v-if="gameStarted && panelPickerOpen"
        class="panel-picker-backdrop"
        @click="closePanelPicker"
      >
        <GamePanelPicker
          :style="menuButtonStyle"
          :title="t('panel.pickerTitle')"
          :items="panelPickerItems"
          :group-id="panelPickerGroupId ?? undefined"
          :empty-text="t('panel.noHiddenPanels')"
          :add-here-label="t('panel.addHere')"
          :add-left-label="t('panel.addLeft')"
          :add-right-label="t('panel.addRight')"
          @add-to-side="addPanelToSide"
          @add-to-group="addPanelToGroup"
          @click.stop
        />
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

      <template
        v-for="side in panelSides"
        :key="side"
      >
        <GameSidePanelStack
          v-if="gameStarted && panelLayout.getSideGroups(side).length > 0"
          :side="side"
          :style="menuButtonStyle"
          :size="panelLayout.getSideSize(side)"
          :min-size="getPanelStackMinSize(side)"
          :max-size="Math.max(getPanelStackMinSize(side), viewportWidth - Sizes.ButtonTop * 2)"
          :top="getPanelStackTop(side)"
          :bottom="getPanelStackBottom(side)"
          @resize-panel="updateSidePanelWidth(side, $event)"
        >
          <GameSidePanelGroup
            v-for="group in panelLayout.getSideGroups(side)"
            :key="group.id"
            :side="side"
            :group="group"
            :height="panelLayout.getGroupHeight(group)"
            :tabs="getPanelTabs(group)"
            :can-resize-after="panelLayout.canResizeGroupAfter(side, group.id)"
            :add-label="t('panel.addPanel')"
            :close-label="t('panel.closePanel')"
            @add-panel="openPanelPicker"
            @close-panel="closePanel"
            @resize-after="startSidePanelGroupResize"
            @select-panel="selectPanelTab"
          >
            <MembersPanel
              v-if="group.activePanelId === 'members'"
              :members="onlineStudyMemberRows"
              :focused-member-id="focusedOnlineStudyMember?.userId ?? null"
              :focus-pulse-id="focusedOnlineStudyMember?.pulseId ?? 0"
              :empty-text="t('members.empty')"
              :you-label="t('members.you')"
              :online-label="t('members.online')"
              :offline-label="t('members.offline')"
              :jump-label="t('members.jump')"
              :follow-label="t('members.follow')"
              :unfollow-label="t('members.unfollow')"
              :following-label="t('members.following')"
              :followed-by-label="t('members.followedBy')"
              @follow="followOnlineStudyMember"
              @jump="jumpToOnlineStudyMember"
            />
            <ChatPanel
              v-else-if="group.activePanelId === 'chat'"
              :messages="onlineStudyChatMessages"
              :current-user-id="matchUserId"
              :get-author-color="getRecordMarkerAuthorColor"
              :disabled="onlineConnectionStatus !== 'connected'"
              :empty-text="t('chat.empty')"
              :placeholder="t('chat.placeholder')"
              :send-label="t('chat.send')"
              @send="sendOnlineStudyChatMessage"
              @ui-sound="playUISound"
            />
            <ClockPanel
              v-else-if="group.activePanelId === 'clock'"
              :rows="clockRows"
            />
            <RecordPanel
              v-else-if="group.activePanelId === 'record'"
              :style="menuButtonStyle"
              :record-text="recordText"
              :rows="recordActions"
              :action-buttons="recordActionButtons"
              :has-pending-moves="recordHasPendingMoves"
              :online="onlineSession !== null"
              :online-spectator="isOnlineSpectator"
              :deduction-start-action-index="spectatorDeductionStartActionIndex"
              :focused-move="recordFocusedMove"
              :presence-cursors="recordPresenceCursors"
              :custom-glyph-templates="customRecordGlyphTemplates"
              @toolbar-button-click="clickToolbarButton"
              @focus-segment="focusRecordSegment"
              @focus-presence-member="focusOnlineStudyMember"
              @rollback-cursor="rollbackToRecordCursor"
              @delete-future="deleteRecordFuture"
              @replace-action-comments="replaceRecordActionComments"
              @replace-move-glyphs="replaceRecordMoveGlyphs"
              @update-custom-glyph-templates="customRecordGlyphTemplates = $event"
              @ui-sound="playUISound"
            />
          </GameSidePanelGroup>
        </GameSidePanelStack>
      </template>

      <div
        v-if="gameStarted && secondaryMenuOpen"
        class="menu-backdrop"
        @click="closeSecondaryMenu"
      >
        <div
          ref="secondaryMenuCard"
          class="secondary-menu-card"
          role="dialog"
          aria-modal="true"
          :aria-label="t('button.menu')"
          tabindex="-1"
          @click.stop
          @keydown.tab="trapSecondaryMenuTab"
        >
          <GameButton
            size="secondary"
            :style="menuButtonStyle"
            @click="openSettingsDialog"
          >
            <span>{{ t('main.settings') }}</span>
          </GameButton>
          <GameButton
            v-if="onlineRoomRef || activeOnlineStudy"
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
            :style="getButtonStyle(button)"
            :disabled="button.disabled"
            :pressed="button.pressed"
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

      <GameDialog
        v-if="dialogMode === 'language'"
        narrow
        :button-style="menuButtonStyle"
        :title="t('dialog.languageTitle')"
        @close="closeDialog()"
      >
        <div class="language-list">
          <GameButton
            v-for="option in languageOptions"
            :key="option.value"
            size="secondary"
            :style="getPresetButtonStyle(themeButtonPreset)"
            :pressed="option.value === language"
            @click="selectLanguage(option.value)"
          >
            <span>{{ option.label }}</span>
          </GameButton>
        </div>
      </GameDialog>

      <SettingsDialog
        v-else-if="dialogMode === 'settings'"
        :settings="gameSettings"
        :button-style="menuButtonStyle"
        :initial-tab="settingsDialogInitialTab"
        :renderer-status-text="rendererStatusText"
        @bell-volume-change="playBellSound"
        @close="closeDialog()"
        @volume-change="playUISound"
      />

      <GameDialog
        v-else-if="dialogMode === 'import'"
        :button-style="menuButtonStyle"
        :title="t('dialog.importTitle')"
        @close="closeDialog()"
      >
        <div class="export-controls">
          <div class="settings-row">
            <span>{{ t('import.format') }}</span>
            <div class="export-radio-group">
              <GameToggle
                v-model="importFormat"
                type="radio"
                value="pgn"
                :style="menuButtonStyle"
              >
                <span>{{ t('import.formatPGN') }}</span>
              </GameToggle>
              <GameToggle
                v-model="importFormat"
                type="radio"
                value="fen"
                :style="menuButtonStyle"
              >
                <span>{{ t('import.formatFEN') }}</span>
              </GameToggle>
            </div>
          </div>
        </div>
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
        <template #actions>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="closeDialog()"
          >
            <span>{{ t('button.cancel') }}</span>
          </GameButton>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            :disabled="importText.trim().length === 0"
            @click="submitImportDialog"
          >
            <span>{{ t('button.import') }}</span>
          </GameButton>
        </template>
      </GameDialog>

      <GameDialog
        v-else-if="dialogMode === 'export'"
        card-class="dialog-card--export"
        :button-style="menuButtonStyle"
        :title="t('dialog.exportTitle')"
        @close="closeDialog()"
      >
        <div class="export-controls">
          <div class="settings-row">
            <span>{{ t('export.format') }}</span>
            <div class="export-radio-group">
              <GameToggle
                v-model="exportFormat"
                type="radio"
                value="pgn"
                :style="menuButtonStyle"
              >
                <span>{{ t('export.formatPGN') }}</span>
              </GameToggle>
              <GameToggle
                v-model="exportFormat"
                type="radio"
                value="fen"
                :style="menuButtonStyle"
              >
                <span>{{ t('export.formatFEN') }}</span>
              </GameToggle>
            </div>
          </div>
          <div
            v-if="exportFormat === 'pgn'"
            class="settings-row"
          >
            <span>{{ t('export.mode') }}</span>
            <div class="export-radio-group">
              <GameToggle
                v-model="exportMode"
                type="radio"
                value="linear"
                :style="menuButtonStyle"
              >
                <span>{{ t('export.modeLinear') }}</span>
              </GameToggle>
              <GameToggle
                v-model="exportMode"
                type="radio"
                value="tree"
                :style="menuButtonStyle"
              >
                <span>{{ t('export.modeTree') }}</span>
              </GameToggle>
            </div>
          </div>
          <div
            v-if="exportFormat === 'pgn'"
            class="settings-row"
          >
            <span>{{ t('main.settings') }}</span>
            <GameButton
              size="small"
              :style="menuButtonStyle"
              @click="openFiveDPGNSettingsFromExport"
            >
              <span>{{ t('button.open') }}</span>
            </GameButton>
          </div>
        </div>
        <p
          v-if="exportHasPendingMoves"
          class="dialog-message"
        >
          {{ t('export.pendingNotExported') }}
        </p>
        <textarea
          v-model="exportText"
          class="dialog-textarea dialog-textarea--export"
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
        <template #actions>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="copyExportText"
          >
            <span>{{ t('button.copy') }}</span>
          </GameButton>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="closeDialog()"
          >
            <span>{{ t('button.close') }}</span>
          </GameButton>
        </template>
      </GameDialog>

      <GameDialog
        v-else-if="dialogMode === 'share'"
        :button-style="menuButtonStyle"
        :title="t('dialog.shareRoomTitle')"
        @close="closeDialog()"
      >
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
        <template #actions>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="copyShareLink()"
          >
            <span>{{ t('button.copy') }}</span>
          </GameButton>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="closeDialog()"
          >
            <span>{{ t('button.close') }}</span>
          </GameButton>
        </template>
      </GameDialog>

      <GameDialog
        v-else-if="dialogMode === 'shared-room'"
        narrow
        :button-style="menuButtonStyle"
        :title="getSharedRoomDialogTitle()"
        @close="closeDialog()"
      >
        <div
          v-if="sharedRoom?.loading"
          class="dialog-message"
          aria-live="polite"
        >
          {{ t('share.loadingRoom') }}
        </div>
        <div
          v-else-if="sharedRoom?.kind === 'match' && sharedRoom.room"
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
        <div
          v-else-if="sharedRoom?.kind === 'study' && sharedRoom.room"
          class="shared-room-content"
        >
          <div class="shared-room-name">{{ sharedRoom.room.name }}</div>
          <div class="shared-room-meta">
            {{ getMatchServerDisplayAddress(sharedRoom.server) }}
          </div>
          <div class="shared-room-meta">
            <span>{{ getSharedStudyMeta(sharedRoom.room) }}</span>
          </div>
          <div class="shared-room-meta">
            {{ getSharedStudySettingsMeta(sharedRoom.room) }}
          </div>
        </div>
        <p
          v-else
          class="dialog-message dialog-message-error"
          aria-live="polite"
        >
          {{ sharedRoom?.error || t('share.roomNotFound') }}
        </p>
        <template #actions>
          <GameButton
            v-if="sharedRoom?.kind === 'match' && sharedRoom.room?.ownSession && sharedRoom.room.status !== 'finished'"
            size="small"
            :style="menuButtonStyle"
            badge="!"
            @click="returnToSharedRoom"
          >
            <span>{{ t('match.returnToGame') }}</span>
          </GameButton>
          <GameButton
            v-else-if="sharedRoom?.kind === 'match' && sharedRoom.room?.status === 'waiting'"
            size="small"
            :style="menuButtonStyle"
            @click="joinSharedRoom"
          >
            <span>{{ t('match.join') }}</span>
          </GameButton>
          <GameButton
            v-else-if="sharedRoom?.kind === 'match' && sharedRoom.room && canViewMatchRoom(sharedRoom.room)"
            size="small"
            :style="menuButtonStyle"
            @click="viewSharedRoom"
          >
            <span>{{ getViewMatchRoomLabel(sharedRoom.room) }}</span>
          </GameButton>
          <GameButton
            v-if="sharedRoom?.kind === 'study' && sharedRoom.room && isCurrentSharedStudyRoom()"
            size="small"
            :style="menuButtonStyle"
            badge="!"
            @click="returnToSharedStudy"
          >
            <span>{{ t('study.returnToStudy') }}</span>
          </GameButton>
          <GameButton
            v-else-if="sharedRoom?.kind === 'study' && sharedRoom.room"
            size="small"
            :style="menuButtonStyle"
            @click="openSharedStudy"
          >
            <span>{{ t('button.open') }}</span>
          </GameButton>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="closeDialog()"
          >
            <span>{{ t('button.close') }}</span>
          </GameButton>
        </template>
      </GameDialog>

      <GameDialog
        v-else-if="dialogMode === 'help'"
        narrow
        :button-style="menuButtonStyle"
        :title="t('dialog.helpTitle')"
        @close="closeDialog()"
      >
        <div class="help-content">{{ t('dialog.helpText') }}</div>
        <template #actions>
          <GameButton
            size="small"
            :style="menuButtonStyle"
            @click="closeDialog()"
          >
            <span>{{ t('button.close') }}</span>
          </GameButton>
        </template>
      </GameDialog>

      <GameDialog
        v-if="loading && dialogMode !== 'language'"
        narrow
        loading
        :button-style="menuButtonStyle"
        :title="t('dialog.loadingTitle')"
        :close-on-backdrop="false"
        external-focus-selector=".language-button"
      >
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
        <template #actions>
          <GameButton
            v-if="requiredAssetsReady && !loadingError"
            size="small"
            :style="menuButtonStyle"
            @click="enterAfterLoading"
          >
            <span>{{ t('button.enterGame') }}</span>
          </GameButton>
        </template>
      </GameDialog>
    </div>
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
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
  z-index: var(--z-ui-layer);
  --z-content-underlay: -1;
  --z-content-base: 0;
  --z-content-raised: 1;
  --z-content-panel: 2;
  --z-content-floating: 3;
  --z-content-hover: 10;
  --z-content-front: 11;
  --z-ui-layer: 1000;
  --z-ui-page: 1001;
  --z-ui-panel: 1002;
  --z-ui-floating: 1003;
  --z-ui-dock: 1004;
  --z-ui-handle: 1005;
  --z-overlay-mask: 2001;
  --z-dialog-mask: 3001;
  --z-dialog-floating: 3011;
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

.main-title {
  position: absolute;
  left: var(--main-menu-title-left);
  top: var(--main-menu-title-top);
  z-index: var(--z-content-raised);
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
  z-index: var(--z-content-panel);
  display: flex;
  flex-direction: column;
  gap: var(--main-menu-button-gap);
  transform: translateX(-50%);
}

.main-disclaimer {
  position: absolute;
  left: var(--main-menu-disclaimer-left);
  top: var(--main-menu-disclaimer-top);
  z-index: var(--z-content-raised);
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

.match-room-player--online {
  color: rgb(92 135 95);
  opacity: 1;
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

.panel-picker-backdrop {
  position: absolute;
  inset: 0;
  z-index: var(--z-ui-floating);
  pointer-events: auto;
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

.menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay-mask);
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
  box-sizing: border-box;
  max-height: max(160px, calc(var(--app-height) - var(--button-top) * 2));
  overflow: auto;
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  outline: none;
  pointer-events: auto;
  transform: translate(-50%, -50%);
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

.dialog-textarea--export {
  height: min(
    calc(var(--export-textarea-lines) * 1.35em + var(--button-content-gap) * 4),
    max(220px, calc(var(--app-height) - var(--button-top) * 2 - var(--button-height) * 5 - var(--button-content-gap) * 18))
  );
}

.export-controls {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  width: min(420px, 100%);
}

.export-radio-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
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

.language-button {
  z-index: var(--z-dialog-floating);
}

.language-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
  width: 100%;
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
