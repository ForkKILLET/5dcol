<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createVersusSourceFromText,
  type VersusImportedSource,
} from '@/composables/localVersus'
import GameSourcePicker, { type SourcePickerKind } from './GameSourcePicker.vue'

export type VersusSourceKind = SourcePickerKind

const source = defineModel<VersusSourceKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })
const importedSource = defineModel<VersusImportedSource | null>('importedSource', { required: true })
const error = defineModel<string>('error', { required: true })

const { t } = useI18n({ useScope: 'global' })

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
  <GameSourcePicker
    v-model:source="source"
    v-model:import-text="importText"
    :source-label="t('versus.source')"
    :empty-label="t('versus.sourceEmpty')"
    :import-label="t('versus.sourceImport')"
    :pgn-placeholder="t('versus.sourceImportPGNPlaceholder')"
    :fen-placeholder="t('versus.sourceImportFENPlaceholder')"
    :error="error"
    :has-preview="importedSource !== null"
  >
    <template #preview>
      <template v-if="importedSource">
        {{ t('versus.sourceImportPreview', {
          actions: importedSource.actionCount,
          annotations: importedSource.annotationCount,
        }) }}
      </template>
    </template>
    <template #empty>
      {{ t('versus.sourceImportEmpty') }}
    </template>
  </GameSourcePicker>
</template>
