<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  GameRecordAction,
  GameRecordCursor,
  GameRecordMoveSegment,
  GameRecordRow,
  GameToolbarButton,
} from '@engine/game'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

interface RecordRowSection {
  id: string
  kind: 'record' | 'deduction' | 'pending' | 'branch'
  depth: number
  key: string
  rows: GameRecordRow[]
}

const props = defineProps<{
  recordText: string
  rows: GameRecordRow[]
  actionButtons: GameToolbarButton[]
  hasPendingMoves: boolean
  online: boolean
  onlineSpectator: boolean
  deductionStartActionIndex: number | null
}>()

const emit = defineEmits<{
  toolbarButtonClick: [button: GameToolbarButton]
  focusSegment: [segment: GameRecordMoveSegment]
  rollbackCursor: [cursor: GameRecordCursor]
  deleteFuture: [cursor: GameRecordCursor]
}>()

const { t } = useI18n({ useScope: 'global' })

const recordHeaders = computed(() => (
  props.recordText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('['))
))

const recordSections = computed(() => {
  const sections: RecordRowSection[] = []
  for (const row of props.rows) {
    const kind = getRecordSectionKind(row)
    const depth = getRecordSectionDepth(row)
    const key = getRecordSectionKey(row)
    const last = sections.at(-1)
    if (last && last.kind === kind && last.depth === depth && last.key === key) {
      last.rows.push(row)
      continue
    }
    sections.push({
      id: `${kind}-${depth}-${sections.length}-${getRecordRowKey(row)}`,
      kind,
      depth,
      key,
      rows: [row],
    })
  }
  return sections
})

function getButtonText(button: GameToolbarButton): string {
  return t(button.labelKey, button.labelParams)
}

function isRecordActionRow(row: GameRecordRow): row is GameRecordAction {
  return row.kind === 'action'
}

function isRecordCursorRow(row: GameRecordRow): row is GameRecordCursor {
  return row.kind === 'cursor'
}

function isCurrentRecordRow(row: GameRecordRow) {
  return isRecordCursorRow(row) && row.current === true
}

function canJumpToRecordCursor(cursor: GameRecordCursor) {
  return ! props.online && ! isCurrentRecordRow(cursor)
}

function canDeleteRecordFutureAtCursor(cursor: GameRecordCursor) {
  return ! props.online
    && ! props.hasPendingMoves
    && cursor.hasFuture === true
}

function hasHoverRecordCursorIcon(cursor: GameRecordCursor) {
  return canDeleteRecordFutureAtCursor(cursor)
    || canJumpToRecordCursor(cursor)
}

function getRecordSectionKind(row: GameRecordRow): RecordRowSection['kind'] {
  if (isRecordCursorRow(row)) return row.branchDepth > 0 ? 'branch' : 'record'
  if (row.pending) return 'pending'
  if ((row.branchDepth ?? 0) > 0) return 'branch'
  return isRecordDeductionAction(row) ? 'deduction' : 'record'
}

function getRecordSectionDepth(row: GameRecordRow) {
  const depth = row.branchDepth ?? 0
  return Math.max(0, depth - 1)
}

function getRecordSectionKey(row: GameRecordRow) {
  if (isRecordCursorRow(row)) return row.branchDepth > 0 ? `branch:${row.recordLineId}` : 'record'
  if ((row.branchDepth ?? 0) > 0) return `branch:${row.recordLineId ?? row.recordKey ?? row.index}`
  if (row.pending) return `pending:${row.recordLineId ?? 'root'}`
  if (isRecordDeductionAction(row)) return 'deduction'
  return 'record'
}

function isRecordDeductionAction(action: GameRecordAction) {
  return (
    ! action.pending
    && props.onlineSpectator
    && props.deductionStartActionIndex !== null
    && action.index >= props.deductionStartActionIndex
  )
}

function getRecordRowKey(row: GameRecordRow) {
  if (isRecordCursorRow(row)) return row.recordKey
  return row.recordKey ?? `${row.serial}-${row.index}`
}

