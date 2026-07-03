<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StudyDocument } from '@5dcol/shared/protocol'
import { createStudyDocumentFromText } from '@/composables/study'
import GameSourcePicker, { type SourcePickerKind } from './GameSourcePicker.vue'

export type StudySourceKind = SourcePickerKind

const props = defineProps<{
  importedTitle: string
}>()

const source = defineModel<StudySourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const document = defineModel<StudyDocument | null>('document', { required: true })
const error = defineModel<string>('error', { required: true })

const { t } = useI18n({ useScope: 'global' })

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
  <GameSourcePicker
    v-model:source="source"
    v-model:import-text="importText"
    :source-label="t('study.source')"
    :empty-label="t('study.sourceEmpty')"
    :import-label="t('study.sourceImport')"
    :pgn-placeholder="t('study.sourceImportPGNPlaceholder')"
    :fen-placeholder="t('study.sourceImportFENPlaceholder')"
    :error="error"
    :has-preview="document !== null"
  >
    <template #preview>
      <template v-if="document">
        {{ t('study.sourceImportPreview', {
          title: document.title,
          actions: document.actions.length,
          annotations: document.annotations.length,
        }) }}
      </template>
    </template>
    <template #empty>
      {{ t('study.sourceImportEmpty') }}
    </template>
  </GameSourcePicker>
</template>
