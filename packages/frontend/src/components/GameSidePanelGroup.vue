<script setup lang="ts">
import { computed } from 'vue'
import type { GamePanelGroup, GamePanelGroupResizeEdge, GamePanelId, GamePanelSide } from '@/composables/panelLayout'
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
  closeLabel: string
  group: GamePanelGroup
  height: number
  resizingEdge?: GamePanelGroupResizeEdge | null
  side: GamePanelSide
  tabs: GameSidePanelTab[]
  top: number
}>()

const emit = defineEmits<{
  addPanel: [groupId: string]
  closePanel: [panelId: GamePanelId]
  resizeEdge: [side: GamePanelSide, groupId: string, edge: GamePanelGroupResizeEdge, event: PointerEvent]
  selectPanel: [groupId: string, panelId: GamePanelId]
}>()

const groupStyle = computed(() => ({
  '--game-side-panel-group-height': `${props.height * 100}%`,
  '--game-side-panel-group-top': `${props.top * 100}%`,
}))
</script>

<template>
  <section
    class="game-side-panel-group"
    :class="{
      'game-side-panel-group--resizing-before': resizingEdge === 'before',
      'game-side-panel-group--resizing-after': resizingEdge === 'after',
    }"
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
      <div
        class="game-side-panel-group-resize-handle game-side-panel-group-resize-handle--before"
        @pointerdown.stop.prevent="emit('resizeEdge', side, group.id, 'before', $event)"
      ></div>
      <div
        class="game-side-panel-group-resize-handle game-side-panel-group-resize-handle--after"
        @pointerdown.stop.prevent="emit('resizeEdge', side, group.id, 'after', $event)"
      ></div>
    </div>
  </section>
</template>

<style scoped>
.game-side-panel-group {
  --game-side-panel-resize-hit-size: 14px;
  --game-side-panel-resize-line-end-inset: 8px;
  --game-side-panel-resize-line-inset: 3px;
  --game-side-panel-resize-line-size: 2px;

  position: absolute;
  display: flex;
  flex-direction: column;
  height: var(--game-side-panel-group-height);
  min-height: 0;
  pointer-events: auto;
  right: 0;
  left: 0;
  top: var(--game-side-panel-group-top);
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
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.game-side-panel-group-content > :deep(.game-panel),
.game-side-panel-group-content > :deep(.record-panel) {
  flex: 1 1 auto;
  min-height: 0;
}

.game-side-panel-group-resize-handle {
  position: absolute;
  z-index: var(--z-ui-handle);
  right: 0;
  left: 0;
  height: var(--game-side-panel-resize-hit-size);
  cursor: ns-resize;
  touch-action: none;
}

.game-side-panel-group-resize-handle--before {
  top: 0;
}

.game-side-panel-group-resize-handle--after {
  bottom: 0;
}

.game-side-panel-group-resize-handle::after {
  position: absolute;
  right: var(--game-side-panel-resize-line-end-inset);
  left: var(--game-side-panel-resize-line-end-inset);
  height: var(--game-side-panel-resize-line-size);
  border-radius: 999px;
  background: currentColor;
  content: "";
  opacity: 0;
  transition: opacity 160ms ease;
}

.game-side-panel-group-resize-handle--before::after {
  top: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group-resize-handle--after::after {
  bottom: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group-resize-handle:hover::after,
.game-side-panel-group--resizing-before .game-side-panel-group-resize-handle--before::after,
.game-side-panel-group--resizing-after .game-side-panel-group-resize-handle--after::after {
  opacity: 0.42;
}
</style>
