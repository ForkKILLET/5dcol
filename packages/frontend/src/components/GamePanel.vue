<script setup lang="ts">
withDefaults(defineProps<{
  tag?: 'div' | 'section'
}>(), {
  tag: 'div',
})
</script>

<template>
  <component
    :is="tag"
    class="game-panel"
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
}
</style>