function getRecordRowClasses(row: GameRecordRow) {
  const isCursor = isRecordCursorRow(row)
  return {
    'record-row--black': isRecordActionRow(row) && row.player === 'b',
    'record-row--white': isRecordActionRow(row) && row.player !== 'b',
    'record-row--cursor': isCursor,
    'record-row--cursor-current': isCursor && isCurrentRecordRow(row),
    'record-row--cursor-interactive': isCursor && hasHoverRecordCursorIcon(row),
  }
}
</script>

<template>
  <aside
    class="record-panel"
    @wheel.stop
  >
    <div class="record-header-bar">
      <h2 class="record-title">{{ t('record.title') }}</h2>
      <div class="record-header-actions">
        <GameButton
          v-for="button in actionButtons"
          :key="button.id"
          size="tiny"
          :disabled="button.disabled"
          :pulsing="button.effect === 'pulse'"
          @click="emit('toolbarButtonClick', button)"
        >
          <span>{{ getButtonText(button) }}</span>
        </GameButton>
      </div>
    </div>
    <div class="record-content">
      <div
        v-if="recordHeaders.length > 0"
        class="record-headers"
      >
        <div
          v-for="header in recordHeaders"
          :key="header"
          class="record-header"
        >
          {{ header }}
        </div>
      </div>
      <div
        v-if="rows.length > 0"
        class="record-table"
      >
        <div
          v-for="section in recordSections"
          :key="section.id"
          class="record-section"
          :class="{
            'record-section--branch': section.kind === 'branch',
            'record-section--deduction': section.kind === 'deduction',
            'record-section--pending': section.kind === 'pending',
            'record-section--plain': section.kind === 'record',
          }"
          :style="{ '--record-section-indent': `calc(var(--button-content-gap) * ${section.depth * 2.4})` }"
        >
          <div
            v-for="row in section.rows"
            :key="getRecordRowKey(row)"
            class="record-row"
            :class="getRecordRowClasses(row)"
          >
            <template v-if="isRecordActionRow(row)">
              <span class="record-serial">{{ row.serial }}</span>
              <span class="record-action">
                <span
                  v-if="row.clock"
                  class="record-clock"
                >
                  {{ t('record.clock', {
                    elapsed: row.clock.elapsed,
                    total: row.clock.total,
                  }) }}
                </span>
                <span
                  v-for="(move, moveIndex) in row.moves"
                  :key="`${row.serial}-${moveIndex}`"
                  class="record-move"
                >
                  <button
                    v-for="(segment, segmentIndex) in move.segments"
                    :key="`${row.serial}-${moveIndex}-${segmentIndex}`"
                    class="record-segment"
                    type="button"
                    @click.stop="emit('focusSegment', segment)"
                  >
                    {{ segment.text }}
                  </button>
                </span>
              </span>
            </template>
            <template v-else-if="isRecordCursorRow(row)">
              <span class="record-cursor-guide" />
              <span class="record-action-icons">
                <button
                  v-if="canDeleteRecordFutureAtCursor(row)"
                  class="record-action-icon record-action-icon--delete-future record-action-icon--side-action"
                  type="button"
                  :title="t('record.deleteFuture')"
                  :aria-label="t('record.deleteFuture')"
                  @click.stop="emit('deleteFuture', row)"
                >
                  <GameIcon name="delete-future" />
                </button>
                <span
                  v-if="isCurrentRecordRow(row)"
                  class="record-action-icon record-action-icon--current"
                  :title="t('record.currentAction')"
                  :aria-label="t('record.currentAction')"
                >
                  <GameIcon name="current" />
                </span>
                <button
                  v-else-if="canJumpToRecordCursor(row)"
                  class="record-action-icon record-action-icon--jump"
                  type="button"
                  :title="t('record.jumpToAction')"
                  :aria-label="t('record.jumpToAction')"
                  @click.stop="emit('rollbackCursor', row)"
                >
                  <GameIcon name="jump" />
                </button>
              </span>
            </template>
          </div>
        </div>
      </div>
      <div
        v-else
        class="record-empty"
      >
        {{ t('record.empty') }}
      </div>
    </div>
  </aside>
