<script setup lang="ts">
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import { RendererPreferenceSchema } from '@engine/rendererFactory'
import type { GameSettings } from '@/composables/settings'
import GameButton from './GameButton.vue'
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

function setSoundVolume(value: number) {
  props.settings.soundVolume = value
}

function setRenderer(value: boolean | string | number | null | undefined) {
  const result = RendererPreferenceSchema.safeParse(value)
  if (result.success) props.settings.renderer = result.data
}

function setBooleanSetting(
  key: 'autoFullscreen' | 'autoSwitchViewPlayer' | 'showMoveTravelAnimation',
  value: boolean | string | number | null | undefined,
) {
  props.settings[key] = value === true
}

</script>

<template>
  <div
    class="dialog-card dialog-card--narrow"
    :style="buttonStyle"
    @click.stop
  >
    <h2 class="dialog-title">{{ t('dialog.settingsTitle') }}</h2>
    <div class="settings-list settings-list--narrow">
      <label class="settings-row">
        <span>{{ t('settings.soundVolume') }}</span>
        <GameSlider
          :model-value="settings.soundVolume"
          :aria-label="t('settings.soundVolume')"
          :style="buttonStyle"
          :min="0"
          :max="1"
          :step="0.01"
          @update:model-value="setSoundVolume"
          @change="emit('volumeChange')"
        />
      </label>
      <div class="settings-row settings-row--renderer">
        <span>{{ t('settings.renderer') }}</span>
        <div class="settings-renderer-control">
          <div class="settings-radio-group">
            <GameToggle
              :model-value="settings.renderer"
              type="radio"
              value="auto"
              :style="buttonStyle"
              @update:model-value="setRenderer"
            >
              <span>{{ t('settings.rendererAuto') }}</span>
            </GameToggle>
            <GameToggle
              :model-value="settings.renderer"
              type="radio"
              value="webgl"
              :style="buttonStyle"
              @update:model-value="setRenderer"
            >
              <span>{{ t('settings.rendererWebGL') }}</span>
            </GameToggle>
            <GameToggle
              :model-value="settings.renderer"
              type="radio"
              value="canvas"
              :style="buttonStyle"
              @update:model-value="setRenderer"
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
          :model-value="settings.autoFullscreen"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('autoFullscreen', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.autoSwitchView') }}</span>
        <GameToggle
          :model-value="settings.autoSwitchViewPlayer"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('autoSwitchViewPlayer', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.travelAnimation') }}</span>
        <GameToggle
          :model-value="settings.showMoveTravelAnimation"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('showMoveTravelAnimation', value)"
        />
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
    <div class="dialog-actions">
      <GameButton
        size="secondary"
        :style="buttonStyle"
        @click="emit('close')"
      >
        <span>{{ t('button.close') }}</span>
      </GameButton>
    </div>
  </div>
</template>

<style scoped>
.settings-radio-group {
  display: flex;
  flex-wrap: wrap;
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
</style>
