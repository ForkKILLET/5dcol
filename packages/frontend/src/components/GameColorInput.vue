<script setup lang="ts">
const model = defineModel<string>({ default: '#000000' })
</script>

<template>
  <input
    v-model="model"
    class="game-color-input"
    type="color"
  >
</template>

<style scoped>
.game-color-input {
  box-sizing: border-box;
  width: var(--button-tiny-height);
  height: var(--button-tiny-height);
  padding: 3px;
  border: var(--button-tiny-border) solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
  cursor: pointer;
  outline: none;
}

.game-color-input:focus-visible,
.game-color-input:hover {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
}

.game-color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.game-color-input::-webkit-color-swatch {
  border: 0;
  border-radius: 50%;
}

.game-color-input::-moz-color-swatch {
  border: 0;
  border-radius: 50%;
}
</style>
