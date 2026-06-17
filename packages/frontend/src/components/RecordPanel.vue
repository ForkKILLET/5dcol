<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  GameRecordAction,
  GameRecordCursor,
  GameRecordMoveSegment,
  GameRecordRow,
  GameToolbarButton,
} from '@engine/game'
import type { GameRecordMove } from '@engine/record'
import {
  BUILT_IN_RECORD_GLYPH_TEMPLATES,
  RECORD_GLYPH_DEFAULT_COLOR,
  RECORD_GLYPH_TEXT_COLOR,
  getRecordGlyphColor,
  normalizeCustomRecordGlyphTemplate,
  normalizeRecordGlyphColor,
  normalizeRecordGlyphText,
  type CustomRecordGlyphTemplate,
  type RecordGlyphTemplate,
  uniqueRecordGlyphTemplates,
} from '@engine/recordGlyph'
import { DEFAULT_RECORD_MARKER_AUTHOR_ID, getRecordMarkerAuthorColor } from '@engine/recordMarker'
import GameButton from './GameButton.vue'
import GameColorInput from './GameColorInput.vue'
import GameIcon from './GameIcon.vue'
import GameTextInput from './GameTextInput.vue'
import GameToggle from './GameToggle.vue'

interface RecordRowSection {
  id: string
  kind: 'record' | 'deduction' | 'pending' | 'branch'
  depth: number
  key: string
  rows: GameRecordRow[]
}


export interface RecordFocusedMove {
  recordLineId: number
  recordActionIndex: number
  moveIndex: number
  segmentIndex: number
  pulseId: number
}

type RecordAnnotationEditor =
  | {
    kind: 'comment'
    recordKey: string
    recordLineId: number
    recordActionIndex: number
    commentIndex: number
    text: string
  }
  | {
    kind: 'glyph'
    recordKey: string
    recordLineId: number
    recordActionIndex: number
    moveIndex: number
    text: string
  }

const props = defineProps<{
  recordText: string
  rows: GameRecordRow[]
  actionButtons: GameToolbarButton[]
  hasPendingMoves: boolean
  online: boolean
  onlineSpectator: boolean
  deductionStartActionIndex: number | null
  focusedMove: RecordFocusedMove | null
  customGlyphTemplates: CustomRecordGlyphTemplate[]
}>()

const emit = defineEmits<{
  toolbarButtonClick: [button: GameToolbarButton]
  focusSegment: [segment: GameRecordMoveSegment]
  rollbackCursor: [cursor: GameRecordCursor]
  deleteFuture: [cursor: GameRecordCursor]
  replaceActionComments: [payload: {
    recordLineId: number
    recordActionIndex: number
    position: 'after'
    texts: string[]
  }]
  replaceMoveGlyphs: [payload: {
    recordLineId: number
    recordActionIndex: number
    moveIndex: number
    glyphs: string[]
  }]
  resizePanel: [width: number]
  updateCustomGlyphTemplates: [templates: CustomRecordGlyphTemplate[]]
  uiSound: []
}>()

const { t } = useI18n({ useScope: 'global' })
const recordContent = ref<HTMLElement | null>(null)
const annotationEditor = ref<RecordAnnotationEditor | null>(null)
const showRecordClock = ref(true)
const showRecordComments = ref(true)
const showRecordGlyphs = ref(true)
const customGlyphDraft = ref<CustomRecordGlyphTemplate | null>(null)
const editingCustomGlyphKey = ref<string | null>(null)
const customGlyphTemplates = computed({
  get: () => props.customGlyphTemplates,
  set: value => emit('updateCustomGlyphTemplates', uniqueRecordGlyphTemplates(value)),
})
let stopPanelResizeListeners: (() => void) | null = null
let resizeFrame: number | null = null
let pendingResizeWidth: number | null = null

const currentCursorKey = computed(() => (
  props.rows.find(row => isCurrentRecordRow(row))?.recordKey ?? ''
))
const focusedMoveKey = computed(() => (
  props.focusedMove
    ? `${getCursorPresenceKey(props.focusedMove.recordLineId, props.focusedMove.recordActionIndex)}:${props.focusedMove.moveIndex}:${props.focusedMove.segmentIndex}:${props.focusedMove.pulseId}`
    : ''
))
const recordGlyphTemplates = computed<RecordGlyphTemplate[]>(() => [
  ...BUILT_IN_RECORD_GLYPH_TEMPLATES,
  ...customGlyphTemplates.value.map(template => ({
    glyph: template.glyph,
    color: template.color,
    builtIn: false,
  })),
])
const customGlyphDraftText = computed({
  get: () => customGlyphDraft.value?.glyph ?? '',
  set: (value: string) => {
    const draft = customGlyphDraft.value
    if (! draft) return

    syncCustomGlyphTemplateDraft({
      glyph: normalizeRecordGlyphText(value),
      color: draft.color,
    })
  },
})
const customGlyphDraftColor = computed({
  get: () => customGlyphDraft.value?.color ?? RECORD_GLYPH_DEFAULT_COLOR,
  set: (value: string) => {
    const draft = customGlyphDraft.value
    if (! draft) return

    syncCustomGlyphTemplateDraft({
      glyph: draft.glyph,
      color: normalizeRecordGlyphColor(value),
    })
  },
})
watch(currentCursorKey, async () => {
  await nextTick()
  scrollCurrentCursorIntoView()
}, { immediate: true })

