<script setup lang="ts">
import { ref, watch } from 'vue'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'
import GameToggle from './GameToggle.vue'

const name = defineModel<string>('name', { required: true })
const visibilityPrivate = defineModel<boolean>('visibilityPrivate', { default: false })

withDefaults(defineProps<{
  backLabel: string
  deleteConfirmLabel: string
  deleteLabel: string
  dangerTitle: string
  dialog?: boolean
  meta?: string
  nameLabel: string
  namePlaceholder: string
  saveLabel: string
  showVisibility?: boolean
  title: string
  visibilityLabel?: string
  visibilityPrivateLabel?: string
}>(), {
  dialog: false,
  meta: '',
  showVisibility: false,
  visibilityLabel: '',
  visibilityPrivateLabel: '',
})

const emit = defineEmits<{
  back: []
  delete: []
  save: []
}>()

const confirmingDelete = ref(false)

watch(name, () => {
  confirmingDelete.value = false
})

watch(visibilityPrivate, () => {
  confirmingDelete.value = false
})

function clickDelete() {
  if (! confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  emit('delete')
}

function clickBack() {
  confirmingDelete.value = false
  emit('back')
}

function clickSave() {
  confirmingDelete.value = false
  emit('save')
}
</script>

<template>
  <GamePanel
    class="room-manage-panel"
    :class="{ 'room-manage-panel--dialog': dialog }"
  >
    <div class="room-manage-panel__body">
      <div class="room-manage-panel__header">
        <div class="room-manage-panel__heading">
          <div class="room-manage-panel__title">{{ title }}</div>
          <div
            v-if="meta"
            class="room-manage-panel__meta"
          >
            {{ meta }}
          </div>
        </div>
      </div>

      <label class="room-manage-panel__row">
        <span>{{ nameLabel }}</span>
        <span class="room-manage-panel__input">
          <GameTextInput
            v-model="name"
            :placeholder="namePlaceholder"
            spellcheck="false"
            @keydown.enter.prevent="clickSave"
          />
        </span>
      </label>

      <div
        v-if="showVisibility"
        class="room-manage-panel__row"
      >
        <span>{{ visibilityLabel }}</span>
        <GameToggle
          v-model="visibilityPrivate"
          size="small"
        >
          <span>{{ visibilityPrivateLabel }}</span>
        </GameToggle>
      </div>

      <section class="room-manage-panel__danger">
        <div class="room-manage-panel__danger-title">{{ dangerTitle }}</div>
        <GameButton
          class="room-manage-panel__delete"
          size="small"
          @click="clickDelete"
        >
          <span>{{ confirmingDelete ? deleteConfirmLabel : deleteLabel }}</span>
        </GameButton>
      </section>
    </div>

    <div class="room-manage-panel__actions">
      <GameButton
        size="small"
        @click="clickBack"
      >
        <span>{{ backLabel }}</span>
      </GameButton>
      <GameButton
        size="small"
        @click="clickSave"
      >
        <span>{{ saveLabel }}</span>
      </GameButton>
    </div>
  </GamePanel>
</template>

<style scoped>
.room-manage-panel {
  flex: 1 1 auto;
  box-sizing: border-box;
  min-height: min(360px, calc(var(--app-height) - var(--button-top) * 2));
  max-height: calc(var(--app-height) - var(--button-top) * 2);
}

.room-manage-panel--dialog {
  border: var(--button-border) solid var(--menu-card-border-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
}

.room-manage-panel__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  min-height: 0;
  padding-right: var(--scrollbar-content-gap);
  overflow: auto;
  scrollbar-gutter: stable;
}

.room-manage-panel__header,
.room-manage-panel__row,
.room-manage-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.room-manage-panel__heading {
  min-width: 0;
}

.room-manage-panel__title {
  overflow: hidden;
  font-size: calc(var(--button-font-size) * 0.62);
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-manage-panel__meta {
  overflow: hidden;
  margin-top: calc(var(--button-content-gap) * 0.5);
  font-size: var(--button-small-font-size);
  line-height: 1.25;
  opacity: 0.72;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-manage-panel__row {
  font-size: var(--button-small-font-size);
}

.room-manage-panel__input {
  flex: 1 1 auto;
  min-width: 0;
}

.room-manage-panel__danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
  margin-top: auto;
  padding-top: calc(var(--button-content-gap) * 2);
  border-top: var(--button-small-border) solid color-mix(in srgb, var(--button-border-color) 55%, transparent);
}

.room-manage-panel__danger-title {
  font-size: var(--button-small-font-size);
  opacity: 0.78;
}

.room-manage-panel__delete {
  --button-border-color: var(--button-danger-border-color);
  --button-fill-color: var(--button-danger-fill-color);
  --button-text-color: var(--button-danger-text-color);
  --button-hover-border-color: var(--button-danger-hover-border-color);
  --button-hover-fill-color: var(--button-danger-hover-fill-color);
  --button-hover-text-color: var(--button-danger-hover-text-color);
}

.room-manage-panel__actions {
  flex: 0 0 auto;
  justify-content: flex-end;
}
</style>
