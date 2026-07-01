<script setup lang="ts">
import type { GamePanelGroup, GamePanelId } from '@/composables/panelLayout'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

export type GameSidePanelTab = {
  icon: 'chat' | 'members' | 'record'
  id: GamePanelId
  label: string
}

defineProps<{
  addLabel: string
  closeLabel: string
  group: GamePanelGroup
  tabs: GameSidePanelTab[]
}>()

const emit = defineEmits<{
  addPanel: [groupId: string]
  closePanel: [panelId: GamePanelId]
  selectPanel: [groupId: string, panelId: GamePanelId]
}>()
</script>

<template>
  <section class="game-side-panel-group">
    <div class="game-side-panel-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="game-side-panel-tab"
        :class="{ 'is-active': group.activePanelId === tab.id }"
        type="button"
        :aria-pressed="group.activePanelId === tab.id"
        @click="emit('selectPanel', group.id, tab.id)"
      >
        <GameIcon :name="tab.icon" />
        <span>{{ tab.label }}</span>
      </button>
      <div class="game-side-panel-tab-actions">
        <GameButton
          size="tiny"
          shape="circle"
          :aria-label="addLabel"
          :title="addLabel"
          @click="emit('addPanel', group.id)"
        >
          <GameIcon name="plus" />
        </GameButton>
        <GameButton
          size="tiny"
          shape="circle"
          :aria-label="closeLabel"
          :title="closeLabel"
          @click="emit('closePanel', group.activePanelId)"
        >
          <GameIcon name="x" />
        </GameButton>
      </div>
    </div>
    <div class="game-side-panel-group-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.game-side-panel-group {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  pointer-events: auto;
}

.game-side-panel-tabs {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
  padding: 0 calc(var(--button-content-gap) * 0.5);
}

.game-side-panel-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--button-content-gap) * 0.5);
  min-width: 0;
  height: var(--button-tiny-height);
  padding: 0 calc(var(--button-content-gap) * 0.9);
  border: var(--button-tiny-border) solid var(--button-border-color);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-tiny-shadow-offset) 0 0 var(--button-shadow-color);
  font: inherit;
  font-size: var(--button-tiny-font-size);
  line-height: 1;
  cursor: pointer;
  outline: none;
}

.game-side-panel-tab:not(.is-active):hover,
.game-side-panel-tab:not(.is-active):focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-side-panel-tab.is-active {
  position: relative;
  z-index: var(--z-content-raised);
  transform: translateY(var(--button-tiny-border));
}

.game-side-panel-tab :deep(.game-icon) {
  width: var(--button-tiny-icon-size);
  height: var(--button-tiny-icon-size);
}

.game-side-panel-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-side-panel-tab-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.5);
  margin-left: auto;
  padding-bottom: var(--button-tiny-border);
}

.game-side-panel-tab-actions :deep(.game-button) {
  width: var(--button-tiny-height);
  min-width: var(--button-tiny-height);
}

.game-side-panel-group-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.game-side-panel-group-content > :deep(*) {
  flex: 1 1 auto;
}
</style>
