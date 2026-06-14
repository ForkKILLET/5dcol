<script setup lang="ts">
import { computed, ref } from 'vue'
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { type GameSettings } from '@/composables/settings'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'
import GameSlider from './GameSlider.vue'
import GameToggle from './GameToggle.vue'

const props = defineProps<{
  buttonStyle: StyleValue
  rendererStatusText: string
  settings: GameSettings
}>()

const emit = defineEmits<{
  close: []
  openFiveDpgn: []
  volumeChange: []
}>()

const { t } = useI18n({ useScope: 'global' })
const initialRenderer = ref(props.settings.renderer)
const rendererChanged = computed(() => props.settings.renderer !== initialRenderer.value)
</script>

<template>
  <GameDialog
    narrow
    :title="t('dialog.settingsTitle')"
    :button-style="buttonStyle"
    @close="emit('close')"
  >
    <div class="settings-list settings-list--narrow settings-list--main">
      <label class="settings-row">
        <span>{{ t('settings.soundVolume') }}</span>
        <GameSlider
          v-model="settings.soundVolume"
          :aria-label="t('settings.soundVolume')"
          :style="buttonStyle"
          :min="0"
          :max="1"
          :step="0.01"
          @change="emit('volumeChange')"
        />
      </label>
      <div class="settings-row settings-row--renderer">
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
      <div class="settings-row settings-row--renderer">
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
      <div class="settings-row">
        <span>{{ t('settings.autoFullscreen') }}</span>
        <GameToggle
          v-model="settings.autoFullscreen"
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
      <div class="settings-row settings-row--renderer">
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
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGN') }}</span>
        <GameButton
          size="small"
          :style="buttonStyle"
          @click="emit('openFiveDpgn')"
        >
          <span>{{ t('button.open') }}</span>
        </GameButton>
      </div>
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
.settings-list--main.settings-list--narrow {
  width: min(560px, calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10));
}

.settings-radio-group {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
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

.settings-alert-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--button-content-gap) * 0.75);
}

.settings-status {
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.2;
  text-align: right;
  transform: translateY(var(--ui-text-y));
  white-space: normal;
}

@media (max-width: 680px) {
  .settings-radio-group {
    flex-wrap: wrap;
  }
}
</style>
