<script setup lang="ts">
withDefaults(defineProps<{
  badge?: string
  disabled?: boolean
  open?: boolean
  pulsing?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  badge: '',
  disabled: false,
  open: false,
  pulsing: false,
  type: 'button',
})
</script>

<template>
  <button
    class="game-button"
    :class="{
      'is-open': open,
      'is-pulsing': pulsing && !disabled,
    }"
    :disabled="disabled"
    :type="type"
  >
    <slot />
    <span
      v-if="badge"
      class="game-button-badge"
      aria-hidden="true"
    >{{ badge }}</span>
  </button>
</template>

<style scoped>
.game-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--button-content-gap);
  width: var(--button-width);
  height: var(--button-height);
  padding: 0 20px;
  border: var(--button-border) solid var(--button-border-color);
  border-radius: calc(var(--button-height) / 2);
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: var(--button-font-size);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  user-select: none;
}

.game-button > span {
  transform: translateY(var(--ui-text-y));
}

.game-button-badge {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: calc(min(var(--button-height), 48px) * 0.42);
  height: calc(min(var(--button-height), 48px) * 0.42);
  border: 2px solid rgb(184, 84, 61);
  border-radius: 50%;
  background: rgb(212, 105, 80);
  color: rgb(244, 245, 237);
  font-size: calc(min(var(--button-font-size), 32px) * 0.58);
  line-height: 1;
  pointer-events: none;
  transform: translate(35%, -35%);
}

.game-button > .game-button-badge {
  transform: translate(35%, -35%);
}
</style>