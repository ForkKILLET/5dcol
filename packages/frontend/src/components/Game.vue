<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { Player } from '@5dcol/core'

import { Color4 } from '@engine/basic'
import { Animations, ButtonColors, Colors, Sizes, type ButtonColorPreset } from '@engine/constant'
import { Game, type GameExportRequest, type GameRecordAction, type GameRecordMoveSegment, type GameStatusView, type GameToolbarButton } from '@engine/game'
import { isModifierKeyEvent, isTextInputEvent } from '@engine/gameInput'
import { GAME_STORAGE_KEY, getLocalStorage, isStoredGameState } from '@engine/gameState'
import { Logger, type GameMessage } from '@engine/logger'
import { CanvasRenderer } from '@engine/canvas/renderer'
import { type LoopingSound, SoundManager } from '@engine/sound'
import { createTranslator, getStoredLanguage, LANGUAGES, storeLanguage, type Language } from '@/i18n'

const canvas = useTemplateRef('canvas')

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
const dialogMode = ref<'none' | 'language' | 'help' | 'import' | 'export'>('none')
const importText = ref('')
const importError = ref('')
const exportText = ref('')
const exportHasPendingMoves = ref(false)
const exportCopyStatus = ref('')
const loading = ref(true)
const loadingError = ref('')
const gameStarted = ref(false)
const hasSavedGame = ref(false)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const logger = new Logger(messages)
let game: Game | null = null
let canvasRenderer: CanvasRenderer | null = null
let soundManager: SoundManager | null = null
let ambienceLoop: LoopingSound | null = null

const query = new URLSearchParams(window.location.search)
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves'])
const recordActionButtonIds = new Set(['import-5dpgn', 'export-5dpgn'])
const t = computed(() => createTranslator(language.value))
const gameStatusText = computed(() => {
  if (gameStatus.value.kind === 'stalemate') return t.value('status.stalemate')

  const player = gameStatus.value.player === Player.B
    ? t.value('player.black')
    : t.value('player.white')
  return t.value(
    gameStatus.value.kind === 'checkmate' ? 'status.checkmate' : 'status.turn',
    { player },
  )
})
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
const menuButtonStyle = computed(() => getPresetButtonStyle(ButtonColors.White))
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
const uiStyle = computed(() => ({
  '--button-width': `${Sizes.ButtonWidth}px`,
  '--secondary-button-width': `${Sizes.SecondaryButtonWidth}px`,
  '--record-panel-width': `${Sizes.RecordPanelWidth}px`,
  '--button-circle-size': `${Sizes.ButtonHeight}px`,
  '--button-height': `${Sizes.ButtonHeight}px`,
  '--button-top': `${Sizes.ButtonTop}px`,
  '--button-shadow-offset': `${Sizes.ButtonShadowOffset}px`,
  '--button-border': `${Sizes.ButtonBorder}px`,
  '--button-font-size': `${Sizes.ButtonFontSize}px`,
  '--button-icon-size': `${Sizes.ButtonIconSize}px`,
  '--button-content-gap': `${Sizes.ButtonContentGap}px`,
  '--button-shadow-color': Color4.toRgbaString(Colors.Shadow),
  '--button-pulse-duration': `${Animations.PulseEffectDuration * 2}ms`,
  '--overlay-mask-color': Color4.toRgbaString(Colors.OverlayMask),
  '--menu-card-border-color': Color4.toRgbaString(ButtonColors.White.border),
  '--menu-card-fill-color': Color4.toRgbaString(ButtonColors.White.fill),
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
}))

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
  buttonsTop: 350,
  arrowWidth: 300,
  arrowHeight: 900,
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
  if (recordHoveredActionIndex.value === action.index) return '@'
  return action.index === recordCurrentActionIndex.value - 1 ? '*' : ''
}

