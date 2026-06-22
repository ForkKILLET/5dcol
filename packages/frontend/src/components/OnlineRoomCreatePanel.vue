<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'

const props = defineProps<{
  createLabel: string
  nameLabel: string
  namePlaceholder: string
  serverAddress: string
  serverName: string
  title: string
}>()

const emit = defineEmits<{
  back: []
  create: []
}>()

const name = defineModel<string>('name', { required: true })

const { t } = useI18n({ useScope: 'global' })
const displayAddress = computed(() => props.serverAddress.replace(/^https?:\/\//, ''))
</script>

<template>
  <GamePanel
    tag="section"
    class="online-room-create-panel"
  >
    <div class="online-room-create-panel__header">
      <div class="online-room-create-panel__heading">
        <div class="online-room-create-panel__title">{{ title }}</div>
        <div class="online-room-create-panel__server">
          <span v-if="serverName">{{ serverName }}</span>
          <span class="online-room-create-panel__address">{{ displayAddress }}</span>
        </div>
      </div>
    </div>

    <label class="online-room-create-panel__row">
      <span>{{ nameLabel }}</span>
      <span class="online-room-create-panel__input">
        <GameTextInput
          v-model="name"
          :placeholder="namePlaceholder"
          spellcheck="false"
          @keydown.enter.prevent="emit('create')"
        />
      </span>
    </label>

    <slot name="settings" />

    <div class="online-room-create-panel__actions">
      <GameButton
        size="small"
        @click="emit('back')"
      >
        <span>{{ t('button.back') }}</span>
      </GameButton>
      <GameButton
        size="small"
        @click="emit('create')"
      >
        <span>{{ createLabel }}</span>
      </GameButton>
    </div>
  </GamePanel>
</template>

<style scoped>
.online-room-create-panel {
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
}

.online-room-create-panel__header,
.online-room-create-panel__row,
.online-room-create-panel__actions {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.online-room-create-panel__header {
  justify-content: space-between;
}

.online-room-create-panel__heading {
  min-width: 0;
}

.online-room-create-panel__title {
  color: var(--button-text-color);
  font-size: 22px;
  line-height: 1.1;
}

.online-room-create-panel__server {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.75);
  color: var(--button-text-color);
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.online-room-create-panel__address {
  opacity: 0.68;
}

.online-room-create-panel__row {
  justify-content: space-between;
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.58);
}

.online-room-create-panel__input {
  flex: 0 1 360px;
  display: flex;
  align-items: flex-start;
  min-width: 0;
  height: calc(32px + var(--small-button-shadow-offset));
}

.online-room-create-panel__actions {
  justify-content: flex-end;
  margin-top: auto;
}
</style>
