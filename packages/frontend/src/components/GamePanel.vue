<script setup lang="ts">
withDefaults(defineProps<{
  shadow?: boolean
  tag?: 'aside' | 'div' | 'section'
}>(), {
  shadow: false,
  tag: 'div',
})
</script>

<template>
  <component
    :is="tag"
    class="game-panel"
    :class="{ 'game-panel--shadow': shadow }"
  >
    <slot />
  </component>
</template>

<style scoped>
.game-panel {
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  box-sizing: border-box;
  padding: calc(var(--button-content-gap) * 1.5);
  border: 2px solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
}

.game-panel--shadow {
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
}
</style>
