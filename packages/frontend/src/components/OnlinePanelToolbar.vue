<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameButton from './GameButton.vue'
import GameTextInput from './GameTextInput.vue'

defineProps<{
  showBack?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  serverSettings: []
  back: []
}>()

const nickname = defineModel<string>('nickname', { required: true })
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="online-panel-toolbar">
    <label class="online-panel-toolbar__nickname">
      <span class="online-panel-toolbar__input">
        <GameTextInput
          v-model="nickname"
          :placeholder="t('match.nicknamePlaceholder')"
          spellcheck="false"
        />
      </span>
    </label>
    <GameButton
      size="small"
      @click="emit('serverSettings')"
    >
      <span>{{ t('match.serverSettings') }}</span>
    </GameButton>
    <GameButton
      size="small"
      @click="emit('refresh')"
    >
      <span>{{ t('match.refresh') }}</span>
    </GameButton>
    <GameButton
      v-if="showBack !== false"
      size="small"
      @click="emit('back')"
    >
      <span>{{ t('button.back') }}</span>
    </GameButton>
  </div>
</template>

<style scoped>
.online-panel-toolbar {
  flex: 0 1 auto;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
  min-width: 0;
}

.online-panel-toolbar__input {
  flex: 0 1 190px;
  display: flex;
  align-items: flex-start;
  min-width: 0;
  height: calc(32px + var(--small-button-shadow-offset));
}

.online-panel-toolbar__nickname {
  flex: 0 1 auto;
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
  min-width: 0;
}
</style>
