<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { StyleValue } from 'vue'

const props = withDefaults(defineProps<{
  buttonStyle?: StyleValue
  cardClass?: string | string[] | Record<string, boolean>
  closeOnBackdrop?: boolean
  externalFocusSelector?: string
  loading?: boolean
  narrow?: boolean
  title?: string
}>(), {
  buttonStyle: undefined,
  cardClass: '',
  closeOnBackdrop: true,
  externalFocusSelector: '',
  loading: false,
  narrow: false,
  title: '',
})

const emit = defineEmits<{
  close: []
}>()

const dialogCard = ref<HTMLElement | null>(null)
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

onMounted(() => {
  void nextTick(() => {
    dialogCard.value?.focus({ preventScroll: true })
  })
  document.addEventListener('keydown', handleDocumentKeyDown, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleDocumentKeyDown, true)
})

function getFocusableElements(): HTMLElement[] {
  const card = dialogCard.value
  if (! card) return []

  const elements = [
    ...Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)),
    ...getExternalFocusableElements(),
  ]

  return [...new Set(elements)]
    .filter(element => (
      ! element.hasAttribute('disabled')
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ))
}

function getExternalFocusableElements(): HTMLElement[] {
  if (! props.externalFocusSelector) return []
  return Array.from(document.querySelectorAll<HTMLElement>(props.externalFocusSelector))
}

function handleDocumentKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  trapTab(e)
}

function trapTab(e: KeyboardEvent) {
  const card = dialogCard.value
  if (! card) return

  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    e.preventDefault()
    card.focus({ preventScroll: true })
    return
  }

  const active = document.activeElement
  const activeIndex = active instanceof HTMLElement ? focusable.indexOf(active) : -1

  if (e.shiftKey) {
    e.preventDefault()
    const previousIndex = activeIndex > 0 ? activeIndex - 1 : focusable.length - 1
    focusable[previousIndex]!.focus({ preventScroll: true })
    return
  }

  e.preventDefault()
  const nextIndex = activeIndex >= 0 && active !== card ? (activeIndex + 1) % focusable.length : 0
  focusable[nextIndex]!.focus({ preventScroll: true })
}
</script>

<template>
  <div
    class="dialog-backdrop"
    :class="{ 'loading-backdrop': loading }"
    @click="closeOnBackdrop && emit('close')"
  >
    <div
      ref="dialogCard"
      class="dialog-card"
      :class="[
        cardClass,
        {
          'dialog-card--narrow': narrow,
        },
      ]"
      :style="buttonStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="title || undefined"
      tabindex="-1"
      @click.stop
    >
      <h2
        v-if="title"
        class="dialog-title"
      >
        {{ title }}
      </h2>
      <slot />
      <div
        v-if="$slots.actions"
        class="dialog-actions"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog-mask);
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: var(--button-top);
  background: var(--overlay-mask-color);
  pointer-events: auto;
}

.loading-backdrop {
  width: 100vw;
  height: 100vh;
  min-height: 100dvh;
  min-height: 100lvh;
  background: #8293b3;
}

.dialog-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  box-sizing: border-box;
  width: min(720px, calc(100vw - var(--button-top) * 4));
  max-height: max(160px, calc(var(--app-height) - var(--button-top) * 2));
  overflow: auto;
  padding: calc(var(--button-content-gap) * 5);
  padding-right: calc(var(--button-content-gap) * 5 + var(--scrollbar-content-gap));
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  outline: none;
  pointer-events: auto;
  scrollbar-gutter: stable;
}

.dialog-card--export {
  width: min(840px, calc(100vw - var(--button-top) * 4));
}

.dialog-card--settings {
  width: min(920px, calc(100vw - var(--button-top) * 4));
  height: min(620px, calc(var(--app-height) - var(--button-top) * 2));
}

.dialog-card--room-manage {
  width: min(720px, calc(100vw - var(--button-top) * 4));
  max-height: calc(var(--app-height) - var(--button-top) * 2);
  overflow: visible;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.dialog-card--narrow {
  align-items: center;
  width: fit-content;
  max-width: calc(100vw - var(--button-top) * 4);
}
</style>
