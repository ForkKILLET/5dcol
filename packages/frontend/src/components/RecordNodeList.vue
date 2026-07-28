<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { GameRecordRow } from '@engine/game'
import type { RecordDisplayBlockNode, RecordDisplayNode } from '../engine/recordDisplayTree'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

defineOptions({ name: 'RecordNodeList' })

const props = defineProps<{
  nodes: RecordDisplayNode[]
  activeBranchLineId: number | null
  collapsedBranchLineIds: ReadonlySet<number>
}>()

const emit = defineEmits<{
  beforeEnter: [element: Element]
  enter: [element: Element]
  beforeLeave: [element: Element]
  toggleBranchMenu: [recordLineId: number]
  toggleBranchCollapsed: [recordLineId: number]
}>()

defineSlots<{
  row(props: { row: GameRecordRow }): unknown
}>()

const { t } = useI18n({ useScope: 'global' })

function getNodeClasses(node: RecordDisplayNode) {
  return {
    'record-node--row': node.kind === 'row',
    'record-node--cursor': node.kind === 'row' && node.row.kind === 'cursor',
    'record-node--block': node.kind === 'block',
    [`record-node--block-${node.kind === 'block' ? node.blockKind : 'none'}`]: node.kind === 'block',
  }
}

function isBranchBlock(node: RecordDisplayNode): node is RecordDisplayBlockNode & { recordLineId: number } {
  return node.kind === 'block'
    && node.blockKind === 'branch'
    && node.recordLineId !== undefined
}

function isBranchMenuOpen(node: RecordDisplayNode): boolean {
  return isBranchBlock(node) && props.activeBranchLineId === node.recordLineId
}

function isBranchCollapsed(node: RecordDisplayNode): boolean {
  return isBranchBlock(node) && props.collapsedBranchLineIds.has(node.recordLineId)
}

function shouldShowBranchToolbar(node: RecordDisplayNode): boolean {
  return isBranchBlock(node) && (isBranchMenuOpen(node) || isBranchCollapsed(node))
}

function toggleBranchMenu(node: RecordDisplayNode) {
  if (isBranchBlock(node)) emit('toggleBranchMenu', node.recordLineId)
}

function toggleBranchCollapsed(node: RecordDisplayNode) {
  if (isBranchBlock(node)) emit('toggleBranchCollapsed', node.recordLineId)
}

function closeBranchMenu(node: RecordDisplayNode) {
  if (isBranchMenuOpen(node) && isBranchBlock(node)) emit('toggleBranchMenu', node.recordLineId)
}

function getBranchActionCount(node: RecordDisplayBlockNode): number {
  return node.children.filter(child => (
    child.kind === 'row'
    && child.row.kind === 'action'
    && child.row.recordLineId === node.recordLineId
  )).length
}

function branchContainsCurrentCursor(node: RecordDisplayBlockNode): boolean {
  return node.children.some(child => {
    if (child.kind === 'row') return child.row.kind === 'cursor' && child.row.current === true
    return branchContainsCurrentCursor(child)
  })
}

