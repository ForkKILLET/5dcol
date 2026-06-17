<script setup lang="ts">
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FiveDPGNSettings } from '@/composables/settings'
import GameToggle from './GameToggle.vue'

defineProps<{
  buttonStyle: StyleValue
  settings: FiveDPGNSettings
}>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="settings-list">
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
    <div class="settings-row">
      <span>{{ t('settings.fiveDPGNBuiltInGlyphNAGs') }}</span>
      <GameToggle
        v-model="settings.includeBuiltInGlyphNAGs"
        :style="buttonStyle"
      />
    </div>
  </div>
</template>
