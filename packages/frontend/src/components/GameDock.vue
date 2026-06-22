<script setup lang="ts">
import { ref } from 'vue'
import GameIcon from './GameIcon.vue'

export type GameDockItem = {
  disabled?: boolean
  icon: 'chat' | 'clock' | 'members' | 'record'
  id: string
  label: string
  pressed?: boolean
}

defineProps<{
  collapseLabel: string
  items: GameDockItem[]
  label: string
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleCollapsed: []
}>()

const collapsed = ref(false)

function toggleCollapsed() {
  collapsed.value = ! collapsed.value
  emit('toggleCollapsed')
}
</script>

<template>
  <nav
    v-if="items.length > 0"
    class="game-dock"
    :class="{ 'game-dock--collapsed': collapsed }"
    :aria-label="label"
  >
    <button
      class="game-dock-handle"
      type="button"
      :aria-label="collapsed ? label : collapseLabel"
      :title="collapsed ? label : collapseLabel"
      @click="toggleCollapsed"
    >
      <GameIcon :name="collapsed ? 'chevron-up' : 'chevron-down'" />
    </button>
    <div class="game-dock-items">
      <button
        v-for="item in items"
        :key="item.id"
        class="game-dock-button"
        type="button"
        :class="{ 'game-dock-button--open': item.pressed }"
        :aria-label="item.label"
        :title="item.label"
        :disabled="item.disabled"
        @click="emit('select', item.id)"
      >
        <span
          class="game-dock-button-state"
          aria-hidden="true"
        ></span>
        <GameIcon :name="item.icon" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.game-dock {
  --dock-button-size: calc(var(--button-small-height) * 1.08);
  --dock-state-size: calc(var(--button-tiny-height) * 0.45);
  position: absolute;
  left: 50%;
  bottom: 0;
  z-index: 4;
  display: grid;
  grid-template-rows: auto auto;
  justify-items: center;
  padding: calc(var(--button-content-gap) * 1.2)
    calc(var(--button-content-gap) * 1.8)
    calc(var(--button-content-gap) * 1.1);
  border: var(--button-border) solid var(--button-border-color);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) 0 0 var(--button-shadow-color);
  pointer-events: auto;
  transform: translateX(-50%);
  transition:
    padding 180ms ease,
    width 180ms ease;
}

.game-dock--collapsed {
  padding:
    calc(var(--button-content-gap) * 0.9)
    calc(var(--button-content-gap) * 1.6)
    calc(var(--button-content-gap) * 0.65);
}

.game-dock-handle {
  position: absolute;
  left: 50%;
  top: calc(var(--button-small-height) * -0.45);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: calc(var(--button-small-height) * 2.25);
  height: calc(var(--button-small-height) * 0.58);
  border: var(--button-small-border) solid var(--button-border-color);
  border-bottom: 0;
  border-radius: calc(var(--button-small-height) * 0.35) calc(var(--button-small-height) * 0.35) 0 0;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  cursor: pointer;
  outline: none;
  transform: translateX(-50%);
}

.game-dock-handle:hover,
.game-dock-handle:focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-dock-handle :deep(.game-icon) {
  width: calc(var(--button-small-icon-size) * 0.8);
  height: calc(var(--button-small-icon-size) * 0.8);
}

.game-dock-items {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 1.25);
  max-width: calc((var(--dock-button-size) + var(--button-content-gap) * 1.25) * 5);
  overflow: hidden;
  opacity: 1;
  transition:
    max-width 190ms ease,
    opacity 140ms ease,
    transform 190ms ease;
}

.game-dock--collapsed .game-dock-items {
  max-width: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateY(calc(var(--button-small-height) * 0.25));
}

.game-dock-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: var(--dock-button-size);
  height: var(--dock-button-size);
  margin-top: var(--dock-state-size);
  padding: 0;
  border: var(--button-small-border) solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-small-shadow-offset) var(--button-small-shadow-offset) 0 var(--button-shadow-color);
  cursor: pointer;
  outline: none;
}

.game-dock-button :deep(.game-icon) {
  width: calc(var(--button-small-icon-size) * 0.88);
  height: calc(var(--button-small-icon-size) * 0.88);
}

.game-dock-button:not(:disabled):hover,
.game-dock-button:not(:disabled):focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-dock-button:not(:disabled):active {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-dock-button:disabled {
  border-color: color-mix(in srgb, var(--button-fill-color) 55%, var(--button-shadow-color));
  background: color-mix(in srgb, var(--button-fill-color) 78%, var(--button-shadow-color));
  color: color-mix(in srgb, var(--button-text-color) 50%, var(--button-fill-color));
  box-shadow: none;
  cursor: not-allowed;
}

.game-dock-button-state {
  position: absolute;
  left: 50%;
  top: calc(var(--dock-state-size) * -1.65);
  box-sizing: border-box;
  width: var(--dock-state-size);
  height: var(--dock-state-size);
  border: max(1px, var(--button-tiny-border)) solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
  transform: translateX(-50%);
}

.game-dock-button--open .game-dock-button-state::before {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  background: var(--button-text-color);
  content: '';
}
</style>