function setBranchTransitionHeight(element: Element) {
  if (! (element instanceof HTMLElement)) return

  const previousHeight = element.style.height
  element.style.height = 'auto'
  const height = element.getBoundingClientRect().height
  element.style.height = previousHeight
  element.style.setProperty('--record-branch-transition-height', `${Math.max(0, height)}px`)
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
      :data-record-branch-line-id="isBranchBlock(node) ? node.recordLineId : undefined"
    >
      <slot
        v-if="node.kind === 'row'"
        name="row"
        :row="node.row"
      />
      <template v-else>
        <button
          v-if="isBranchBlock(node)"
          class="record-branch-rail"
          :class="{ 'record-branch-rail--active': isBranchMenuOpen(node) }"
          type="button"
          :title="t('record.branchActions')"
          :aria-label="t('record.branchActions')"
          :aria-expanded="isBranchMenuOpen(node)"
          @click.stop="toggleBranchMenu(node)"
          @keydown.esc.prevent.stop="closeBranchMenu(node)"
        />
        <Transition
          name="record-branch-toolbar-transition"
          @before-enter="setBranchTransitionHeight"
          @enter="setBranchTransitionHeight"
          @before-leave="setBranchTransitionHeight"
        >
          <div
            v-if="shouldShowBranchToolbar(node)"
            class="record-branch-toolbar"
            :data-current-record-cursor="isBranchCollapsed(node) && branchContainsCurrentCursor(node) ? 'true' : undefined"
            @keydown.esc.prevent.stop="closeBranchMenu(node)"
          >
            <span class="record-branch-toolbar-label">
              <GameIcon name="branch" />
              <span>{{ t('record.branchSummary', { actions: getBranchActionCount(node) }) }}</span>
              <span
                v-if="branchContainsCurrentCursor(node)"
                class="record-branch-current"
                :title="t('record.currentAction')"
                :aria-label="t('record.currentAction')"
              >
                <GameIcon name="current" />
              </span>
            </span>
            <GameButton
              size="tiny"
              shape="circle"
              :pressed-indicator="false"
              :title="t(isBranchCollapsed(node) ? 'record.expandBranch' : 'record.collapseBranch')"
              :aria-label="t(isBranchCollapsed(node) ? 'record.expandBranch' : 'record.collapseBranch')"
              @click.stop="toggleBranchCollapsed(node)"
            >
              <GameIcon :name="isBranchCollapsed(node) ? 'chevron-down' : 'chevron-up'" />
            </GameButton>
          </div>
        </Transition>
        <Transition
          name="record-branch-content-transition"
          @before-enter="setBranchTransitionHeight"
          @enter="setBranchTransitionHeight"
          @before-leave="setBranchTransitionHeight"
        >
          <RecordNodeList
            v-if="!isBranchCollapsed(node)"
            :nodes="node.children"
            :active-branch-line-id="activeBranchLineId"
            :collapsed-branch-line-ids="collapsedBranchLineIds"
            @before-enter="emit('beforeEnter', $event)"
            @enter="emit('enter', $event)"
            @before-leave="emit('beforeLeave', $event)"
            @toggle-branch-menu="emit('toggleBranchMenu', $event)"
            @toggle-branch-collapsed="emit('toggleBranchCollapsed', $event)"
          >
            <template #row="{ row }">
              <slot
                name="row"
                :row="row"
              />
            </template>
          </RecordNodeList>
        </Transition>
      </template>
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

.record-branch-rail {
  position: absolute;
  z-index: var(--z-content-base);
  top: 0;
  bottom: 0;
  left: calc((var(--record-block-border-width) - var(--record-branch-rail-hit-width)) / 2);
  width: var(--record-branch-rail-hit-width);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.record-branch-rail::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: calc(var(--record-block-border-width) + 2px);
  border-radius: calc((var(--record-block-border-width) + 2px) / 2);
  background: var(--main-arrow-fill-color);
  content: "";
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 140ms ease;
}

.record-branch-rail:hover::before,
.record-branch-rail:focus-visible::before,
.record-branch-rail--active::before {
  opacity: 1;
}

.record-branch-toolbar {
  position: relative;
  z-index: var(--z-content-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--button-content-gap);
  box-sizing: border-box;
  min-width: var(--record-action-min-width);
  color: var(--main-arrow-fill-color);
}

.record-branch-toolbar-label {
  --button-icon-size: var(--button-tiny-icon-size);

  display: inline-flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.55);
  min-width: 0;
  font-size: var(--button-tiny-font-size);
  line-height: 1;
  white-space: nowrap;
}

.record-branch-current {
  --button-icon-size: var(--button-tiny-icon-size);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--button-tiny-height);
  height: var(--button-tiny-height);
  color: var(--main-arrow-fill-color);
}

.record-branch-toolbar-transition-enter-active,
.record-branch-toolbar-transition-leave-active,
.record-branch-content-transition-enter-active,
.record-branch-content-transition-leave-active {
  height: var(--record-branch-transition-height);
  overflow: hidden;
  transition:
    height 240ms ease,
    opacity 180ms ease,
    transform 240ms ease;
}

.record-branch-toolbar-transition-enter-from,
.record-branch-toolbar-transition-leave-to,
.record-branch-content-transition-enter-from,
.record-branch-content-transition-leave-to {
  height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.record-branch-toolbar-transition-enter-to,
.record-branch-toolbar-transition-leave-from,
.record-branch-content-transition-enter-to,
.record-branch-content-transition-leave-from {
  height: var(--record-branch-transition-height);
  opacity: 1;
  transform: translateY(0);
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
  pointer-events: none;
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
  transition: opacity 320ms ease;
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
