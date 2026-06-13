<script setup lang="ts">
import type { StyleValue } from 'vue'

withDefaults(defineProps<{
  buttonStyle?: StyleValue
  cardClass?: string | string[] | Record<string, boolean>
  closeOnBackdrop?: boolean
  loading?: boolean
  narrow?: boolean
  title?: string
}>(), {
  buttonStyle: undefined,
  cardClass: '',
  closeOnBackdrop: true,
  loading: false,
  narrow: false,
  title: '',
})

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div
    class="dialog-backdrop"
    :class="{ 'loading-backdrop': loading }"
    @click="closeOnBackdrop && emit('close')"
  >
    <div
      class="dialog-card"
      :class="[
        cardClass,
        {
          'dialog-card--narrow': narrow,
        },
      ]"
      :style="buttonStyle"
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
  z-index: 10;
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
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  pointer-events: auto;
}

.dialog-card--export {
  width: min(840px, calc(100vw - var(--button-top) * 4));
}

.dialog-card--narrow {
  align-items: center;
  width: fit-content;
  max-width: calc(100vw - var(--button-top) * 4);
}
</style>