watch(focusedMoveKey, async () => {
  await nextTick()
  scrollFocusedMoveIntoView()
}, { immediate: true })

const recordHeaders = computed(() => (
  props.recordText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('[') && ! line.startsWith('[5DStudy_'))
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

function getCursorPresenceKey(recordLineId: number, recordActionIndex: number): string {
  return `${recordLineId}:${recordActionIndex}`
}

function startPanelResize(event: PointerEvent) {
  if (event.button !== 0) return

  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  const pointerId = event.pointerId
  const panel = handle.closest('.record-panel')
  const startClientX = event.clientX
  const startWidth = panel
    ? Number.parseFloat(window.getComputedStyle(panel).width)
    : 0

  const flush = () => {
    resizeFrame = null
    if (pendingResizeWidth === null) return
    emit('resizePanel', pendingResizeWidth)
  }
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    pendingResizeWidth = startWidth + startClientX - moveEvent.clientX
    if (resizeFrame === null) {
      resizeFrame = window.requestAnimationFrame(flush)
    }
  }
  const stop = (stopEvent?: PointerEvent | Event) => {
    if (stopEvent instanceof PointerEvent && stopEvent.pointerId !== pointerId) return
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
    handle.removeEventListener('lostpointercapture', stop)
    window.removeEventListener('blur', stop)
    if (resizeFrame !== null) {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = null
    }
    if (pendingResizeWidth !== null) {
      emit('resizePanel', pendingResizeWidth)
      pendingResizeWidth = null
    }
    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId)
    }
    document.documentElement.classList.remove('record-panel-resizing')
    stopPanelResizeListeners = null
  }

  stopPanelResizeListeners?.()
  stopPanelResizeListeners = stop
  document.documentElement.classList.add('record-panel-resizing')
  handle.setPointerCapture(pointerId)
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
  handle.addEventListener('lostpointercapture', stop)
  window.addEventListener('blur', stop)
  move(event)
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

function isFocusedRecordMove(row: GameRecordRow, moveIndex: number) {
  return isRecordActionRow(row)
    && props.focusedMove !== null
    && row.recordLineId === props.focusedMove.recordLineId
    && row.recordActionIndex === props.focusedMove.recordActionIndex
    && moveIndex === props.focusedMove.moveIndex
}

