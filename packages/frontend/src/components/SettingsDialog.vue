<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { type GameSettings } from '@/composables/settings'
import {
  DEFAULT_GAME_KEYBINDINGS,
  findGameKeybindingConflict,
  formatGameKeybinding,
  gameKeybindingFromEvent,
  type GameKeybinding,
  type GameKeybindingAction,
} from '@engine/keybinding'
import FiveDPGNSettingsFields from './FiveDPGNSettingsFields.vue'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'
import GameIcon from './GameIcon.vue'
import GamePanel from './GamePanel.vue'
import GameSlider from './GameSlider.vue'
import GameTab from './GameTab.vue'
import GameToggle from './GameToggle.vue'
import OnlineServerSettingsPanel from './OnlineServerSettingsPanel.vue'
import { UiSoundKey } from '@/composables/uiSound.ts'

type SettingsTab = 'volume' | 'appearance' | 'game' | 'study' | 'keyboard' | 'online' | 'fiveDPGN'

const props = defineProps<{
  buttonStyle: StyleValue
  initialTab?: SettingsTab
  rendererStatusText: string
  settings: GameSettings
}>()

const emit = defineEmits<{
  bellVolumeChange: []
  close: []
  volumeChange: []
}>()

const { t } = useI18n({ useScope: 'global' })
const initialRenderer = ref(props.settings.renderer)
const activeTab = ref<SettingsTab>(props.initialTab ?? 'volume')
const settingsTabs: SettingsTab[] = ['volume', 'appearance', 'game', 'study', 'keyboard', 'online', 'fiveDPGN']
const rendererChanged = computed(() => props.settings.renderer !== initialRenderer.value)
const editingKeybinding = ref<{ action: GameKeybindingAction, index: number | null } | null>(null)
const keybindingConflictAction = ref<GameKeybindingAction | null>(null)

const keybindingRows: GameKeybindingAction[] = [
  'undoMove',
  'redoMove',
  'undoAllMoves',
  'submitMoves',
  'panUp',
  'panLeft',
  'panDown',
  'panRight',
  'zoomOut',
  'zoomIn',
  'toggleViewPlayer',
  'recordPrevious',
  'recordNext',
  'recordBlockStart',
  'recordBlockEnd',
  'cycleRecordVariation',
  'toggleRecordPanel',
  'togglePanelPicker',
  'toggleClockPanel',
  'toggleSettings',
]

const playUISound = inject(UiSoundKey)

function setActiveTab(tab: SettingsTab) {
  if (activeTab.value === tab) return
  playUISound?.()
  editingKeybinding.value = null
  keybindingConflictAction.value = null
  activeTab.value = tab
}

function cloneKeybindingList(bindings: readonly GameKeybinding[]): GameKeybinding[] {
  return bindings.map(binding => ({ ...binding }))
}

function startEditingKeybinding(action: GameKeybindingAction, index: number | null) {
  playUISound?.()
  editingKeybinding.value = { action, index }
  keybindingConflictAction.value = null
}

function startAddingKeybinding(action: GameKeybindingAction) {
  startEditingKeybinding(action, null)
  void nextTick(() => {
    document
      .querySelector<HTMLButtonElement>(`[data-keybinding-capture="${action}"]`)
      ?.focus()
  })
}

function resetKeybinding(action: GameKeybindingAction) {
  playUISound?.()
  props.settings.keybindings[action] = cloneKeybindingList(DEFAULT_GAME_KEYBINDINGS[action])
  if (editingKeybinding.value?.action === action) editingKeybinding.value = null
  keybindingConflictAction.value = null
}

function deleteKeybinding(action: GameKeybindingAction, index: number) {
  playUISound?.()
  props.settings.keybindings[action].splice(index, 1)
  if (editingKeybinding.value?.action === action) editingKeybinding.value = null
  keybindingConflictAction.value = null
}

function isEditingKeybinding(action: GameKeybindingAction, index: number | null): boolean {
  return editingKeybinding.value?.action === action && editingKeybinding.value.index === index
}

function getKeybindingLabel(action: GameKeybindingAction, index: number): string {
  if (isEditingKeybinding(action, index)) return t('settings.keybindingPressKey')
  return formatGameKeybinding(props.settings.keybindings[action][index] ?? null)
}

function onKeybindingKeyDown(action: GameKeybindingAction, index: number, e: KeyboardEvent) {
  if (! isEditingKeybinding(action, index)) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      e.stopPropagation()
      deleteKeybinding(action, index)
    }
    return
  }

  captureKeybinding(action, index, e)
}