</template>

<style scoped>
.record-panel {
  position: absolute;
  top: var(--button-top);
  right: var(--button-top);
  bottom: calc(var(--button-top) + var(--button-height) + var(--button-shadow-offset) + var(--button-content-gap) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 2);
  width: min(var(--record-panel-width), calc(100vw - var(--button-top) * 2));
  padding: calc(var(--button-content-gap) * 3);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  pointer-events: auto;
}

.record-header-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 1.5);
}

.record-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--button-text-color);
  font-size: var(--button-font-size);
  font-weight: 400;
  line-height: 1;
}

.record-header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: calc(var(--button-content-gap) * 0.75);
}

.record-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0;
  color: var(--button-text-color);
  font: 18px/1.35 var(--latin-serif-font);
}

.record-headers {
  margin-bottom: calc(var(--button-content-gap) * 2);
  font: 15px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  opacity: 0.75;
}

.record-header {
  white-space: pre-wrap;
  word-break: break-word;
}

.record-table {
  --record-section-padding-left: calc(var(--button-content-gap) * 1.35);
  --record-row-inline-padding: var(--button-content-gap);
  --record-guide-start-offset: var(--record-row-inline-padding);

  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.72);
}

.record-section--plain {
  display: contents;
}

.record-section--branch,
.record-section--deduction,
.record-section--pending {
  --record-guide-start-offset: calc(
    var(--record-section-padding-left)
    + var(--record-row-inline-padding)
    + var(--record-block-border-width)
  );

  box-sizing: border-box;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.72);
  margin: calc(var(--button-content-gap) * 0.16) 0 calc(var(--button-content-gap) * 0.16) var(--record-section-indent, 0px);
  padding-left: var(--record-section-padding-left);
  border-left: var(--record-block-border-width) solid;
}

.record-section--branch,
.record-section--deduction {
  border-left-color: var(--main-arrow-fill-color);
}

.record-section--pending {
  border-left-color: rgb(220 206 96);
}

.record-section--branch {
  margin-top: calc(var(--button-content-gap) * 0.5);
}

.record-row {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: baseline;
  padding: 2px var(--button-content-gap);
  border-radius: 8px;
  cursor: default;
}

.record-row--white {
  grid-column: 1 / 3;
  background: var(--record-white-bg);
  color: var(--record-white-text);
}

.record-row--black {
  grid-column: 1 / 3;
  background: var(--record-black-bg);
  color: var(--record-black-text);
}

.record-row--cursor {
  --record-cursor-size: calc(var(--button-icon-size) * 0.85);
  --record-cursor-tip-size: calc(var(--record-cursor-size) * 0.42);
  --record-cursor-tag-padding-y: calc(var(--record-cursor-size) * 0.12);
  --record-cursor-tag-offset: calc(var(--button-content-gap) * 0.62);
  --record-cursor-tag-bg: var(--button-text-color);
  --record-cursor-tag-fg: var(--button-fill-color);
  --record-cursor-tag-height: calc(var(--record-cursor-size) + var(--record-cursor-tag-padding-y) * 2);

  grid-template-columns: minmax(0, 1fr) max-content;
  height: var(--record-cursor-tag-height);
  align-items: center;
  column-gap: var(--button-content-gap);
  min-height: 0;
  margin-block: calc(var(--record-cursor-tag-height) * -0.5);
  padding-block: 0;
  overflow: visible;
  color: var(--button-text-color);
  pointer-events: none;
  z-index: 2;
}

.record-row--cursor-interactive:hover,
.record-row--cursor-interactive:focus-within {
  z-index: 4;
}

.record-serial {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.78;
}

.record-action {
  display: grid;
  row-gap: calc(var(--button-content-gap) * 0.35);
  min-width: 0;
}