function isFocusedRecordSegment(row: GameRecordRow, moveIndex: number, segmentIndex: number) {
  return isFocusedRecordMove(row, moveIndex)
    && props.focusedMove?.segmentIndex === segmentIndex
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

function getRecordMoveKey(row: GameRecordAction, moveIndex: number) {
  const focusSuffix = isFocusedRecordMove(row, moveIndex)
    ? `:${props.focusedMove!.segmentIndex}:${props.focusedMove!.pulseId}`
    : ''
  return `${row.recordKey ?? row.serial}:${moveIndex}${focusSuffix}`
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

function canAnnotateAction(action: GameRecordAction) {
  return ! props.online
    && ! action.pending
    && action.recordLineId !== undefined
    && action.recordActionIndex !== undefined
}

function isEditingAction(action: GameRecordAction) {
  return annotationEditor.value?.recordKey === action.recordKey
}

function isEditingMove(action: GameRecordAction, moveIndex: number) {
  return annotationEditor.value?.kind === 'glyph'
    && isEditingAction(action)
    && annotationEditor.value.moveIndex === moveIndex
}

function openCommentEditor(action: GameRecordAction) {
  if (! canAnnotateAction(action)) return
  if (annotationEditor.value?.kind === 'comment' && isEditingAction(action)) return

  closeCustomGlyphTemplateEditor()
  annotationEditor.value = {
    kind: 'comment',
    recordKey: getRecordRowKey(action),
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    commentIndex: getActionCommentTexts(action).length,
    text: '',
  }
  void nextTick(focusCommentEditor)
  emit('uiSound')
}

function editComment(action: GameRecordAction, commentIndex: number, event?: MouseEvent) {
  if (! canAnnotateAction(action)) return

  const caretPoint = event && event.detail > 0
    ? { x: event.clientX, y: event.clientY }
    : null
  closeCustomGlyphTemplateEditor()
  annotationEditor.value = {
    kind: 'comment',
    recordKey: getRecordRowKey(action),
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    commentIndex,
    text: getActionCommentTexts(action)[commentIndex] ?? '',
  }
  void nextTick(() => focusCommentEditor(caretPoint))
  emit('uiSound')
}

function openGlyphEditor(action: GameRecordAction, moveIndex: number) {
  if (! canAnnotateAction(action)) return
  if (annotationEditor.value?.kind === 'glyph' && isEditingMove(action, moveIndex)) {
    closeAnnotationEditor()
    emit('uiSound')
    return
  }

  closeCustomGlyphTemplateEditor()
  annotationEditor.value = {
    kind: 'glyph',
    recordKey: getRecordRowKey(action),
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    moveIndex,
    text: '',
  }
  emit('uiSound')
}

function getGlyphStyle(glyph: string, color?: string) {
  return {
    '--record-glyph-bg': color ?? getRecordGlyphColor(glyph, customGlyphTemplates.value),
    '--record-glyph-fg': RECORD_GLYPH_TEXT_COLOR,
  }
}

function isSelectedGlyphTemplate(move: GameRecordMove, template: RecordGlyphTemplate) {
  return getMoveGlyphTexts(move).includes(template.glyph)
}

function selectGlyphTemplate(action: GameRecordAction, moveIndex: number, move: GameRecordMove, template: RecordGlyphTemplate) {
  if (annotationEditor.value?.kind !== 'glyph') return
  toggleMoveGlyph(action, moveIndex, move, template.glyph)
  emit('uiSound')
}

function toggleCustomGlyphTemplateEditor(template: RecordGlyphTemplate) {
  if (template.builtIn) return
  if (editingCustomGlyphKey.value === template.glyph) {
    closeCustomGlyphTemplateEditor()
    emit('uiSound')
    return
  }
  openCustomGlyphTemplateEditor(template)
}

function getMoveGlyphTexts(move: GameRecordMove) {
  return move.glyphs?.map(glyph => glyph.glyph) ?? []
}

function getActionCommentTexts(action: GameRecordAction) {
  return action.commentsAfter?.map(comment => comment.text) ?? []
}

function getCommentStyle(authorId?: string) {
  return {
    '--record-comment-author-color': getRecordMarkerAuthorColor(authorId || DEFAULT_RECORD_MARKER_AUTHOR_ID),
  }
}

function replaceMoveGlyphs(action: GameRecordAction, moveIndex: number, glyphs: readonly string[]) {
  if (! canAnnotateAction(action)) return

  emit('replaceMoveGlyphs', {
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    moveIndex,
    glyphs: [...new Set(glyphs.map(normalizeRecordGlyphText).filter(Boolean))],
  })
}

function toggleMoveGlyph(action: GameRecordAction, moveIndex: number, move: GameRecordMove, glyph: string) {
  const normalized = normalizeRecordGlyphText(glyph)
  if (! normalized) return

  const glyphs = getMoveGlyphTexts(move)
  replaceMoveGlyphs(
    action,
    moveIndex,
    glyphs.includes(normalized)
      ? glyphs.filter(item => item !== normalized)
      : [...glyphs, normalized],
  )
}

function isEditingComment(action: GameRecordAction, commentIndex: number) {
  return annotationEditor.value?.kind === 'comment'
    && isEditingAction(action)
    && annotationEditor.value.commentIndex === commentIndex
}

function isEditingNewComment(action: GameRecordAction) {
  return annotationEditor.value?.kind === 'comment'
    && isEditingAction(action)
    && annotationEditor.value.commentIndex === getActionCommentTexts(action).length
}

function updateCommentEditorText(action: GameRecordAction, event: Event) {
  if (annotationEditor.value?.kind !== 'comment' || ! isEditingAction(action)) return

  annotationEditor.value.text = getEditableCommentText(event.target as HTMLElement)
}

function replaceActionCommentAt(action: GameRecordAction, commentIndex: number, text: string) {
  if (! canAnnotateAction(action)) return

  const texts = getActionCommentTexts(action)
  const nextTexts = [...texts]
  nextTexts[commentIndex] = text
  emit('replaceActionComments', {
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    position: 'after',
    texts: nextTexts,
  })
}

function deleteActionCommentAt(action: GameRecordAction, commentIndex: number) {
  if (! canAnnotateAction(action)) return

  removeActionCommentAt(action, commentIndex)
  closeAnnotationEditor()
  emit('uiSound')
}

function removeActionCommentAt(action: GameRecordAction, commentIndex: number) {
  if (! canAnnotateAction(action)) return

  const texts = getActionCommentTexts(action)
  emit('replaceActionComments', {
    recordLineId: action.recordLineId!,
    recordActionIndex: action.recordActionIndex!,
    position: 'after',
    texts: texts.filter((_, index) => index !== commentIndex),
  })
}

function closeCommentEditorOnBlur(action: GameRecordAction, event: FocusEvent) {
  if (annotationEditor.value?.kind !== 'comment' || ! isEditingAction(action)) return
  const editingComment = (event.currentTarget as HTMLElement).closest('.record-comment--editing')
  const nextFocusTarget = event.relatedTarget
  if (nextFocusTarget instanceof Node && editingComment?.contains(nextFocusTarget)) return

  commitCommentEditor(action)
  closeAnnotationEditor()
}

function finishCommentEditor(action: GameRecordAction) {
  if (annotationEditor.value?.kind !== 'comment' || ! isEditingAction(action)) return

  commitCommentEditor(action)
  closeAnnotationEditor()
}

function commitCommentEditor(action: GameRecordAction) {
  if (annotationEditor.value?.kind !== 'comment' || ! isEditingAction(action)) return

  const commentIndex = annotationEditor.value.commentIndex
  const previousText = getActionCommentTexts(action)[commentIndex] ?? ''
  const nextText = annotationEditor.value.text
  const nextTrimmed = nextText.trim()
  if (previousText === nextText) return

  if (nextTrimmed.length === 0) {
    if (previousText.length > 0) {
      removeActionCommentAt(action, commentIndex)
      emit('uiSound')
    }
    return
  }

  replaceActionCommentAt(action, commentIndex, nextText)
  emit('uiSound')
}

function focusCommentEditor(caretPoint: { x: number, y: number } | null = null) {
  const editor = recordContent.value
    ?.querySelector<HTMLElement>('[data-record-comment-editor="true"]')
  if (! editor) return

  editor.textContent = annotationEditor.value?.kind === 'comment'
    ? annotationEditor.value.text
    : ''
  editor.focus()
  if (! caretPoint || ! moveCaretToEditablePoint(editor, caretPoint)) {
    moveCaretToEditableEnd(editor)
  }
}

function getEditableCommentText(element: HTMLElement): string {
  return element.innerText.replace(/\u00a0/g, ' ')
}

function moveCaretToEditableEnd(element: HTMLElement) {
  const selection = window.getSelection()
  if (! selection) return

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function moveCaretToEditablePoint(element: HTMLElement, point: { x: number, y: number }): boolean {
  const range = getCaretRangeFromPoint(point)
  if (! range) return false
  if (! element.contains(range.startContainer) && range.startContainer !== element) return false

  const selection = window.getSelection()
  if (! selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function getCaretRangeFromPoint(point: { x: number, y: number }): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node, offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }

  const position = doc.caretPositionFromPoint?.(point.x, point.y)
  if (position) {
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  return doc.caretRangeFromPoint?.(point.x, point.y) ?? null
}

function getEditingAction() {
  const editor = annotationEditor.value
  if (! editor) return null

  return props.rows.find((row): row is GameRecordAction => (
    isRecordActionRow(row) && row.recordKey === editor.recordKey
  )) ?? null
}

function syncEditedCustomGlyphToMove(previousGlyph: string | null, nextGlyph: string | null) {
  const action = getEditingAction()
  if (! action || annotationEditor.value?.kind !== 'glyph') return

  const move = action.moves[annotationEditor.value.moveIndex]
  if (! move) return

  const glyphs = getMoveGlyphTexts(move)
  if (previousGlyph && glyphs.includes(previousGlyph)) {
    replaceMoveGlyphs(
      action,
      annotationEditor.value.moveIndex,
      nextGlyph
        ? glyphs.map(glyph => glyph === previousGlyph ? nextGlyph : glyph)
        : glyphs.filter(glyph => glyph !== previousGlyph),
    )
    return
  }

  if (nextGlyph) replaceMoveGlyphs(action, annotationEditor.value.moveIndex, [...glyphs, nextGlyph])
}

function openNewCustomGlyphTemplateEditor() {
  customGlyphDraft.value = {
    glyph: '',
    color: RECORD_GLYPH_DEFAULT_COLOR,
  }
  editingCustomGlyphKey.value = null
  emit('uiSound')
}

function openCustomGlyphTemplateEditor(
  template: CustomRecordGlyphTemplate,
  playSound = true,
) {
  customGlyphDraft.value = {
    glyph: template.glyph,
    color: template.color,
  }
  editingCustomGlyphKey.value = template.glyph
  if (playSound) emit('uiSound')
}

function closeCustomGlyphTemplateEditor() {
  customGlyphDraft.value = null
  editingCustomGlyphKey.value = null
}

function syncCustomGlyphTemplateDraft(next: CustomRecordGlyphTemplate) {
  const previousKey = editingCustomGlyphKey.value
  customGlyphDraft.value = next

  const normalized = normalizeCustomRecordGlyphTemplate(next)
  const templates = [...customGlyphTemplates.value]
  if (normalized && previousKey !== normalized.glyph) {
    const duplicateIndex = templates.findIndex(template => template.glyph === normalized.glyph)
    if (duplicateIndex >= 0) templates.splice(duplicateIndex, 1)
  }
  const previousIndex = previousKey === null
    ? -1
    : templates.findIndex(template => template.glyph === previousKey)

  if (previousIndex >= 0) {
    if (normalized) templates.splice(previousIndex, 1, normalized)
    else templates.splice(previousIndex, 1)
  }
  else if (normalized) {
    templates.push(normalized)
  }
  customGlyphTemplates.value = uniqueRecordGlyphTemplates(templates)

  syncEditedCustomGlyphToMove(previousKey, normalized?.glyph ?? null)
  editingCustomGlyphKey.value = normalized?.glyph ?? null
  if (annotationEditor.value?.kind === 'glyph') {
    annotationEditor.value.text = normalized?.glyph ?? ''
  }
}

function deleteCustomGlyphTemplate() {
  const glyph = editingCustomGlyphKey.value ?? customGlyphDraft.value?.glyph ?? ''
  if (glyph) {
    customGlyphTemplates.value = customGlyphTemplates.value
      .filter(template => template.glyph !== glyph)
    syncEditedCustomGlyphToMove(glyph, null)
    if (
      annotationEditor.value?.kind === 'glyph'
        && normalizeRecordGlyphText(annotationEditor.value.text) === glyph
    ) {
      annotationEditor.value.text = ''
    }
  }
  closeCustomGlyphTemplateEditor()
  emit('uiSound')
}

function closeAnnotationEditor() {
  closeCustomGlyphTemplateEditor()
  annotationEditor.value = null
}

function scrollCurrentCursorIntoView() {
  const container = recordContent.value
  if (! container || ! currentCursorKey.value) return

  const current = container.querySelector<HTMLElement>('[data-current-record-cursor="true"]')
  scrollElementIntoRecordView(current)
}

function scrollFocusedMoveIntoView() {
  const container = recordContent.value
  if (! container || ! focusedMoveKey.value) return

  const move = container.querySelector<HTMLElement>('[data-focused-record-move="true"]')
  scrollElementIntoRecordView(move)
}

function scrollElementIntoRecordView(element: HTMLElement | null) {
  const container = recordContent.value
  if (! container || ! element) return

  const containerRect = container.getBoundingClientRect()
  const currentRect = element.getBoundingClientRect()
  const padding = 8
  const overflowTop = currentRect.top - containerRect.top - padding
  const overflowBottom = currentRect.bottom - containerRect.bottom + padding

  if (overflowTop < 0) {
    container.scrollBy({
      top: overflowTop,
      behavior: 'smooth',
    })
  }
  else if (overflowBottom > 0) {
    container.scrollBy({
      top: overflowBottom,
      behavior: 'smooth',
    })
  }
}

onBeforeUnmount(() => {
  stopPanelResizeListeners?.()
  if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
})
</script>

<template>
  <aside
    class="record-panel"
    @wheel.stop
  >
    <div
      class="record-resize-handle"
      @pointerdown="startPanelResize"
    ></div>
    <div class="record-header-bar">
      <h2 class="record-title">{{ t('record.title') }}</h2>
    </div>
    <div class="record-toolbar-row">
      <div class="record-header-actions">
        <GameButton
          v-for="button in actionButtons"
          :key="button.id"
          size="small"
          :disabled="button.disabled"
          :pressed="button.pressed"
          :pulsing="button.effect === 'pulse'"
          @click="emit('toolbarButtonClick', button)"
        >
          <span>{{ getButtonText(button) }}</span>
        </GameButton>
      </div>
    </div>
    <div class="record-display-toolbar">
      <GameToggle
        v-model="showRecordClock"
        size="small"
      >
        {{ t('record.showTime') }}
      </GameToggle>
      <GameToggle
        v-model="showRecordComments"
        size="small"
      >
        {{ t('record.showComments') }}
      </GameToggle>
      <GameToggle
        v-model="showRecordGlyphs"
        size="small"
      >
        {{ t('record.showGlyphs') }}
      </GameToggle>
    </div>
    <div
      ref="recordContent"
      class="record-content"
    >
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
            :data-current-record-cursor="isCurrentRecordRow(row) ? 'true' : undefined"
          >
            <template v-if="isRecordActionRow(row)">
              <span class="record-action">
                  <span
                    v-for="(move, moveIndex) in row.moves"
                    :key="getRecordMoveKey(row, moveIndex)"
                    class="record-move"
                  >
                  <span
                    v-if="moveIndex === 0"
                    class="record-serial"
                  >
                    {{ row.serial }}
                  </span>
                  <span class="record-move-main">
                    <span
                      v-if="moveIndex === 0 && showRecordClock && row.clock"
                      class="record-clock"
                    >
                      {{ t('record.clock', {
                        elapsed: row.clock.elapsed,
                        total: row.clock.total,
                      }) }}
                    </span>
                    <button
                      v-for="(segment, segmentIndex) in move.segments"
                      :key="`${row.serial}-${moveIndex}-${segmentIndex}`"
                      class="record-segment"
                      :class="{ 'record-segment--focused': isFocusedRecordSegment(row, moveIndex, segmentIndex) }"
                      type="button"
                      :data-focused-record-move="isFocusedRecordSegment(row, moveIndex, segmentIndex) ? 'true' : undefined"
                      @click.stop="emit('focusSegment', segment)"
                    >
                      {{ segment.text }}
                    </button>
                    <span
                      v-if="showRecordGlyphs && move.glyphs?.length"
                      class="record-glyphs"
                    >
                      <span
                        v-for="glyph in move.glyphs"
                        :key="glyph.id"
                        class="record-glyph"
                        :style="getGlyphStyle(glyph.glyph)"
                      >
                        {{ glyph.glyph }}
                      </span>
                    </span>
                  </span>
                  <span
                    v-if="canAnnotateAction(row)"
                    class="record-annotation-actions record-annotation-actions--move"
                  >
                    <GameButton
                      class="record-annotation-action-button"
                      size="tiny"
                      shape="circle"
                      :pressed="annotationEditor?.kind === 'glyph' && isEditingMove(row, moveIndex)"
                      :pressed-indicator="false"
                      type="button"
                      :title="t('record.editGlyph')"
                      :aria-label="t('record.editGlyph')"
                      @click.stop="openGlyphEditor(row, moveIndex)"
                    >
                      <GameIcon name="exclamation" />
                    </GameButton>
                  </span>
                  <span
                    v-if="moveIndex === 0 && canAnnotateAction(row)"
                    class="record-annotation-actions record-annotation-actions--action"
                  >
                    <GameButton
                      class="record-annotation-action-button"
                      size="tiny"
                      shape="circle"
                      :pressed="annotationEditor?.kind === 'comment' && isEditingAction(row)"
                      :pressed-indicator="false"
                      :disabled="annotationEditor?.kind === 'comment' && isEditingAction(row)"
                      type="button"
                      :title="t('record.addComment')"
                      :aria-label="t('record.addComment')"
                      @click.stop="openCommentEditor(row)"
                    >
                      <GameIcon name="comment" />
                    </GameButton>
                  </span>
                  <span
                    v-if="annotationEditor?.kind === 'glyph' && isEditingMove(row, moveIndex)"
                    class="record-annotation-editor"
                  >
                    <span class="record-glyph-template-tools">
                      <span class="record-glyph-template-list">
                        <template
                          v-for="template in recordGlyphTemplates"
                          :key="`${template.builtIn ? 'built-in' : 'custom'}:${template.glyph}`"
                        >
                          <button
                            class="record-glyph-template"
                            :class="{ 'record-glyph-template--selected': isSelectedGlyphTemplate(move, template) }"
                            type="button"
                            :style="getGlyphStyle(template.glyph, template.color)"
                            @click.stop="selectGlyphTemplate(row, moveIndex, move, template)"
                            @contextmenu.prevent.stop="toggleCustomGlyphTemplateEditor(template)"
                          >
                            {{ template.glyph }}
                          </button>
                        </template>
                        <GameButton
                          class="record-glyph-template-add"
                          size="tiny"
                          shape="circle"
                          :pressed-indicator="false"
                          type="button"
                          :title="t('record.addGlyphTemplate')"
                          :aria-label="t('record.addGlyphTemplate')"
                          @click.stop="openNewCustomGlyphTemplateEditor"
                        >
                          <GameIcon name="plus" />
                        </GameButton>
                      </span>
                      <span
                        v-if="customGlyphDraft"
                        class="record-glyph-template-edit"
                      >
                        <GameTextInput
                          v-model="customGlyphDraftText"
                          class="record-glyph-template-text-input"
                          size="tiny"
                          maxlength="8"
                          spellcheck="false"
                          :placeholder="t('record.glyphTemplatePlaceholder')"
                          @keydown.esc.prevent="closeAnnotationEditor"
                        />
                        <GameColorInput
                          v-model="customGlyphDraftColor"
                          class="record-glyph-template-color-input"
                          :title="t('record.glyphTemplateColor')"
                          :aria-label="t('record.glyphTemplateColor')"
                        />
                        <GameButton
                          class="record-glyph-template-edit-delete"
                          size="tiny"
                          shape="circle"
                          :pressed-indicator="false"
                          type="button"
                          :title="t('record.deleteGlyphTemplate')"
                          :aria-label="t('record.deleteGlyphTemplate')"
                          @click.stop="deleteCustomGlyphTemplate"
                        >
                          <GameIcon name="x" />
                        </GameButton>
                      </span>
                    </span>
                  </span>
                </span>
                <span
                  v-if="(showRecordComments && row.commentsAfter?.length) || isEditingNewComment(row)"
                  class="record-comments record-comments--after"
                >
                  <span
                    v-for="(comment, commentIndex) in row.commentsAfter"
                    :key="commentIndex"
                    class="record-comment"
                    :class="{ 'record-comment--editing': isEditingComment(row, commentIndex) }"
                    :style="getCommentStyle(comment.authorId)"
                  >
                    <template v-if="isEditingComment(row, commentIndex)">
                      <div
                        class="record-comment-input"
                        data-record-comment-editor="true"
                        contenteditable="true"
                        role="textbox"
                        aria-multiline="true"
                        spellcheck="false"
                        :data-placeholder="t('record.commentPlaceholder')"
                        @input="updateCommentEditorText(row, $event)"
                        @blur="closeCommentEditorOnBlur(row, $event)"
                        @keydown.esc.prevent="finishCommentEditor(row)"
                      ></div>
                      <GameButton
                        class="record-comment-delete"
                        size="tiny"
                        shape="circle"
                        :pressed-indicator="false"
                        type="button"
                        :title="t('record.deleteComment')"
                        :aria-label="t('record.deleteComment')"
                        @click.stop="deleteActionCommentAt(row, commentIndex)"
                      >
                        <GameIcon name="x" />
                      </GameButton>
                    </template>
                    <button
                      v-else-if="canAnnotateAction(row)"
                      class="record-comment-button"
                      type="button"
                      :title="t('record.editComment')"
                      :aria-label="t('record.editComment')"
                      @click.stop="editComment(row, commentIndex, $event)"
                    >
                      {{ comment.text }}
                    </button>
                    <template v-else>
                      {{ comment.text }}
                    </template>
                  </span>
                  <span
                    v-if="isEditingNewComment(row)"
                    class="record-comment record-comment--editing"
                    :style="getCommentStyle()"
                  >
                    <div
                      class="record-comment-input"
                      data-record-comment-editor="true"
                      contenteditable="true"
                      role="textbox"
                      aria-multiline="true"
                      spellcheck="false"
                      :data-placeholder="t('record.commentPlaceholder')"
                      @input="updateCommentEditorText(row, $event)"
                      @blur="closeCommentEditorOnBlur(row, $event)"
                      @keydown.esc.prevent="finishCommentEditor(row)"
                    ></div>
                    <GameButton
                      class="record-comment-delete"
                      size="tiny"
                      shape="circle"
                      :pressed-indicator="false"
                      type="button"
                      :title="t('record.deleteComment')"
                      :aria-label="t('record.deleteComment')"
                      @click.stop="closeAnnotationEditor"
                    >
                      <GameIcon name="x" />
                    </GameButton>
                  </span>
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
  width: max-content;
  min-width: min(var(--record-panel-width), calc(100vw - var(--button-top) * 2));
  max-width: calc(100vw - var(--button-top) * 2);
  padding: calc(var(--button-content-gap) * 3);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  pointer-events: auto;
}

.record-resize-handle {
  position: absolute;
  z-index: 5;
  top: 0;
  bottom: 0;
  left: -7px;
  width: 14px;
  cursor: ew-resize;
  touch-action: none;
}

.record-resize-handle::before {
  position: absolute;
  top: calc(var(--button-content-gap) * 2);
  bottom: calc(var(--button-content-gap) * 2);
  left: 50%;
  width: 2px;
  background: currentColor;
  content: "";
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 160ms ease;
}

.record-resize-handle:hover::before,
.record-resize-handle:active::before {
  opacity: 0.42;
}

:global(.record-panel-resizing),
:global(.record-panel-resizing *) {
  cursor: ew-resize !important;
  user-select: none !important;
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

.record-toolbar-row {
  flex: 0 0 auto;
  display: flex;
  min-width: 0;
}

.record-header-actions {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.75);
}

.record-display-toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 1.1);
  align-items: center;
  font-size: 14px;
}

.record-content {
  --record-scrollbar-outset: 8px;
  --record-action-min-width: 280px;

  flex: 1 1 auto;
  width: max-content;
  min-width: 100%;
  max-width: 100%;
  min-height: 0;
  overflow: auto;
  margin-right: calc(-1 * var(--record-scrollbar-outset));
  padding: 0;
  padding-right: var(--record-scrollbar-outset);
  color: var(--button-text-color);
  font-family: var(--latin-serif-font);
  font-size: 18px;
  line-height: 1.35;
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
  grid-template-columns: max-content max-content max-content;
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.72);
  min-width: 100%;
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
  grid-template-columns: max-content max-content max-content;
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
  min-width: var(--record-action-min-width);
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
  --record-cursor-tag-bg: var(--record-participant-color, rgb(181, 101, 184));
  --record-cursor-tag-border: var(--record-participant-color, rgb(181, 101, 184));
  --record-cursor-tag-fg: var(--record-participant-text-color, rgb(244, 245, 237));
  --record-cursor-tag-shadow-offset: var(--button-tiny-shadow-offset);
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
  grid-column: 1 / -1;
  grid-template-columns:
    max-content
    minmax(max-content, 1fr)
    max-content
    max-content;
  align-items: start;
  column-gap: var(--button-content-gap);
  row-gap: calc(var(--button-content-gap) * 0.35);
  min-width: var(--record-action-min-width);
}

