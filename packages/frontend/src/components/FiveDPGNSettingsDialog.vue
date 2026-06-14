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
          v-model="settings.includePieceSymbols"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNTravelMarkers') }}</span>
        <GameToggle
          v-model="settings.includeTravelMarkers"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNCaptureMarkers') }}</span>
        <GameToggle
          v-model="settings.includeCaptureMarkers"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNCheckMarkers') }}</span>
        <GameToggle
          v-model="settings.includeCheckMarkers"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('settings.fiveDPGNPromotionMarkers') }}</span>
        <GameToggle
          v-model="settings.includePromotionMarkers"
          :style="buttonStyle"
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