.record-cursor-guide {
  grid-column: 1;
  position: relative;
  align-self: center;
  height: calc(var(--record-cursor-tag-height) * 0.72);
  margin-left: calc(var(--record-guide-start-offset) * -1);
  margin-right: calc(-1 * (var(--button-content-gap) + var(--record-cursor-tag-offset) + 1px));
  pointer-events: auto;
}

.record-cursor-guide::before {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 2px;
  margin-top: -1px;
  background: var(--record-cursor-tag-bg);
  content: "";
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left center;
  transition:
    opacity 240ms ease,
    transform 240ms ease;
}

.record-action-icons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  align-self: center;
  min-width: 0;
}

.record-row--cursor .record-action-icons {
  grid-column: 2;
  position: relative;
  isolation: isolate;
  min-height: var(--record-cursor-size);
  padding: var(--record-cursor-tag-padding-y)
    calc(var(--record-cursor-size) * 0.22)
    var(--record-cursor-tag-padding-y)
    calc(var(--record-cursor-tip-size) + var(--record-cursor-size) * 0.14);
  color: var(--record-cursor-tag-fg);
  pointer-events: auto;
  transform: translateX(var(--record-cursor-tag-offset));
}

.record-row--cursor .record-action-icons::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: var(--record-cursor-tag-bg);
  clip-path: polygon(
    0 50%,
    var(--record-cursor-tip-size) 0,
    100% 0,
    100% 100%,
    var(--record-cursor-tip-size) 100%
  );
  content: "";
  opacity: 0;
  transform: scaleX(0);
  transform-origin: right center;
  transition:
    opacity 240ms ease,
    transform 240ms ease;
}

.record-row--cursor-current .record-cursor-guide::before,
.record-row--cursor-interactive:hover .record-cursor-guide::before,
.record-row--cursor-interactive:focus-within .record-cursor-guide::before {
  opacity: 1;
  transform: scaleX(1);
}

.record-row--cursor-current .record-action-icons::before,
.record-row--cursor-interactive:hover .record-action-icons::before,
.record-row--cursor-interactive:focus-within .record-action-icons::before {
  opacity: 1;
  transform: scaleX(1);
}

.record-action-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: calc(var(--button-icon-size) * 0.85);
  height: calc(var(--button-icon-size) * 0.85);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}

.record-action-icon--current {
  opacity: 0.82;
}

.record-action-icon--delete-future,
.record-action-icon--jump {
  width: 0;
  margin-right: 0;
  overflow: hidden;
  opacity: 0;
  cursor: pointer;
  pointer-events: none;
  transition:
    width 120ms ease,
    margin-right 120ms ease,
    opacity 120ms ease;
}

.record-row:hover .record-action-icon--delete-future,
.record-row:focus-within .record-action-icon--delete-future,
.record-row--cursor-current .record-action-icons:hover .record-action-icon--delete-future,
.record-row:hover .record-action-icon--jump,
.record-row:focus-within .record-action-icon--jump {
  width: calc(var(--button-icon-size) * 0.85);
  opacity: 0.72;
  pointer-events: auto;
}

.record-row:hover .record-action-icon--side-action,
.record-row:focus-within .record-action-icon--side-action,
.record-row--cursor-current .record-action-icons:hover .record-action-icon--side-action {
  margin-right: calc(var(--button-content-gap) * 0.38);
}

.record-action-icon--delete-future:hover,
.record-action-icon--delete-future:focus-visible,
.record-action-icon--jump:hover,
.record-action-icon--jump:focus-visible {
  opacity: 1;
  outline: none;
}

.record-clock {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.68;
  white-space: nowrap;
}

.record-move {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.5);
  white-space: pre-wrap;
  word-break: break-word;
}

.record-segment {
  margin: 0;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.record-segment:hover,
.record-segment:focus-visible {
  border-color: currentColor;
  outline: none;
}

.record-empty {
  opacity: 0.72;
}
</style>
