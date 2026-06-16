<script setup lang="ts">
import { computed, inject } from 'vue'
import { UiSoundKey } from '@/composables/uiSound'

const model = defineModel<boolean | string | number | null>()

const props = withDefaults(defineProps<{
  size?: 'default' | 'small'
  type?: 'checkbox' | 'radio'
  value?: string | number
}>(), {
  size: 'default',
  type: 'checkbox',
  value: '',
})

const playUISound = inject(UiSoundKey)

const isChecked = computed(() => {
  return props.type === 'checkbox'
    ? Boolean(model.value)
    : model.value === props.value
})

function toggle() {
  const previousValue = model.value
  
  const newValue = props.type === 'checkbox'
    ? ! Boolean(model.value)
    : props.value

  if (newValue !== previousValue) {
    model.value = newValue
    playUISound?.()
  }
}
</script>

<template>
  <label
    class="game-toggle"
    :class="[
      `game-toggle--${size}`,
      `game-toggle--${type}`,
      { 'is-checked': isChecked },
    ]"
  >
    <input
      class="game-toggle-input"
      :type="type"
      :checked="isChecked"
      :value="value"
      @change="toggle"
    >
    <span class="game-toggle-mark" aria-hidden="true">
      <span class="game-toggle-indicator"></span>
    </span>
    <span
      v-if="$slots.default"
      class="game-toggle-label"
    >
      <slot />
    </span>
  </label>
</template>

<style scoped>
.game-toggle {
  --toggle-size: 28px;
  --toggle-accent-color: rgb(39, 39, 39);
  --toggle-check-color: var(--button-text-color);
  --toggle-check-left: 32%;
  --toggle-check-top: 12%;
  --toggle-check-width: 28%;
  --toggle-check-height: 56%;
  --toggle-check-stroke: 4px;
  --toggle-shadow-offset: var(--small-button-shadow-offset);
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.75);
  color: var(--button-text-color);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  user-select: none;
}

.game-toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.game-toggle-mark {
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--toggle-size);
  height: var(--toggle-size);
  border: 2px solid var(--button-border-color);
  border-radius: 7px;
  background: var(--button-fill-color);
  box-shadow: var(--toggle-shadow-offset) var(--toggle-shadow-offset) 0 var(--button-shadow-color);
}

.game-toggle-indicator {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.game-toggle--radio {
  --toggle-size: 28px;
  font-size: 16px;
}

.game-toggle--radio .game-toggle-mark {
  border-radius: 50%;
}

.game-toggle--small {
  --toggle-size: 20px;
  --toggle-check-left: 36%;
  --toggle-check-top: 21%;
  --toggle-check-width: 20%;
  --toggle-check-height: 39%;
  --toggle-check-stroke: 2.5px;
}

.game-toggle--small .game-toggle-mark {
  border-radius: 6px;
}

.game-toggle-label {
  transform: translateY(var(--ui-text-y));
}

.game-toggle:hover .game-toggle-mark,
.game-toggle:focus-within .game-toggle-mark {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
}

.game-toggle:hover,
.game-toggle:focus-within {
  color: var(--button-hover-text-color);
}

.game-toggle--checkbox.is-checked .game-toggle-indicator::before {
  position: absolute;
  left: var(--toggle-check-left);
  top: var(--toggle-check-top);
  width: var(--toggle-check-width);
  height: var(--toggle-check-height);
  border-right: var(--toggle-check-stroke) solid var(--toggle-check-color);
  border-bottom: var(--toggle-check-stroke) solid var(--toggle-check-color);
  content: '';
  transform: rotate(42deg);
}

.game-toggle--radio.is-checked .game-toggle-indicator::before {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50%;
  height: 50%;
  border-radius: 50%;
  background: var(--toggle-accent-color);
  content: '';
  transform: translate(-50%, -50%);
}

.game-toggle:active .game-toggle-mark {
  box-shadow: none;
  transform: translateY(var(--toggle-shadow-offset));
}
</style>
