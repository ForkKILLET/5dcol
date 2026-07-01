<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { type GameSettings } from '@/composables/settings'
import FiveDPGNSettingsFields from './FiveDPGNSettingsFields.vue'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'
import GamePanel from './GamePanel.vue'
import GameSlider from './GameSlider.vue'
import GameTab from './GameTab.vue'
import GameToggle from './GameToggle.vue'
import OnlineServerSettingsPanel from './OnlineServerSettingsPanel.vue'
import { UiSoundKey } from '@/composables/uiSound.ts'

type SettingsTab = 'volume' | 'appearance' | 'game' | 'study' | 'online' | 'fiveDPGN'

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
const settingsTabs: SettingsTab[] = ['volume', 'appearance', 'game', 'study', 'online', 'fiveDPGN']
const rendererChanged = computed(() => props.settings.renderer !== initialRenderer.value)

const playUISound = inject(UiSoundKey)

function setActiveTab(tab: SettingsTab) {
  if (activeTab.value === tab) return
  playUISound?.()
  activeTab.value = tab
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
  overflow: auto;
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