.record-move > .record-serial {
  grid-column: 1;
  grid-row: 1;
}

.record-comments {
  display: grid;
  grid-column: 2 / -1;
  row-gap: calc(var(--button-content-gap) * 0.5);
  min-width: 0;
  margin-block: calc(var(--button-content-gap) * 0.35);
  font-size: 0.86em;
  font-style: italic;
  opacity: 0.82;
}

.record-comment {
  --record-comment-line-height: 1.35em;
  --record-comment-block-padding-y: 2px;
  --record-comment-block-padding-x: calc(var(--button-tiny-content-gap) * 2);
  --record-comment-border-width: 3px;

  display: flex;
  align-items: flex-start;
  gap: var(--button-tiny-content-gap);
  min-width: 0;
  min-height: var(--record-comment-line-height);
  padding: var(--record-comment-block-padding-y) var(--record-comment-block-padding-x);
  border-left: var(--record-comment-border-width) solid var(--record-comment-author-color, var(--main-arrow-fill-color));
  border-radius: 4px;
  background: color-mix(in srgb, var(--record-comment-author-color, var(--main-arrow-fill-color)) 10%, transparent);
  line-height: var(--record-comment-line-height);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.record-comment-button {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--record-comment-line-height);
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}

.record-comment-button:hover,
.record-comment-button:focus-visible {
  outline: none;
}

