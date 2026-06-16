<script setup lang="ts">
const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  size?: 'full' | 'setting' | 'tiny'
  type?: 'text' | 'password'
}>(), {
  size: 'full',
  type: 'text',
})
</script>

<template>
  <input
    v-model="model"
    class="game-text-input"
    :class="`game-text-input--${size}`"
    :type="type"
  >
</template>

<style scoped>
.game-text-input {
  box-sizing: border-box;
  min-width: 0;
  height: var(--button-small-height);
  padding: 0 10px;
  border: var(--button-small-border) solid var(--button-border-color);
  border-radius: calc(var(--button-small-height) / 2);
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-small-shadow-offset, var(--small-button-shadow-offset)) var(--button-small-shadow-offset, var(--small-button-shadow-offset)) 0 var(--button-shadow-color);
  font: inherit;
  font-size: var(--button-small-font-size);
  line-height: 1;
  outline: none;
}

.game-text-input--full {
  width: 100%;
}

.game-text-input--setting {
  width: 180px;
}

.game-text-input--tiny {
  height: var(--button-tiny-height);
  padding: 0 calc(var(--button-tiny-content-gap) * 2);
  border-width: var(--button-tiny-border);
  border-radius: calc(var(--button-tiny-height) / 2);
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
  font-size: var(--button-tiny-font-size);
}

.game-text-input:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}
</style>
