<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VersusImportedSource } from '@/composables/localVersus'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'
import VersusSourcePicker, { type VersusSourceKind } from './VersusSourcePicker.vue'

const props = withDefaults(defineProps<{
  createLabel: string
  nameLabel: string
  namePlaceholder: string
  serverAddress?: string
  serverName?: string
  title: string
}>(), {
  serverAddress: '',
  serverName: '',
})

const emit = defineEmits<{
  back: []
  create: [source: VersusImportedSource | null]
}>()

const name = defineModel<string>('name', { required: true })
const source = defineModel<VersusSourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const importSource = defineModel<VersusImportedSource | null>('importSource', { required: true })
const importError = defineModel<string>('importError', { required: true })

const { t } = useI18n({ useScope: 'global' })
const displayAddress = computed(() => props.serverAddress.replace(/^https?:\/\//, ''))
const canCreate = computed(() => (
  source.value !== 'import'
  || (importText.value.trim().length > 0 && importSource.value !== null && ! importError.value)
))

function create() {
  if (! canCreate.value) return
  emit('create', source.value === 'import' ? importSource.value : null)
}
</script>

<template>
  <GamePanel
    tag="section"
    class="versus-create-panel"
  >
    <div class="versus-create-panel__header">
      <div class="versus-create-panel__heading">
        <div class="versus-create-panel__title">{{ title }}</div>
        <div
          v-if="serverName || displayAddress"
          class="versus-create-panel__server"
        >
          <span v-if="serverName">{{ serverName }}</span>
          <span
            v-if="displayAddress"
            class="versus-create-panel__address"
          >{{ displayAddress }}</span>
        </div>
      </div>
    </div>

    <label class="versus-create-panel__row">
      <span>{{ nameLabel }}</span>
      <span class="versus-create-panel__input">
        <GameTextInput
          v-model="name"
          :placeholder="namePlaceholder"
          spellcheck="false"
          @keydown.enter.prevent="create"
        />
      </span>
    </label>

    <slot name="settings" />

    <VersusSourcePicker
      v-model:source="source"
      v-model:import-text="importText"
      v-model:imported-source="importSource"
      v-model:error="importError"
    />

    <div class="versus-create-panel__actions">
      <GameButton
        size="small"
        @click="emit('back')"
      >
        <span>{{ t('button.back') }}</span>
      </GameButton>
      <GameButton
        size="small"
        :disabled="!canCreate"
        @click="create"
      >
        <span>{{ createLabel }}</span>
      </GameButton>
    </div>
  </GamePanel>
</template>

<style scoped>
.versus-create-panel {
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
  overflow: auto;
}

.versus-create-panel__header,
.versus-create-panel__row,
.versus-create-panel__actions {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.versus-create-panel__header {
  justify-content: space-between;
}

.versus-create-panel__heading {
  min-width: 0;
}

.versus-create-panel__title {
  color: var(--button-text-color);
  font-size: 22px;
  line-height: 1.1;
}

.versus-create-panel__server {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.75);
  color: var(--button-text-color);
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.versus-create-panel__address {
  opacity: 0.68;
}

.versus-create-panel__row {
  justify-content: space-between;
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.58);
}

.versus-create-panel__input {
  flex: 0 1 360px;
  display: flex;
  align-items: flex-start;
  min-width: 0;
  height: calc(32px + var(--small-button-shadow-offset));
}

.versus-create-panel__actions {
  justify-content: flex-end;
  margin-top: auto;
}
</style>