.record-comment--editing {
  align-items: flex-start;
}

.record-comment-input {
  display: block;
  flex: 1 1 auto;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: var(--record-comment-line-height);
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: var(--record-comment-line-height);
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.record-comment-input:focus {
  color: inherit;
}

.record-comment-input:empty::before {
  color: color-mix(in srgb, currentColor 56%, transparent);
  content: attr(data-placeholder);
  pointer-events: none;
}

.record-comment-delete {
  --button-icon-size: var(--button-tiny-icon-size);

  flex: 0 0 auto;
}

.record-glyphs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 0.35);
  align-items: center;
  margin-left: calc(var(--button-content-gap) * 0.5);
  vertical-align: baseline;
  font-weight: 700;
  opacity: 0.88;
  white-space: nowrap;
}

.record-glyph,
.record-glyph-template {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--button-tiny-height);
  height: var(--button-tiny-height);
  border-radius: 50%;
  background: var(--record-glyph-bg);
  color: var(--record-glyph-fg);
  font-size: 16px;
  font-family: var(--latin-serif-font);
  line-height: 1;
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
}

.record-glyph-template {
  padding: 0;
  border: 0;
  cursor: pointer;
}

.record-glyph-template-tools {
  display: grid;
  gap: calc(var(--button-tiny-content-gap) * 2 + var(--button-tiny-shadow-offset));
}

