<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StudyDocument } from '@5dcol/shared/protocol'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'
import GameToggle from './GameToggle.vue'
import StudySourcePicker, { type StudySourceKind } from './StudySourcePicker.vue'

const props = withDefaults(defineProps<{
  createLabel: string
  importedTitle: string
  nameLabel: string
  namePlaceholder: string
  serverAddress?: string
  serverName?: string
  showPrivate?: boolean
  title: string
}>(), {
  serverAddress: '',
  serverName: '',
  showPrivate: false,
})

const emit = defineEmits<{
  back: []
  create: [document: StudyDocument | null]
}>()

const name = defineModel<string>('name', { required: true })
const visibilityPrivate = defineModel<boolean>('visibilityPrivate', { default: true })
const source = defineModel<StudySourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const importDocument = defineModel<StudyDocument | null>('importDocument', { required: true })
const importError = defineModel<string>('importError', { required: true })

const { t } = useI18n({ useScope: 'global' })
const displayAddress = computed(() => props.serverAddress.replace(/^https?:\/\//, ''))
const canCreate = computed(() => (
  source.value !== 'import'
  || (importText.value.trim().length > 0 && importDocument.value !== null && ! importError.value)
))

function create() {
  if (! canCreate.value) return
  emit('create', source.value === 'import' ? importDocument.value : null)
}
</script>

<template>
  <GamePanel
    tag="section"
    class="study-create-panel"
  >
    <div class="study-create-panel__header">
      <div class="study-create-panel__heading">
        <div class="study-create-panel__title">{{ title }}</div>
        <div
          v-if="serverName || displayAddress"
          class="study-create-panel__server"
        >
          <span v-if="serverName">{{ serverName }}</span>
          <span
            v-if="displayAddress"
            class="study-create-panel__address"
          >{{ displayAddress }}</span>
        </div>
      </div>
    </div>

    <label class="study-create-panel__row">
      <span>{{ nameLabel }}</span>
      <span class="study-create-panel__input">
        <GameTextInput
          v-model="name"
          :placeholder="namePlaceholder"
          spellcheck="false"
          @keydown.enter.prevent="create"
        />
      </span>
    </label>

    <div
      v-if="showPrivate"
      class="study-create-panel__row"
    >
      <span>{{ t('match.setting.private') }}</span>
      <GameToggle v-model="visibilityPrivate" />
    </div>

    <StudySourcePicker
      v-model:source="source"
      v-model:import-text="importText"
      v-model:document="importDocument"
      v-model:error="importError"
      :imported-title="importedTitle"
    />

    <div class="study-create-panel__actions">
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
.study-create-panel {
  flex: 1 1 auto;
  justify-content: flex-start;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
  overflow: auto;
}

.study-create-panel__header,
.study-create-panel__row,
.study-create-panel__actions {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.study-create-panel__header {
  justify-content: space-between;
}

.study-create-panel__heading {
  min-width: 0;
}

.study-create-panel__title {
  color: var(--button-text-color);
  font-size: 22px;
  line-height: 1.1;
}

.study-create-panel__server {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.75);
  color: var(--button-text-color);
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.study-create-panel__address {
  opacity: 0.68;
}

.study-create-panel__row {
  justify-content: space-between;
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.58);
}

.study-create-panel__input {
  flex: 0 1 360px;
  display: flex;
  align-items: flex-start;
  min-width: 0;
  height: calc(32px + var(--small-button-shadow-offset));
}

.study-create-panel__actions {
  justify-content: flex-end;
  margin-top: auto;
}
</style>
