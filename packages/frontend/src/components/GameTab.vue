<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  pressed?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  disabled: false,
  pressed: false,
  type: 'button',
})
</script>

<template>
  <button
    class="game-tab"
    :class="{ 'is-pressed': pressed }"
    :aria-pressed="pressed"
    :disabled="disabled"
    :type="type"
  >
    <slot />
  </button>
</template>

<style scoped>
.game-tab {
  --button-shadow-offset: var(--small-button-shadow-offset);
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--button-content-gap);
  min-width: 96px;
  height: 32px;
  padding: 0 12px;
  border: 2px solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  user-select: none;
}

.game-tab > :deep(*) {
  transform: translateY(var(--ui-text-y));
}

.game-tab:not(:disabled):not(.is-pressed):hover,
.game-tab:not(:disabled):focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-tab:not(:disabled):active,
.game-tab.is-pressed {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
}

.game-tab.is-pressed {
  cursor: default;
}

.game-tab:disabled {
  box-shadow: none;
  cursor: not-allowed;
  transform: translateY(var(--button-shadow-offset));
}
</style>
