<script setup lang="ts">
import { computed } from 'vue'
import type { GamePanelGroup, GamePanelGroupResizeEdge, GamePanelId, GamePanelSide, GamePanelStretch } from '@/composables/panelLayout'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GameTab from './GameTab.vue'

export type GameSidePanelTab = {
  icon: 'axis-view' | 'chat' | 'clock' | 'members' | 'minimap' | 'record'
  id: GamePanelId
  label: string
}

export type GameSidePanelGroupDropTarget = { index: number, kind: 'tab' }

const props = defineProps<{
  addLabel: string
  closeLabel: string
  draggingPanelId?: GamePanelId | null
  dropTarget?: GameSidePanelGroupDropTarget | null
  group: GamePanelGroup
  height: number
  resizingEdge?: GamePanelGroupResizeEdge | null
  resizingWidth?: boolean
  side: GamePanelSide
  stretch: GamePanelStretch
  tabs: GameSidePanelTab[]
  top: number
  width: number
}>()

const emit = defineEmits<{
  addPanel: [groupId: string]
  closePanel: [panelId: GamePanelId]
  resizeEdge: [side: GamePanelSide, groupId: string, edge: GamePanelGroupResizeEdge, event: PointerEvent]
  resizeWidth: [side: GamePanelSide, groupId: string, event: PointerEvent]
  selectPanel: [groupId: string, panelId: GamePanelId]
  stretchEdge: [side: GamePanelSide, groupId: string, edge: GamePanelGroupResizeEdge]
  tabPointerDown: [payload: { event: PointerEvent, groupId: string, panelId: GamePanelId }]
}>()

const groupStyle = computed(() => ({
  '--game-side-panel-group-height': `${props.height * 100}%`,
  '--game-side-panel-group-top': `${props.top * 100}%`,
  '--game-side-panel-group-width': `${props.width}px`,
}))

function isTabDragging(panelId: GamePanelId): boolean {
  return props.draggingPanelId === panelId
}

function isTabDropBefore(index: number): boolean {
  return props.dropTarget?.kind === 'tab' && props.dropTarget.index === index
}

function isTabDropAfter(index: number): boolean {
  return props.dropTarget?.kind === 'tab' && props.dropTarget.index === index + 1 && index === props.tabs.length - 1
}
</script>

<template>
  <section
    class="game-side-panel-group"
    :class="{
      [`game-side-panel-group--${side}`]: true,
      [`game-side-panel-group--stretch-${stretch}`]: true,
      'game-side-panel-group--resizing-before': resizingEdge === 'before',
      'game-side-panel-group--resizing-after': resizingEdge === 'after',
      'game-side-panel-group--resizing-width': resizingWidth,
    }"
    :data-panel-group-id="group.id"
    :data-panel-side="side"
    :style="groupStyle"
  >
    <div
      class="game-side-panel-tabs"
      data-panel-tabs="true"
      :data-panel-group-id="group.id"
    >
      <GameTab
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="game-side-panel-tab"
        :class="{
          'game-side-panel-tab--dragging': isTabDragging(tab.id),
          'game-side-panel-tab--drop-after': isTabDropAfter(index),
          'game-side-panel-tab--drop-before': isTabDropBefore(index),
        }"
        :data-panel-group-id="group.id"
        :data-panel-tab-id="tab.id"
        :data-panel-tab-index="index"
        :pressed="group.activePanelId === tab.id"
        @click="emit('selectPanel', group.id, tab.id)"
        @pointerdown="emit('tabPointerDown', { groupId: group.id, panelId: tab.id, event: $event })"
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
        @dblclick.stop.prevent="emit('stretchEdge', side, group.id, 'before')"
      ></div>
      <div
        class="game-side-panel-group-resize-handle game-side-panel-group-resize-handle--after"
        @pointerdown.stop.prevent="emit('resizeEdge', side, group.id, 'after', $event)"
        @dblclick.stop.prevent="emit('stretchEdge', side, group.id, 'after')"
      ></div>
      <div
        class="game-side-panel-group-width-resize-handle"
        @pointerdown.stop.prevent="emit('resizeWidth', side, group.id, $event)"
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
  --game-side-panel-resize-stretch-hint-height: 8px;
  --game-side-panel-resize-stretch-hint-width: 16px;

  position: absolute;
  display: flex;
  flex-direction: column;
  height: var(--game-side-panel-group-height);
  min-height: 0;
  pointer-events: auto;
  top: var(--game-side-panel-group-top);
  width: min(var(--game-side-panel-group-width), calc(100vw - var(--button-top) * 2));
}

.game-side-panel-group--left {
  left: 0;
}

