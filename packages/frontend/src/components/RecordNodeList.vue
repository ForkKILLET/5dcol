<script setup lang="ts">
import type { GameRecordRow } from '@engine/game'
import type { RecordDisplayNode } from '../engine/recordDisplayTree'

defineOptions({ name: 'RecordNodeList' })

defineProps<{
  nodes: RecordDisplayNode[]
}>()

const emit = defineEmits<{
  beforeEnter: [element: Element]
  enter: [element: Element]
  beforeLeave: [element: Element]
}>()

defineSlots<{
  row(props: { row: GameRecordRow }): unknown
}>()

function getNodeClasses(node: RecordDisplayNode) {
  return {
    'record-node--row': node.kind === 'row',
    'record-node--cursor': node.kind === 'row' && node.row.kind === 'cursor',
    'record-node--block': node.kind === 'block',
    [`record-node--block-${node.kind === 'block' ? node.blockKind : 'none'}`]: node.kind === 'block',
  }
}
</script>

<template>
  <TransitionGroup
    name="record-node-transition"
    tag="div"
    class="record-node-list"
    @before-enter="emit('beforeEnter', $event)"
    @enter="emit('enter', $event)"
    @before-leave="emit('beforeLeave', $event)"
  >
    <div
      v-for="node in nodes"
      :key="node.key"
      class="record-node"
      :class="getNodeClasses(node)"
      :data-record-node-key="node.key"
    >
      <slot
        v-if="node.kind === 'row'"
        name="row"
        :row="node.row"
      />
      <RecordNodeList
        v-else
        :nodes="node.children"
        @before-enter="emit('beforeEnter', $event)"
        @enter="emit('enter', $event)"
        @before-leave="emit('beforeLeave', $event)"
      >
        <template #row="{ row }">
          <slot
            name="row"
            :row="row"
          />
        </template>
      </RecordNodeList>
    </div>
  </TransitionGroup>
</template>

<style scoped>
.record-node-list {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: var(--record-action-min-width);
  width: max-content;
}

.record-node {
  position: relative;
  box-sizing: border-box;
  min-width: var(--record-action-min-width);
  transition: padding-left 420ms ease;
}

.record-node--row {
  display: block;
}

.record-node:not(:first-child):not(.record-node--cursor) {
  margin-top: var(--record-table-row-gap);
}

.record-node--cursor {
  z-index: var(--z-content-panel);
  width: var(--record-cursor-fixed-width);
  min-width: var(--record-cursor-fixed-width);
  height: 0;
  overflow: visible;
}

.record-node--cursor:hover,
.record-node--cursor:focus-within {
  z-index: var(--z-content-hover);
}

.record-node--cursor :deep(.record-row--cursor) {
  margin-block: 0;
  transform: translateY(calc(
    var(--record-table-row-gap) * 0.5
    - var(--record-cursor-tag-height) * 0.5
  ));
}

.record-node--block {
  --record-block-line-color: var(--main-arrow-fill-color);
  --record-guide-start-offset: var(--record-section-padding-left);

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: max-content;
  padding-left: var(--record-section-padding-left);
}

.record-node::before {
  position: absolute;
  z-index: var(--z-content-front);
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--record-block-border-width);
  border-radius: calc(var(--record-block-border-width) / 2);
  background: var(--record-block-line-color, transparent);
  content: "";
  opacity: 0;
  transition:
    background-color 420ms ease,
    opacity 320ms ease;
}

.record-node--block::before {
  opacity: 1;
}

.record-node--block-branch::before,
.record-node--block-deduction::before {
  top: 0;
}

.record-node--block > .record-node-list {
  min-width: var(--record-action-min-width);
}

.record-node--block-pending {
  --record-block-line-color: rgb(220 206 96);
}

.record-table--pending-submit-branch .record-node--block-pending.record-node-transition-leave-to {
  --record-block-line-color: var(--main-arrow-fill-color);
}

.record-table--pending-undo .record-node--block-pending.record-node-transition-leave-active {
  position: absolute;
  z-index: var(--z-content-base);
  width: max-content;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.record-node-transition-move:not(.record-node--cursor) {
  transition: transform 320ms ease;
}

.record-node-transition-enter-active,
.record-node-transition-leave-active {
  min-height: 0;
  transition:
    height 320ms ease,
    opacity 240ms ease,
    transform 320ms ease,
    padding-top 320ms ease,
    padding-bottom 320ms ease,
    margin-top 320ms ease;
}

.record-node-transition-enter-active:not(.record-node--cursor),
.record-node-transition-leave-active:not(.record-node--cursor) {
  overflow: hidden;
}

.record-node-transition-enter-active.record-node--block,
.record-node-transition-leave-active.record-node--block {
  overflow: visible;
}

.record-node-transition-enter-active.record-node--block-pending,
.record-node-transition-leave-active.record-node--block-pending {
  overflow: hidden;
}

.record-node-transition-enter-active.record-node--cursor,
.record-node-transition-leave-active.record-node--cursor {
  height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  overflow: visible;
  transition: opacity 240ms ease;
}

.record-node-transition-enter-from,
.record-node-transition-leave-to {
  height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  opacity: 0;
}

.record-node-transition-enter-from:not(.record-node--cursor),
.record-node-transition-leave-to:not(.record-node--cursor) {
  transform: translateY(-6px);
}

.record-node-transition-enter-from.record-node--block-pending,
.record-node-transition-leave-to.record-node--block-pending {
  transform: translateY(0);
}

.record-node-transition-enter-from:not(:first-child):not(.record-node--cursor) {
  margin-top: var(--record-table-row-gap);
}

.record-node-transition-leave-to:not(:first-child):not(.record-node--cursor) {
  margin-top: 0;
}

.record-node-transition-enter-to,
.record-node-transition-leave-from {
  height: var(--record-node-transition-height);
  opacity: 1;
}

.record-node-transition-enter-to.record-node--cursor,
.record-node-transition-leave-from.record-node--cursor {
  height: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
}

.record-node-transition-enter-to:not(:first-child):not(.record-node--cursor),
.record-node-transition-leave-from:not(:first-child):not(.record-node--cursor) {
  margin-top: var(--record-table-row-gap);
}

.record-node-transition-enter-to:not(.record-node--cursor),
.record-node-transition-leave-from:not(.record-node--cursor) {
  transform: translateY(0);
}

.record-node-transition-enter-from.record-node--cursor :deep(.record-cursor-guide)::before,
.record-node-transition-leave-to.record-node--cursor :deep(.record-cursor-guide)::before,
.record-node-transition-enter-from.record-node--cursor :deep(.record-action-icons)::after,
.record-node-transition-leave-to.record-node--cursor :deep(.record-action-icons)::after {
  opacity: 0;
  transform: scaleX(0);
}

.record-node-transition-enter-from.record-node--cursor :deep(.record-action-icons)::before,
.record-node-transition-leave-to.record-node--cursor :deep(.record-action-icons)::before {
  opacity: 0;
  transform: translate(var(--record-cursor-tag-shadow-offset), var(--record-cursor-tag-shadow-offset)) scaleX(0);
}
</style>
