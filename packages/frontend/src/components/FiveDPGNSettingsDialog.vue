<script setup lang="ts">
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FiveDPGNSettings } from '@/composables/settings'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'
import GameToggle from './GameToggle.vue'

const props = defineProps<{
  buttonStyle: StyleValue
  settings: FiveDPGNSettings
}>()

const emit = defineEmits<{
  back: []
  close: []
}>()

const { t } = useI18n({ useScope: 'global' })

function setBooleanSetting(
  key: keyof FiveDPGNSettings,
  value: boolean | string | number | null | undefined,
) {
  props.settings[key] = value === true
}
</script>

<template>
  <GameDialog
    narrow
    :title="t('dialog.fiveDPGNSettingsTitle')"
    :button-style="buttonStyle"
    @close="emit('close')"
  >
    <div class="settings-list settings-list--narrow">
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNPieceSymbols') }}</span>
        <GameToggle
          :model-value="settings.includePieceSymbols"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('includePieceSymbols', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNTravelMarkers') }}</span>
        <GameToggle
          :model-value="settings.includeTravelMarkers"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('includeTravelMarkers', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNCaptureMarkers') }}</span>
        <GameToggle
          :model-value="settings.includeCaptureMarkers"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('includeCaptureMarkers', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNCheckMarkers') }}</span>
        <GameToggle
          :model-value="settings.includeCheckMarkers"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('includeCheckMarkers', value)"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNPromotionMarkers') }}</span>
        <GameToggle
          :model-value="settings.includePromotionMarkers"
          :style="buttonStyle"
          @update:model-value="value => setBooleanSetting('includePromotionMarkers', value)"
        />
      </div>
    </div>
    <template #actions>
      <GameButton
        size="small"
        :style="buttonStyle"
        @click="emit('back')"
      >
        <span>{{ t('button.back') }}</span>
      </GameButton>
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
