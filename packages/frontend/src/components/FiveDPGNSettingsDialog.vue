<script setup lang="ts">
import type { StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FiveDPGNSettings } from '@/composables/settings'
import FiveDPGNSettingsFields from './FiveDPGNSettingsFields.vue'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'

defineProps<{
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
    <FiveDPGNSettingsFields
      class="settings-list--narrow"
      :settings="settings"
      :button-style="buttonStyle"
    />
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