.record-glyph-template-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: calc(var(--button-tiny-content-gap) * 0.8);
  row-gap: calc(var(--button-tiny-content-gap) + var(--button-tiny-shadow-offset));
}

.record-glyph-template:hover,
.record-glyph-template:focus-visible {
  filter: brightness(1.2);
  outline: none;
}

.record-glyph-template--selected {
  outline: none;
  transform: translateY(var(--button-tiny-shadow-offset));
  box-shadow: none;
}

.record-glyph-template-add,
.record-glyph-template-edit-delete {
  --button-icon-size: var(--button-tiny-icon-size);
}

.record-glyph-template-edit {
  display: grid;
  grid-template-columns: minmax(0, 60px) max-content max-content;
  align-items: center;
  gap: calc(var(--button-tiny-content-gap));
  padding-right: var(--button-tiny-shadow-offset);
  padding-bottom: var(--button-tiny-shadow-offset);
}

.record-glyph-template-text-input {
  width: 100%;
}

.record-glyph-template-color-input {
  justify-self: center;
}

.record-annotation-actions {
  align-items: center;
  opacity: 0;
  transition: opacity 160ms ease;
}

.record-annotation-actions--move {
  display: flex;
  grid-column: 3;
  align-self: center;
  gap: var(--button-tiny-content-gap);
  justify-self: start;
}

