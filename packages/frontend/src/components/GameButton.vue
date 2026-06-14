<script setup lang="ts">
const props = withDefaults(defineProps<{
  badge?: string
  disabled?: boolean
  pressed?: boolean
  pressedIndicator?: boolean
  pulsing?: boolean
  shape?: 'pill' | 'circle'
  size?: 'default' | 'main' | 'secondary' | 'small' | 'tiny' | 'icon'
  type?: 'button' | 'submit' | 'reset'
}>(), {
  badge: '',
  disabled: false,
  pressed: undefined,
  pressedIndicator: true,
  pulsing: false,
  shape: 'pill',
  size: 'default',
  type: 'button',
})
</script>

<template>
  <button
    class="game-button"
    :class="[
      `game-button--${props.size}`,
      `game-button--${props.shape}`,
      {
        'has-pressed-indicator': pressed !== undefined && pressedIndicator && shape === 'pill',
        'is-pressed': pressed === true,
        'is-pulsing': pulsing && !disabled,
      },
    ]"
    :aria-pressed="pressed"
    :disabled="disabled"
    :type="type"
  >
    <span
      v-if="pressed !== undefined && pressedIndicator && shape === 'pill'"
      class="game-button-pressed-indicator"
      aria-hidden="true"
    ></span>
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
  --button-pressed-indicator-left: calc(var(--button-content-gap) * 1.25);
  --button-pressed-indicator-size: 28px;
  position: relative;
  flex: 0 0 auto;
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

.game-button--main {
  width: var(--main-menu-button-width);
  height: var(--main-menu-button-height);
  border-radius: calc(var(--main-menu-button-height) / 2);
  font-size: var(--main-menu-button-font-size);
}

.game-button--secondary {
  width: var(--secondary-button-width);
  max-width: calc(100vw - var(--button-top) * 4 - var(--button-content-gap) * 10);
}

.game-button--small {
  --button-pressed-indicator-left: 10px;
  --button-pressed-indicator-size: 24px;
  --button-shadow-offset: var(--small-button-shadow-offset);
  width: auto;
  min-width: 96px;
  height: 32px;
  padding: 0 12px;
  border-width: 2px;
  border-radius: 16px;
  font-size: 16px;
}

.game-button--tiny {
  --button-pressed-indicator-left: 8px;
  --button-pressed-indicator-size: 20px;
  --button-shadow-offset: var(--small-button-shadow-offset);
  width: auto;
  min-width: 58px;
  height: 28px;
  padding: 0 8px;
  border-width: 2px;
  border-radius: 14px;
  font-size: 14px;
}

.game-button--circle {
  width: var(--button-height);
  min-width: var(--button-height);
  padding: 0;
  border-radius: 50%;
}

.game-button--icon.game-button--circle {
  width: var(--button-circle-size);
  min-width: var(--button-circle-size);
}

.game-button--small.game-button--circle {
  width: 32px;
  min-width: 32px;
  font-size: 18px;
}

.game-button.has-pressed-indicator {
  padding-left: calc(var(--button-pressed-indicator-left) + var(--button-pressed-indicator-size) + var(--button-content-gap));
  padding-right: calc(var(--button-pressed-indicator-left) + var(--button-pressed-indicator-size) + var(--button-content-gap));
}

.game-button > :deep(*) {
  transform: translateY(var(--ui-text-y));
}

.game-button-pressed-indicator {
  position: absolute;
  left: var(--button-pressed-indicator-left);
  top: 50%;
  box-sizing: border-box;
  width: var(--button-pressed-indicator-size);
  height: var(--button-pressed-indicator-size);
  border: 2px solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  transform: translateY(-50%);
}

.game-button.is-pressed .game-button-pressed-indicator::before {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50%;
  height: 50%;
  border-radius: 50%;
  background: var(--button-text-color);
  content: '';
  transform: translate(-50%, -50%);
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

.game-button:not(:disabled):hover,
.game-button:not(:disabled):focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-button:not(:disabled):hover .game-button-pressed-indicator,
.game-button:not(:disabled):focus-visible .game-button-pressed-indicator {
  border-color: var(--button-hover-border-color);
  background: var(--button-fill-color);
}

.game-button:not(:disabled):hover .game-button-pressed-indicator::before,
.game-button:not(:disabled):focus-visible .game-button-pressed-indicator::before {
  background: var(--button-hover-text-color);
}

.game-button:not(:disabled):active {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
}

.game-button.is-pressed:not(.has-pressed-indicator) {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
}

.game-button:disabled {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
  cursor: not-allowed;
}

.game-button.is-pulsing:not(:hover):not(:focus-visible) {
  animation: button-pulse var(--button-pulse-duration) ease-in-out infinite;
}

@keyframes button-pulse {
  0%,
  100% {
    border-color: var(--button-border-color);
    background: var(--button-fill-color);
    color: var(--button-text-color);
  }

  50% {
    border-color: var(--button-pulse-border-color);
    background: var(--button-pulse-fill-color);
    color: var(--button-pulse-text-color);
  }
}
</style>