function onAddKeybindingKeyDown(action: GameKeybindingAction, e: KeyboardEvent) {
  if (isEditingKeybinding(action, null)) captureKeybinding(action, null, e)
}

function captureKeybinding(action: GameKeybindingAction, index: number | null, e: KeyboardEvent) {
  if (! isEditingKeybinding(action, index)) return

  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    editingKeybinding.value = null
    keybindingConflictAction.value = null
    return
  }

  const binding = gameKeybindingFromEvent(e)
  if (! binding) return

  const conflict = findGameKeybindingConflict(props.settings.keybindings, action, index, binding)
  if (conflict) {
    keybindingConflictAction.value = conflict
    return
  }

  if (index === null) props.settings.keybindings[action].push(binding)
  else props.settings.keybindings[action][index] = binding
  editingKeybinding.value = null
  keybindingConflictAction.value = null
  playUISound?.()
}
</script>

<template>
  <GameDialog
    card-class="dialog-card--settings"
    :title="t('dialog.settingsTitle')"
    :button-style="buttonStyle"
    @close="emit('close')"
  >
    <div class="settings-tab-layout">
      <nav
        class="settings-tabs"
        :aria-label="t('settings.tabsLabel')"
      >
        <GameTab
          v-for="tab in settingsTabs"
          :key="tab"
          :style="buttonStyle"
          :pressed="activeTab === tab"
          @click="setActiveTab(tab)"
        >
          <span>{{ t(`settings.tab.${tab}`) }}</span>
        </GameTab>
      </nav>

      <GamePanel class="settings-panel">
        <div
          v-if="activeTab === 'volume'"
          class="settings-list"
        >
          <label class="settings-row">
            <span>{{ t('settings.ambienceVolume') }}</span>
            <GameSlider
              v-model="settings.ambienceVolume"
              :aria-label="t('settings.ambienceVolume')"
              :style="buttonStyle"
              :min="0"
              :max="1"
              :step="0.01"
              @change="emit('volumeChange')"
            />
          </label>
          <label class="settings-row">
            <span>{{ t('settings.uiVolume') }}</span>
            <GameSlider
              v-model="settings.uiVolume"
              :aria-label="t('settings.uiVolume')"
              :style="buttonStyle"
              :min="0"
              :max="1"
              :step="0.01"
              @change="emit('volumeChange')"
            />
          </label>
          <label class="settings-row">
            <span>{{ t('settings.bellVolume') }}</span>
            <GameSlider
              v-model="settings.bellVolume"
              :aria-label="t('settings.bellVolume')"
              :style="buttonStyle"
              :min="0"
              :max="1"
              :step="0.01"
              @change="emit('bellVolumeChange')"
            />
          </label>
        </div>

        <div
          v-else-if="activeTab === 'appearance'"
          class="settings-list"
        >
          <div class="settings-row settings-row--stacked">
            <span>{{ t('settings.renderer') }}</span>
            <div class="settings-renderer-control">
              <div class="settings-radio-group">
                <GameToggle
                  v-model="settings.renderer"
                  type="radio"
                  value="auto"
                  :style="buttonStyle"
                >
                  <span>{{ t('settings.rendererAuto') }}</span>
                </GameToggle>
                <GameToggle
                  v-model="settings.renderer"
                  type="radio"
                  value="webgl"
                  :style="buttonStyle"
                >
                  <span>{{ t('settings.rendererWebGL') }}</span>
                </GameToggle>
                <GameToggle
                  v-model="settings.renderer"
                  type="radio"
                  value="canvas"
                  :style="buttonStyle"
                >
                  <span>{{ t('settings.rendererCanvas') }}</span>
                </GameToggle>
              </div>
              <span class="settings-status">
                {{ rendererStatusText }}
                <template v-if="rendererChanged"> - {{ t('settings.rendererRestartHint') }}</template>
              </span>
            </div>
          </div>
          <div class="settings-row settings-row--stacked">
            <span>{{ t('settings.themeColor') }}</span>
            <div class="settings-radio-group">
              <GameToggle
                v-model="settings.themeColor"
                type="radio"
                value="white"
                :style="buttonStyle"
              >
                <span>{{ t('settings.themeColorWhite') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.themeColor"
                type="radio"
                value="black"
                :style="buttonStyle"
              >
                <span>{{ t('settings.themeColorBlack') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.themeColor"
                type="radio"
                value="view"
                :style="buttonStyle"
              >
                <span>{{ t('settings.themeColorView') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.themeColor"
                type="radio"
                value="system"
                :style="buttonStyle"
              >
                <span>{{ t('settings.themeColorSystem') }}</span>
              </GameToggle>
            </div>
          </div>
          <div class="settings-row">
            <span>{{ t('settings.autoFullscreen') }}</span>
            <GameToggle
              v-model="settings.autoFullscreen"
              :style="buttonStyle"
            />
          </div>
        </div>

        <div
          v-else-if="activeTab === 'game'"
          class="settings-list"
        >
          <div class="settings-row">
            <span>{{ t('settings.autoEnterLastRoom') }}</span>
            <GameToggle
              v-model="settings.autoEnterLastRoom"
              :style="buttonStyle"
            />
          </div>
          <div class="settings-row">
            <span>{{ t('settings.autoSwitchView') }}</span>
            <GameToggle
              v-model="settings.autoSwitchViewPlayer"
              :style="buttonStyle"
            />
          </div>
          <div class="settings-row">
            <span>{{ t('settings.travelAnimation') }}</span>
            <GameToggle
              v-model="settings.showMoveTravelAnimation"
              :style="buttonStyle"
            />
          </div>
          <label class="settings-row">
            <span>{{ t('settings.pointerDragThreshold') }}</span>
            <div class="settings-slider-control">
              <GameSlider
                v-model="settings.pointerDragThreshold"
                :aria-label="t('settings.pointerDragThreshold')"
                :style="buttonStyle"
                :min="0"
                :max="24"
                :step="1"
              />
              <span class="settings-value">{{ t('settings.pointerDragThresholdValue', { value: settings.pointerDragThreshold }) }}</span>
            </div>
          </label>
          <div class="settings-row settings-row--stacked">
            <span>{{ t('settings.turnAlerts') }}</span>
            <div class="settings-alert-group">
              <GameToggle
                v-model="settings.turnAlertSound"
                :style="buttonStyle"
              >
                <span>{{ t('settings.turnAlertSound') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.turnAlertTitle"
                :style="buttonStyle"
              >
                <span>{{ t('settings.turnAlertTitle') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.turnAlertNotification"
                :style="buttonStyle"
              >
                <span>{{ t('settings.turnAlertNotification') }}</span>
              </GameToggle>
            </div>
          </div>
        </div>

        <div
          v-else-if="activeTab === 'study'"
          class="settings-list"
        >
          <div class="settings-row settings-row--stacked">
            <span>{{ t('settings.squareMarkerDisplay') }}</span>
            <div class="settings-radio-group">
              <GameToggle
                v-model="settings.squareMarkerDisplayMode"
                type="radio"
                value="highlight"
                :style="buttonStyle"
              >
                <span>{{ t('settings.squareMarkerDisplayHighlight') }}</span>
              </GameToggle>
              <GameToggle
                v-model="settings.squareMarkerDisplayMode"
                type="radio"
                value="circle"
                :style="buttonStyle"
              >
                <span>{{ t('settings.squareMarkerDisplayCircle') }}</span>
              </GameToggle>
            </div>
          </div>
        </div>

        <FiveDPGNSettingsFields
          v-else-if="activeTab === 'fiveDPGN'"
          :settings="settings.fiveDPGN"
          :button-style="buttonStyle"
        />

        <div
          v-else-if="activeTab === 'keyboard'"
          class="settings-list"
        >
          <div
            v-for="action in keybindingRows"
            :key="action"
            class="settings-row settings-keybinding-row"
          >
            <span>{{ t(`settings.keybinding.${action}`) }}</span>
            <div class="settings-keybinding-control">
              <div class="settings-keybinding-chips">
                <div
                  v-for="(_, index) in settings.keybindings[action]"
                  :key="`${action}-${index}`"
                  class="settings-keybinding-chip-wrap"
                >
                  <GameButton
                    class="settings-keybinding-chip"
                    size="small"
                    :style="buttonStyle"
                    :pressed="isEditingKeybinding(action, index)"
                    :pressed-indicator="false"
                    @click="startEditingKeybinding(action, index)"
                    @keydown="onKeybindingKeyDown(action, index, $event)"
                  >
                    <span>{{ getKeybindingLabel(action, index) }}</span>
                  </GameButton>
                  <button
                    class="settings-keybinding-delete"
                    type="button"
                    tabindex="-1"
                    :style="buttonStyle"
                    :aria-label="t('settings.keybindingDelete')"
                    :title="t('settings.keybindingDelete')"
                    @click="deleteKeybinding(action, index)"
                  >
                    <GameIcon name="x" />
                  </button>
                </div>
                <div
                  v-if="isEditingKeybinding(action, null)"
                  class="settings-keybinding-chip-wrap"
                >
                  <GameButton
                    class="settings-keybinding-chip"
                    size="small"
                    :style="buttonStyle"
                    :pressed="true"
                    :pressed-indicator="false"
                    :data-keybinding-capture="action"
                    @click="startEditingKeybinding(action, null)"
                    @keydown="onAddKeybindingKeyDown(action, $event)"
                  >
                    <span>{{ t('settings.keybindingPressKey') }}</span>
                  </GameButton>
                </div>
                <GameButton
                  size="tiny"
                  shape="circle"
                  :style="buttonStyle"
                  :aria-label="t('settings.keybindingAdd')"
                  :title="t('settings.keybindingAdd')"
                  @click="startAddingKeybinding(action)"
                >
                  <GameIcon name="plus" />
                </GameButton>
              </div>
              <GameButton
                size="tiny"
                shape="circle"
                :style="buttonStyle"
                :aria-label="t('settings.keybindingReset')"
                :title="t('settings.keybindingReset')"
                @click="resetKeybinding(action)"
              >
                <GameIcon name="reset" />
              </GameButton>
            </div>
          </div>
          <p
            v-if="editingKeybinding"
            class="settings-help"
          >
            {{ t('settings.keybindingCaptureHint') }}
          </p>
          <p
            v-if="keybindingConflictAction"
            class="settings-warning"
          >
            {{ t('settings.keybindingConflict', { action: t(`settings.keybinding.${keybindingConflictAction}`) }) }}
          </p>
        </div>

        <OnlineServerSettingsPanel
          v-else-if="activeTab === 'online'"
          @ui-sound="playUISound?.()"
        />
      </GamePanel>
    </div>

    <template #actions>
      <GameButton
        size="small"
        :style="buttonStyle"
        @click="emit('close')"
      >
        <span>{{ t('button.close') }}</span>
      </GameButton>
    </template>
  </GameDialog>
</template>

<style scoped>
.settings-tab-layout {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  align-items: stretch;
  width: 100%;
  min-height: 0;
}

.settings-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--button-content-gap) * 1.5);
  width: 100%;
}

.settings-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding-right: var(--scrollbar-content-gap);
  overflow: auto;
  scrollbar-gutter: stable;
}

.settings-panel > .settings-list {
  width: 100%;
}

.settings-radio-group,
.settings-alert-group {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}

.settings-row--stacked {
  align-items: flex-start;
}

.settings-renderer-control {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
}

.settings-slider-control {
  display: flex;
  gap: var(--button-content-gap);
  align-items: center;
}

.settings-keybinding-row {
  gap: calc(var(--button-content-gap) * 2);
}

.settings-keybinding-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--button-content-gap);
  min-width: 0;
}

.settings-keybinding-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--button-content-gap);
  min-width: 0;
}

.settings-keybinding-chip-wrap {
  position: relative;
  flex: 0 0 auto;
}

.settings-keybinding-chip {
  min-width: 92px;
}

.settings-keybinding-delete {
  position: absolute;
  right: calc(var(--button-small-border) * -1);
  top: calc(var(--button-small-border) * -1);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: calc(var(--button-tiny-height) * 0.72);
  height: calc(var(--button-tiny-height) * 0.72);
  padding: 0;
  border: var(--button-tiny-border) solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  opacity: 0;
  cursor: pointer;
  outline: none;
  transform: translate(35%, -35%);
  transition: opacity 160ms ease;
}

.settings-keybinding-chip-wrap:hover .settings-keybinding-delete,
.settings-keybinding-chip-wrap:focus-within .settings-keybinding-delete {
  opacity: 1;
}

.settings-keybinding-delete:hover,
.settings-keybinding-delete:focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
  opacity: 1;
}

.settings-keybinding-delete :deep(.game-icon) {
  width: calc(var(--button-tiny-icon-size) * 0.75);
  height: calc(var(--button-tiny-icon-size) * 0.75);
}

.settings-help,
.settings-warning {
  margin: 0;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1.2;
  transform: translateY(var(--ui-text-y));
}

.settings-warning {
  color: var(--button-red-border-color, var(--button-text-color));
}

.settings-status {
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.2;
  text-align: right;
  transform: translateY(var(--ui-text-y));
  white-space: normal;
}

.settings-value {
  min-width: 44px;
  color: var(--button-text-color);
  font-size: 18px;
  line-height: 1;
  text-align: right;
  transform: translateY(var(--ui-text-y));
}

@media (max-width: 760px) {
  .settings-tabs {
    flex-wrap: wrap;
  }

  .settings-radio-group,
  .settings-alert-group {
    flex-wrap: wrap;
  }
}
</style>
