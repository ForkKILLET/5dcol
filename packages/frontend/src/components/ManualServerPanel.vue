<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'

defineProps<{
  placeholder: string
}>()

const emit = defineEmits<{
  add: []
}>()

const address = defineModel<string>('address', { required: true })
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <GamePanel
    tag="section"
    class="manual-server-panel"
  >
    <div class="manual-server-panel__row">
      <div class="manual-server-panel__input">
        <GameTextInput
          v-model="address"
          :placeholder="placeholder"
          spellcheck="false"
          @keydown.enter.prevent="emit('add')"
        />
      </div>
      <GameButton
        size="small"
        :disabled="address.trim().length === 0"
        @click="emit('add')"
      >
        <span>{{ t('match.addServer') }}</span>
      </GameButton>
    </div>
  </GamePanel>
</template>

<style scoped>
.manual-server-panel__row {
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
}

.manual-server-panel__input {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  min-width: 0;
  height: calc(32px + var(--small-button-shadow-offset));
}
</style>