.record-annotation-actions--action {
  display: flex;
  grid-column: 4;
  align-self: center;
  justify-self: end;
}

.record-row:hover .record-annotation-actions,
.record-row:focus-within .record-annotation-actions {
  opacity: 1;
}

.record-annotation-action-button {
  --button-icon-size: var(--button-tiny-icon-size);
}

.record-annotation-editor {
  grid-column: 2 / -1;
  display: grid;
  gap: calc(var(--button-content-gap) * 0.55 + var(--button-tiny-shadow-offset));
  padding-bottom: var(--button-tiny-shadow-offset);
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
  box-shadow: var(--record-cursor-tag-shadow-offset) var(--record-cursor-tag-shadow-offset) 0 var(--button-shadow-color);
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

.record-row--cursor .record-action-icons::before,
.record-row--cursor .record-action-icons::after {
  position: absolute;
  z-index: -1;
  inset: 0;
  clip-path: polygon(
    0 50%,
    var(--record-cursor-tip-size) 0,
    100% 0,
    100% 100%,
    var(--record-cursor-tip-size) 100%
  );
  content: "";
  opacity: 0;
  transform-origin: right center;
  transition:
    opacity 240ms ease,
    transform 240ms ease;
}

.record-row--cursor .record-action-icons::before {
  background: var(--button-shadow-color);
  transform: translate(var(--record-cursor-tag-shadow-offset), var(--record-cursor-tag-shadow-offset)) scaleX(0);
}

.record-row--cursor .record-action-icons::after {
  background: var(--record-cursor-tag-bg);
  transform: scaleX(0);
}

.record-row--cursor-current .record-cursor-guide::before,
.record-row--cursor-interactive:hover .record-cursor-guide::before,
.record-row--cursor-interactive:focus-within .record-cursor-guide::before,
.record-row--cursor-current .record-action-icons::before,
.record-row--cursor-interactive:hover .record-action-icons::before,
.record-row--cursor-interactive:focus-within .record-action-icons::before {
  opacity: 1;
}

.record-row--cursor-current .record-cursor-guide::before,
.record-row--cursor-interactive:hover .record-cursor-guide::before,
.record-row--cursor-interactive:focus-within .record-cursor-guide::before {
  transform: scaleX(1);
}

.record-row--cursor-current .record-action-icons::before,
.record-row--cursor-interactive:hover .record-action-icons::before,
.record-row--cursor-interactive:focus-within .record-action-icons::before {
  transform: translate(var(--record-cursor-tag-shadow-offset), var(--record-cursor-tag-shadow-offset)) scaleX(1);
}

.record-row--cursor-current .record-action-icons::after,
.record-row--cursor-interactive:hover .record-action-icons::after,
.record-row--cursor-interactive:focus-within .record-action-icons::after {
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
  display: inline-block;
  margin-right: calc(var(--button-content-gap) * 0.5);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.68;
  white-space: nowrap;
}

.record-move {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 0.5);
  min-width: 0;
  border-radius: 6px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.record-move-main {
  display: flex;
  grid-column: 2;
  flex-wrap: nowrap;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.2);
  min-width: max-content;
}

.record-segment--focused {
  animation: record-move-focus-pulse 1300ms ease-out;
}

@keyframes record-move-focus-pulse {
  0% {
    background: color-mix(in srgb, var(--button-hover-fill-color) 74%, transparent);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--button-hover-border-color) 88%, transparent);
  }

  42% {
    background: color-mix(in srgb, var(--button-hover-fill-color) 42%, transparent);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--button-hover-border-color) 28%, transparent);
  }

  100% {
    background: transparent;
    box-shadow: 0 0 0 8px transparent;
  }
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
  white-space: nowrap;
  transition:
    background 160ms ease,
    box-shadow 160ms ease;
}

.record-segment:hover,
.record-segment:focus-visible {
  background: color-mix(in srgb, var(--button-hover-fill-color) 58%, transparent);
  outline: none;
}

.record-empty {
  opacity: 0.72;
}
</style>