.game-side-panel-group--right {
  right: 0;
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
  position: relative;
  cursor: pointer;
  min-width: 0;
  touch-action: none;
}

.game-side-panel-tabs .game-side-panel-tab.is-pressed {
  cursor: pointer;
}

.game-side-panel-tab--dragging {
  cursor: grabbing;
  opacity: 0.42;
}

.game-side-panel-tab--drop-before::before,
.game-side-panel-tab--drop-after::after {
  position: absolute;
  top: calc(var(--button-small-border) * -1);
  bottom: calc(var(--button-small-border) * -1);
  z-index: 1;
  width: 3px;
  border-radius: 999px;
  background: var(--button-hover-border-color);
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
  content: "";
  pointer-events: none;
}

.game-side-panel-tab--drop-before::before {
  left: calc(var(--button-content-gap) * -0.45);
}

.game-side-panel-tab--drop-after::after {
  right: calc(var(--button-content-gap) * -0.45);
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
  position: relative;
  flex: 1 1 auto;
  height: 100%;
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

.game-side-panel-group-resize-handle::before {
  position: absolute;
  left: 50%;
  width: var(--game-side-panel-resize-stretch-hint-width);
  height: var(--game-side-panel-resize-stretch-hint-height);
  background-repeat: no-repeat;
  background-size: 50% 100%, 50% 100%;
  content: "";
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 160ms ease;
}

.game-side-panel-group-resize-handle--before::after {
  top: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group-resize-handle--before::before {
  top: calc(var(--game-side-panel-resize-line-inset) + 1px);
  background-image:
    linear-gradient(to bottom right, transparent 42%, currentColor 42%, currentColor 58%, transparent 58%),
    linear-gradient(to bottom left, transparent 42%, currentColor 42%, currentColor 58%, transparent 58%);
  background-position: left top, right top;
}

.game-side-panel-group-resize-handle--after::after {
  bottom: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group-resize-handle--after::before {
  bottom: calc(var(--game-side-panel-resize-line-inset) + 1px);
  background-image:
    linear-gradient(to top right, transparent 42%, currentColor 42%, currentColor 58%, transparent 58%),
    linear-gradient(to top left, transparent 42%, currentColor 42%, currentColor 58%, transparent 58%);
  background-position: left top, right top;
}

.game-side-panel-group-resize-handle:hover::after,
.game-side-panel-group--resizing-before .game-side-panel-group-resize-handle--before::after,
.game-side-panel-group--resizing-after .game-side-panel-group-resize-handle--after::after {
  opacity: 0.42;
}

.game-side-panel-group--stretch-bottom .game-side-panel-group-resize-handle--after:hover::before,
.game-side-panel-group--stretch-top-bottom .game-side-panel-group-resize-handle--after:hover::before {
  opacity: 0.42;
}

.game-side-panel-group--stretch-top .game-side-panel-group-resize-handle--before:hover::before,
.game-side-panel-group--stretch-top-bottom .game-side-panel-group-resize-handle--before:hover::before {
  opacity: 0.42;
}

.game-side-panel-group-content > :deep(.game-panel)::after,
.game-side-panel-group-content > :deep(.record-panel)::after {
  position: absolute;
  top: var(--game-side-panel-resize-line-end-inset);
  bottom: var(--game-side-panel-resize-line-end-inset);
  width: var(--game-side-panel-resize-line-size);
  background: currentColor;
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}

.game-side-panel-group--left .game-side-panel-group-content > :deep(.game-panel)::after,
.game-side-panel-group--left .game-side-panel-group-content > :deep(.record-panel)::after {
  right: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group--right .game-side-panel-group-content > :deep(.game-panel)::after,
.game-side-panel-group--right .game-side-panel-group-content > :deep(.record-panel)::after {
  left: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-group:has(.game-side-panel-group-width-resize-handle:hover) .game-side-panel-group-content > :deep(.game-panel)::after,
.game-side-panel-group:has(.game-side-panel-group-width-resize-handle:hover) .game-side-panel-group-content > :deep(.record-panel)::after,
.game-side-panel-group--resizing-width .game-side-panel-group-content > :deep(.game-panel)::after,
.game-side-panel-group--resizing-width .game-side-panel-group-content > :deep(.record-panel)::after {
  opacity: 0.42;
}

.game-side-panel-group-width-resize-handle {
  position: absolute;
  z-index: var(--z-ui-handle);
  top: 0;
  bottom: 0;
  width: var(--game-side-panel-resize-hit-size);
  cursor: ew-resize;
  touch-action: none;
}

.game-side-panel-group--left .game-side-panel-group-width-resize-handle {
  right: 0;
}

.game-side-panel-group--right .game-side-panel-group-width-resize-handle {
  left: 0;
}
</style>
