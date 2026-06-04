<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'

import { Color4 } from '@engine/basic'
import { Animations, ButtonColors, Colors, Sizes, type ButtonColorPreset } from '@engine/constant'
import { Game, type GameExportRequest, type GameRecordAction, type GameRecordMoveSegment, type GameStatusView, type GameToolbarButton } from '@engine/game'
import { isModifierKeyEvent, isTextInputEvent } from '@engine/gameInput'
import { Logger, type GameMessage } from '@engine/logger'
import { CanvasRenderer } from '@engine/canvas/renderer'

const canvas = useTemplateRef('canvas')

const messages = reactive<GameMessage[]>([])
const toolbarButtons = ref<GameToolbarButton[]>([])
const gameStatus = ref<GameStatusView>({
  text: "White's turn",
  color: Color4.toRgbaString(Colors.BoardBorderWhite),
  shadowColor: Color4.toRgbaString(Colors.BoardBorderBlack),
  ended: false,
})
const recordPanelOpen = ref(false)
const recordText = ref('')
const recordActions = ref<GameRecordAction[]>([])
const recordHasPendingMoves = ref(false)
const recordCurrentActionIndex = ref(0)
const recordHoveredActionIndex = ref<number | null>(null)
const secondaryMenuOpen = ref(false)
const dialogMode = ref<'none' | 'import' | 'export'>('none')
const importText = ref('')
const importError = ref('')
const exportText = ref('')
const exportHasPendingMoves = ref(false)
const exportCopyStatus = ref('')
const logger = new Logger(messages)
let game: Game | null = null

const query = new URLSearchParams(window.location.search)
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves'])
const recordActionButtonIds = new Set(['import-5dpgn', 'export-5dpgn'])

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
  secondaryMenuOpen.value || dialogMode.value !== 'none'
))
const recordHeaders = computed(() => (
  recordText.value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('['))
))
const recordRows = computed(() => recordActions.value)
const menuButtonStyle = computed(() => getPresetButtonStyle(ButtonColors.White))
const uiStyle = computed(() => ({
  '--button-width': `${Sizes.ButtonWidth}px`,
  '--secondary-button-width': `${Sizes.RestartButtonWidth}px`,
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
}))

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
  game?.focusBoard(segment.l, segment.m)
}

function getRecordMarker(action: GameRecordAction) {
  if (recordHoveredActionIndex.value === action.index) return '@'
  return action.index === recordCurrentActionIndex.value - 1 ? '*' : ''
}

function rollbackToRecordAction(action: GameRecordAction) {
  game?.rollbackToActionEnd(action.index + 1)
}

function toggleSecondaryMenu() {
  secondaryMenuOpen.value = ! secondaryMenuOpen.value
}

function closeSecondaryMenu() {
  secondaryMenuOpen.value = false
}

function openImportDialog() {
  secondaryMenuOpen.value = false
  importText.value = ''
  importError.value = ''
  dialogMode.value = 'import'
}

function openExportDialog(request: GameExportRequest) {
  secondaryMenuOpen.value = false
  exportText.value = request.text
  exportHasPendingMoves.value = request.hasPendingMoves
  exportCopyStatus.value = ''
  dialogMode.value = 'export'
}

function closeDialog() {
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

function submitImportDialog() {
  const text = importText.value.trim()
  if (! text) return

  const error = game?.importFiveDPGNText(text)
  if (error) {
    importError.value = error
    return
  }

  closeDialog()
}

async function copyExportText() {
  exportCopyStatus.value = ''
  try {
    await navigator.clipboard.writeText(exportText.value)
    exportCopyStatus.value = 'Copied'
  }
  catch {
    exportCopyStatus.value = 'Select the text and copy it manually'
  }
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    if (dialogMode.value !== 'none') closeDialog()
    else toggleSecondaryMenu()
    return
  }

  if (e.repeat || isModifierKeyEvent(e) || isTextInputEvent(e) || dialogMode.value !== 'none') return

  switch (e.key) {
    case 'r':
      e.preventDefault()
      toggleRecordPanel()
      break
  }
}

