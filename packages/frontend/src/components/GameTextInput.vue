<script setup lang="ts">
const model = defineModel<string>({ default: '' })

withDefaults(defineProps<{
  size?: 'full' | 'setting'
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
  height: 32px;
  padding: 0 10px;
  border: 2px solid var(--button-border-color);
  border-radius: 16px;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--small-button-shadow-offset) var(--small-button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  outline: none;
}

.game-text-input--full {
  width: 100%;
}

.game-text-input--setting {
  width: 180px;
}

.game-text-input:focus {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}
</style>
