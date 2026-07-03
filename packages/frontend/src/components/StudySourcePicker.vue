<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StudyDocument } from '@5dcol/shared/protocol'
import { createStudyDocumentFromText } from '@/composables/study'
import GameToggle from './GameToggle.vue'

export type StudySourceKind = 'empty' | 'import'

const props = defineProps<{
  importedTitle: string
}>()

const source = defineModel<StudySourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const document = defineModel<StudyDocument | null>('document', { required: true })
const error = defineModel<string>('error', { required: true })

const { t } = useI18n({ useScope: 'global' })
const importFormat = ref<'pgn' | 'fen'>('pgn')

watch([
  source,
  importText,
  () => props.importedTitle,
], () => {
  if (source.value !== 'import') {
    document.value = null
    error.value = ''
    return
  }

  const text = importText.value.trim()
  if (! text) {
    document.value = null
    error.value = ''
    return
  }

  const result = createStudyDocumentFromText(text, {
    title: props.importedTitle,
  })
  document.value = result.study
  error.value = result.error ?? ''
}, { immediate: true })
</script>

<template>
  <section class="study-source-picker">
    <div class="study-source-picker__header">
      <span>{{ t('study.source') }}</span>
      <div class="study-source-picker__source-options">
        <GameToggle
          v-model="source"
          type="radio"
          value="empty"
        >
          <span>{{ t('study.sourceEmpty') }}</span>
        </GameToggle>
        <GameToggle
          v-model="source"
          type="radio"
          value="import"
        >
          <span>{{ t('study.sourceImport') }}</span>
        </GameToggle>
      </div>
    </div>

    <div
      v-if="source === 'import'"
      class="study-source-picker__import"
    >
      <div class="study-source-picker__import-controls">
        <span>{{ t('import.format') }}</span>
        <div class="study-source-picker__format-options">
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
        class="study-source-picker__textarea"
        :placeholder="t('study.sourceImportPlaceholder')"
        spellcheck="false"
      ></textarea>
      <p
        class="study-source-picker__message"
        :class="{
          'study-source-picker__message--error': error,
          'study-source-picker__message--empty': !error && !document,
        }"
        aria-live="polite"
      >
        <template v-if="error">
          {{ error }}
        </template>
        <template v-else-if="document">
          {{ t('study.sourceImportPreview', {
            title: document.title,
            actions: document.actions.length,
            annotations: document.annotations.length,
          }) }}
        </template>
        <template v-else>
          {{ t('study.sourceImportEmpty') }}
        </template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.study-source-picker {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.study-source-picker__header,
.study-source-picker__import-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
  color: var(--button-text-color);
  font-size: 20px;
  line-height: 1.1;
}

.study-source-picker__source-options,
.study-source-picker__format-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}

.study-source-picker__import {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.study-source-picker__textarea {
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

.study-source-picker__textarea:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.study-source-picker__message {
  min-height: 1.25em;
  margin: 0;
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.25;
}

.study-source-picker__message--empty {
  visibility: hidden;
}

.study-source-picker__message--error {
  color: #9b3a32;
}
</style>
