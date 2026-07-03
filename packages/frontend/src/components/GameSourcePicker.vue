<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameToggle from './GameToggle.vue'

export type SourcePickerKind = 'empty' | 'import'

const props = defineProps<{
  emptyLabel: string
  error: string
  fenPlaceholder: string
  hasPreview: boolean
  importLabel: string
  pgnPlaceholder: string
  sourceLabel: string
}>()

const source = defineModel<SourcePickerKind>('source', { required: true })
const importText = defineModel<string>('importText', { required: true })

const { t } = useI18n({ useScope: 'global' })
const importFormat = ref<'pgn' | 'fen'>('pgn')
const importPlaceholder = computed(() => (
  importFormat.value === 'pgn'
    ? props.pgnPlaceholder
    : props.fenPlaceholder
))
</script>

<template>
  <section class="game-source-picker">
    <div class="game-source-picker__header">
      <span>{{ sourceLabel }}</span>
      <div class="game-source-picker__source-options">
        <GameToggle
          v-model="source"
          type="radio"
          value="empty"
        >
          <span>{{ emptyLabel }}</span>
        </GameToggle>
        <GameToggle
          v-model="source"
          type="radio"
          value="import"
        >
          <span>{{ importLabel }}</span>
        </GameToggle>
      </div>
    </div>

    <div
      v-if="source === 'import'"
      class="game-source-picker__import"
    >
      <div class="game-source-picker__import-controls">
        <span>{{ t('import.format') }}</span>
        <div class="game-source-picker__format-options">
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
        class="game-source-picker__textarea"
        :placeholder="importPlaceholder"
        spellcheck="false"
      ></textarea>
      <p
        class="game-source-picker__message"
        :class="{
          'game-source-picker__message--error': error,
          'game-source-picker__message--empty': !error && !hasPreview,
        }"
        aria-live="polite"
      >
        <template v-if="error">
          {{ error }}
        </template>
        <slot
          v-else-if="hasPreview"
          name="preview"
        />
        <slot
          v-else
          name="empty"
        />
      </p>
    </div>
  </section>
</template>

<style scoped>
.game-source-picker {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.game-source-picker__header,
.game-source-picker__import-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
  color: var(--button-text-color);
  font-size: 20px;
  line-height: 1.1;
}

.game-source-picker__source-options,
.game-source-picker__format-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}

.game-source-picker__import {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.game-source-picker__textarea {
  min-height: 150px;
  max-height: 230px;
  padding: calc(var(--button-content-gap) * 2);
  border: var(--button-small-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-small-shadow-offset) var(--button-small-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: 18px;
  line-height: 1.35;
  outline: none;
  resize: vertical;
}

.game-source-picker__textarea:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-source-picker__message {
  min-height: 1.3em;
  margin: 0;
  color: var(--button-text-color);
  font-size: 16px;
  line-height: 1.3;
}

.game-source-picker__message--error {
  color: rgb(220 96 88);
}

.game-source-picker__message--empty {
  opacity: 0.68;
}
</style>
