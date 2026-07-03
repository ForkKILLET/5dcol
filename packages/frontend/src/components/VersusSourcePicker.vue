<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createVersusSourceFromText,
  type VersusImportedSource,
} from '@/composables/localVersus'
import GameToggle from './GameToggle.vue'

export type VersusSourceKind = 'empty' | 'import'

const source = defineModel<VersusSourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const importedSource = defineModel<VersusImportedSource | null>('importedSource', { required: true })
const error = defineModel<string>('error', { required: true })

const { t } = useI18n({ useScope: 'global' })
const importFormat = ref<'pgn' | 'fen'>('pgn')

watch([source, importText], () => {
  if (source.value !== 'import') {
    importedSource.value = null
    error.value = ''
    return
  }

  const text = importText.value.trim()
  if (! text) {
    importedSource.value = null
    error.value = ''
    return
  }

  const result = createVersusSourceFromText(text)
  importedSource.value = result.source
  error.value = result.error ?? ''
}, { immediate: true })
</script>

<template>
  <section class="versus-source-picker">
    <div class="versus-source-picker__header">
      <span>{{ t('versus.source') }}</span>
      <div class="versus-source-picker__source-options">
        <GameToggle
          v-model="source"
          type="radio"
          value="empty"
        >
          <span>{{ t('versus.sourceEmpty') }}</span>
        </GameToggle>
        <GameToggle
          v-model="source"
          type="radio"
          value="import"
        >
          <span>{{ t('versus.sourceImport') }}</span>
        </GameToggle>
      </div>
    </div>

    <div
      v-if="source === 'import'"
      class="versus-source-picker__import"
    >
      <div class="versus-source-picker__import-controls">
        <span>{{ t('import.format') }}</span>
        <div class="versus-source-picker__format-options">
          <GameToggle
            v-model="importFormat"
            type="radio"
            value="pgn"
          >
            <span>{{ t('import.formatPGN') }}</span>
          </GameToggle>
          <GameToggle
            v-model="importFormat"
            type="radio"
            value="fen"
          >
            <span>{{ t('import.formatFEN') }}</span>
          </GameToggle>
        </div>
      </div>
      <textarea
        v-model="importText"
        class="versus-source-picker__textarea"
        :placeholder="t('versus.sourceImportPlaceholder')"
        spellcheck="false"
      ></textarea>
      <p
        class="versus-source-picker__message"
        :class="{
          'versus-source-picker__message--error': error,
          'versus-source-picker__message--empty': !error && !importedSource,
        }"
        aria-live="polite"
      >
        <template v-if="error">
          {{ error }}
        </template>
        <template v-else-if="importedSource">
          {{ t('versus.sourceImportPreview', {
            actions: importedSource.actionCount,
            annotations: importedSource.annotationCount,
          }) }}
        </template>
        <template v-else>
          {{ t('versus.sourceImportEmpty') }}
        </template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.versus-source-picker {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.versus-source-picker__header,
.versus-source-picker__import-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
  color: var(--button-text-color);
  font-size: 20px;
  line-height: 1.1;
}

.versus-source-picker__source-options,
.versus-source-picker__format-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}

.versus-source-picker__import {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.versus-source-picker__textarea {
  min-height: 150px;
  max-height: 230px;
  padding: calc(var(--button-content-gap) * 2);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: 18px;
  line-height: 1.35;
  outline: none;
  resize: vertical;
}

.versus-source-picker__textarea:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.versus-source-picker__message {
  min-height: 1.3em;
  margin: 0;
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.3;
}

.versus-source-picker__message--error {
  color: rgb(220 96 88);
}

.versus-source-picker__message--empty {
  opacity: 0.68;
}
</style>
