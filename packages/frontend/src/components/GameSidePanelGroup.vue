<script setup lang="ts">
import { computed } from 'vue'
import type { GamePanelGroup, GamePanelId, GamePanelSide } from '@/composables/panelLayout'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GameTab from './GameTab.vue'

export type GameSidePanelTab = {
  icon: 'chat' | 'clock' | 'members' | 'record'
  id: GamePanelId
  label: string
}

const props = defineProps<{
  addLabel: string
  canResizeAfter?: boolean
  closeLabel: string
  group: GamePanelGroup
  height: number
  side: GamePanelSide
  tabs: GameSidePanelTab[]
}>()

const emit = defineEmits<{
  addPanel: [groupId: string]
  closePanel: [panelId: GamePanelId]
  resizeAfter: [side: GamePanelSide, groupId: string, event: PointerEvent]
  selectPanel: [groupId: string, panelId: GamePanelId]
}>()

const groupStyle = computed(() => ({
  '--game-side-panel-group-grow': props.height,
}))
</script>

<template>
  <section
    class="game-side-panel-group"
    :style="groupStyle"
  >
    <div class="game-side-panel-tabs">
      <GameTab
        v-for="tab in tabs"
        :key="tab.id"
        class="game-side-panel-tab"
        :pressed="group.activePanelId === tab.id"
        @click="emit('selectPanel', group.id, tab.id)"
      >
        <GameIcon :name="tab.icon" />
        <span>{{ tab.label }}</span>
      </GameTab>
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
    <div
      v-if="canResizeAfter"
      class="game-side-panel-group-resize-handle"
      @pointerdown.stop.prevent="emit('resizeAfter', side, group.id, $event)"
    ></div>
  </section>
</template>

<style scoped>
.game-side-panel-group {
  position: relative;
  display: flex;
  flex: var(--game-side-panel-group-grow) 1 0;
  flex-direction: column;
  min-height: 132px;
  pointer-events: auto;
}

.game-side-panel-tabs {
  position: relative;
  z-index: var(--z-ui-handle);
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
  padding: 0 0 calc(var(--button-content-gap) * 0.6);
}

.game-side-panel-tab {
  min-width: 0;
}

.game-side-panel-tab :deep(.game-icon) {
  width: var(--button-small-icon-size);
  height: var(--button-small-icon-size);
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
  min-height: 0;
}

.game-side-panel-group-resize-handle {
  position: absolute;
  z-index: var(--z-ui-handle);
  right: 8px;
  bottom: -5px;
  left: 8px;
  height: 10px;
  cursor: ns-resize;
  touch-action: none;
}

.game-side-panel-group-resize-handle::after {
  position: absolute;
  right: 10px;
  bottom: 4px;
  left: 10px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
  opacity: 0;
  transition: opacity 160ms ease;
}

.game-side-panel-group-resize-handle:hover::after,
:global(.game-side-panel-vertical-resizing) .game-side-panel-group-resize-handle::after {
  opacity: 0.42;
}

:global(.game-side-panel-vertical-resizing),
:global(.game-side-panel-vertical-resizing *) {
  cursor: ns-resize !important;
  user-select: none !important;
}
</style>