async function init() {
  try {
    const renderer = await CanvasRenderer.create(canvas.value!, logger)
    game = new Game({
      renderer,
      logger,
      debug: query.get('debug') === '1',
      onToolbarChange: buttons => {
        toolbarButtons.value = buttons
      },
      onRecordChange: updateRecord,
      onStatusChange: updateGameStatus,
      onImportRequest: openImportDialog,
      onExportRequest: openExportDialog,
    })
    syncGameInputState()
    game.start()
    syncGameViewportInsets()
  }
  catch (err) {
    logger.error(String(err))
    console.error(err)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeyDown)
  window.addEventListener('resize', syncGameViewportInsets)
  void init()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeyDown)
  window.removeEventListener('resize', syncGameViewportInsets)
  game?.dispose()
})

watch(uiOverlayOpen, syncGameInputState)
watch(recordPanelOpen, syncGameViewportInsets)
</script>

<template>
  <div class="game">
    <canvas ref="canvas"></canvas>
    <div
      class="ui-layer"
      :style="uiStyle"
      @mousemove.stop
      @mousedown.stop
      @mouseup.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <div class="toolbar toolbar-primary">
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
          <span>{{ button.text }}</span>
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
          aria-label="Open menu"
          :aria-expanded="secondaryMenuOpen"
          @click="toggleSecondaryMenu"
        >
          <span>...</span>
        </button>
      </div>

      <div
        class="game-status"
        :class="{ 'game-status--ended': gameStatus.ended }"
      >
        {{ gameStatus.text }}
      </div>

      <aside
        v-if="recordPanelOpen"
        class="record-panel"
        :style="menuButtonStyle"
        @wheel.stop
      >
        <div class="record-header-bar">
          <h2 class="record-title">Record</h2>
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
              <span>{{ button.text }}</span>
            </button>
          </div>
        </div>
        <p
          v-if="recordHasPendingMoves"
          class="record-message"
        >
          Pending moves are not recorded.
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
            No moves recorded.
          </div>
        </div>
      </aside>

      <div
        v-if="secondaryMenuOpen"
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
            <span>Record</span>
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
            <span>{{ button.text }}</span>
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
        @click="closeDialog"
      >
        <div
          v-if="dialogMode === 'import'"
          class="dialog-card"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">Import 5dpgn</h2>
          <textarea
            v-model="importText"
            class="dialog-textarea"
            spellcheck="false"
            autofocus
          ></textarea>
          <p
            v-if="importError"
            class="dialog-message dialog-message-error"
          >
            {{ importError }}
          </p>
          <div class="dialog-actions">
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="closeDialog"
            >
              <span>Cancel</span>
            </button>
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              :disabled="importText.trim().length === 0"
              type="button"
              @click="submitImportDialog"
            >
              <span>Import</span>
            </button>
          </div>
        </div>

        <div
          v-else
          class="dialog-card"
          :style="menuButtonStyle"
          @click.stop
        >
          <h2 class="dialog-title">Export 5dpgn</h2>
          <p
            v-if="exportHasPendingMoves"
            class="dialog-message"
          >
            Pending moves are not exported.
          </p>
          <textarea
            v-model="exportText"
            class="dialog-textarea"
            readonly
            spellcheck="false"
          ></textarea>
          <p
            v-if="exportCopyStatus"
            class="dialog-message"
          >
            {{ exportCopyStatus }}
          </p>
          <div class="dialog-actions">
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="copyExportText"
            >
              <span>Copy</span>
            </button>
            <button
              class="game-button dialog-button"
              :style="menuButtonStyle"
              type="button"
              @click="closeDialog"
            >
              <span>Close</span>
            </button>
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
  font-family: Georgia, 'Times New Roman', serif;
}

.toolbar {
  position: absolute;
  display: flex;
  gap: calc(var(--button-content-gap) * 2);
  pointer-events: auto;
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
  font: 18px/1.35 Georgia, 'Times New Roman', serif;
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
  background: var(--overlay-mask-color);
  pointer-events: auto;
}

.dialog-backdrop {
  position: absolute;
  inset: 0;
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
  margin: 0;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.25;
}

.dialog-message-error {
  color: #9b3a32;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 2);
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