function rollbackToRecordAction(action: GameRecordAction) {
  if (! gameStarted.value) return
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

function openGitHub() {
  playUISound()
  window.open('https://github.com/ForkKILLET/5dcol', '_blank', 'noopener,noreferrer')
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

function playUISound() {
  soundManager?.play('lightswitch.ogg')
  if (! loading.value && ! gameStarted.value) startAmbience()
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
    onImportRequest: openImportDialog,
    onExportRequest: openExportDialog,
    onReturnToMainMenuRequest: returnToMainMenu,
  })
  gameStarted.value = true
  syncGameInputState()
  game.start()
  syncGameViewportInsets()
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

function returnToMainMenu({ clearSave = true }: { clearSave?: boolean } = {}) {
  if (clearSave) clearSavedGameState()
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

async function init() {
  try {
    loading.value = true
    loadingError.value = ''
    const [renderer, loadedSoundManager] = await Promise.all([
      CanvasRenderer.create(canvas.value!, logger),
      SoundManager.create(logger),
    ])
    soundManager = loadedSoundManager
    canvasRenderer = renderer
    refreshSavedGameState()
    loading.value = false
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
  stopAmbience()
  game?.dispose()
  canvasRenderer?.dispose()
  soundManager?.dispose()
})

watch(uiOverlayOpen, syncGameInputState)
watch(recordPanelOpen, syncGameViewportInsets)
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
        <h1 class="main-title">
          <span class="main-title-primary">5D Chess</span>
          <span class="main-title-secondary">
            With Multiverse Time Travel
            <span class="main-title-online">Online</span>
          </span>
        </h1>
        <div class="main-menu-buttons">
          <button
            class="game-button main-menu-button"
            :style="menuButtonStyle"
            type="button"
            @click="startLocalGame"
          >
            <span>{{ mainMenuStartText }}</span>
          </button>
          <button
            class="game-button main-menu-button"
            :style="menuButtonStyle"
            type="button"
            @click="openHelpDialog"
          >
            <span>{{ t('main.help') }}</span>
          </button>
          <button
            class="game-button main-menu-button"
            :style="menuButtonStyle"
            type="button"
            @click="openGitHub"
          >
            <span>{{ t('main.github') }}</span>
          </button>
        </div>
      </section>

      <div
        v-if="gameStarted"
        class="toolbar toolbar-primary"
      >
        <button
          v-for="button in primaryButtons"
          :key="button.id"
          class="game-button"
          :class="{ 'is-pulsing': button.effect === 'pulse' && !button.disabled }"
          :style="getButtonStyle(button)"
          :disabled="button.disabled"
          type="button"
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
        </button>
      </div>

      <div
        class="toolbar toolbar-secondary"
      >
        <button
          class="game-button game-button--circle"
          :style="menuButtonStyle"
          type="button"
          :aria-label="t('dialog.languageTitle')"
          @click="openLanguageDialog"
        >
          <svg
            class="button-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
            />
            <path d="M3 12h18" />
            <path d="M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9" />
            <path d="M12 3c-2.3 2.5-3.5 5.5-3.5 9s1.2 6.5 3.5 9" />
          </svg>
        </button>
        <button
          v-if="gameStarted"
          class="game-button game-button--circle"
          :style="menuButtonStyle"
          type="button"
          :aria-label="t('button.menu')"
          :aria-expanded="secondaryMenuOpen"
          @click="toggleSecondaryMenu"
        >
          <span>...</span>
        </button>
      </div>

      <div
        v-if="gameStarted"
        class="game-status"
        :class="{ 'game-status--ended': gameStatus.ended }"
      >
        {{ gameStatusText }}
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
            <button
              v-for="button in recordActionButtons"
              :key="button.id"
              class="game-button record-header-button"
              :class="{ 'is-pulsing': button.effect === 'pulse' && !button.disabled }"
              :style="menuButtonStyle"
              :disabled="button.disabled"
              type="button"
              @click="clickToolbarButton(button)"
            >
              <span>{{ getButtonText(button) }}</span>
            </button>
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
          <button
            class="game-button"
            :class="{ 'is-open': recordPanelOpen }"
            :style="menuButtonStyle"
            type="button"
            :aria-expanded="recordPanelOpen"
            @click="clickRecordMenuButton"
          >
            <span>{{ t('button.record') }}</span>
          </button>
          <button
            class="game-button"
            :style="menuButtonStyle"
            type="button"
            @click="clickReturnToMainMenuButton"
          >
            <span>{{ t('button.returnToMainMenu') }}</span>
          </button>
          <button
            v-for="button in menuButtons"
            :key="button.id"
            class="game-button"
            :class="{ 'is-pulsing': button.effect === 'pulse' && !button.disabled }"
            :style="menuButtonStyle"
            :disabled="button.disabled"
            type="button"
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
          </button>
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
            <button
              v-for="option in languageOptions"
              :key="option.value"
              class="game-button language-button"
              :class="{ 'is-open': option.value === language }"
              :style="getPresetButtonStyle(option.value === language ? ButtonColors.GreenWhite : ButtonColors.White)"
              type="button"
              @click="selectLanguage(option.value)"
            >
              <span>{{ option.label }}</span>
            </button>
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
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="closeDialog()"
            >
              <span>{{ t('button.cancel') }}</span>
            </button>
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              :disabled="importText.trim().length === 0"
              type="button"
              @click="submitImportDialog"
            >
              <span>{{ t('button.import') }}</span>
            </button>
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
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="copyExportText"
            >
              <span>{{ t('button.copy') }}</span>
            </button>
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </button>
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
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="closeDialog()"
            >
              <span>{{ t('button.close') }}</span>
            </button>
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

.toolbar-primary {
  top: var(--button-top);
  left: 50%;
  transform: translateX(-50%);
}

.toolbar-secondary {
  right: var(--button-top);
  bottom: var(--button-top);
}

.game-status {
  position: absolute;
  left: var(--button-top);
  bottom: var(--button-top);
  max-width: min(560px, calc(100vw - var(--button-top) * 2));
  color: var(--game-status-color);
  font-size: var(--button-font-size);
  line-height: 1.1;
  text-shadow:
    0 2px 7px var(--game-status-shadow-color),
    0 0 3px var(--game-status-shadow-color);
  pointer-events: none;
  user-select: none;
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
  align-items: start;
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
  text-align: right;
  white-space: nowrap;
  opacity: 0.78;
}

.record-action {
  display: grid;
  row-gap: calc(var(--button-content-gap) * 0.35);
  min-width: 0;
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

.language-button {
  width: var(--secondary-button-width);
  max-width: calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10);
}

.game-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--button-content-gap);
  width: var(--button-width);
  height: var(--button-height);
  padding: 0 20px;
  border: var(--button-border) solid var(--button-border-color);
  border-radius: calc(var(--button-height) / 2);
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: var(--button-font-size);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  user-select: none;
}

.game-button > span,
.dialog-title,
.game-status,
.record-title,
.record-message,
.record-empty,
.dialog-message {
  transform: translateY(var(--ui-text-y));
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

.button-icon {
  width: calc(var(--button-icon-size) * 0.9);
  height: calc(var(--button-icon-size) * 0.9);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
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
