<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  bottom?: string
  maxSize?: number
  minSize?: number
  side?: 'left' | 'right'
  size: number
  top?: string
}>(), {
  bottom: 'auto',
  maxSize: Number.POSITIVE_INFINITY,
  minSize: 260,
  side: 'left',
  top: 'calc(var(--button-top) + 120px)',
})

const emit = defineEmits<{
  resizePanel: [size: number]
}>()

const resizing = ref(false)

const panelStyle = computed(() => ({
  '--game-side-panel-bottom': props.bottom,
  '--game-side-panel-top': props.top,
  '--game-side-panel-width': `${props.size}px`,
}))

function startPanelResize(event: PointerEvent) {
  if (event.button !== 0) return

  const handle = event.currentTarget as HTMLElement
  const pointerId = event.pointerId
  const startClientX = event.clientX
  const startSize = props.size
  resizing.value = true
  handle.setPointerCapture(pointerId)
  document.documentElement.classList.add('game-side-panel-resizing')

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    const delta = props.side === 'left'
      ? moveEvent.clientX - startClientX
      : startClientX - moveEvent.clientX
    emit('resizePanel', clampPanelSize(startSize + delta))
  }

  const stop = (stopEvent: PointerEvent | Event) => {
    if ('pointerId' in stopEvent && stopEvent.pointerId !== pointerId) return
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('pointercancel', stop)
    handle.removeEventListener('lostpointercapture', stop)
    window.removeEventListener('blur', stop)
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    resizing.value = false
    document.documentElement.classList.remove('game-side-panel-resizing')
  }

  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('pointercancel', stop)
  handle.addEventListener('lostpointercapture', stop)
  window.addEventListener('blur', stop)
  move(event)
}

function clampPanelSize(size: number) {
  return Math.min(Math.max(size, props.minSize), props.maxSize)
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove('game-side-panel-resizing')
})
</script>

<template>
  <aside
    class="game-side-panel-stack"
    :class="[
      `game-side-panel-stack--${side}`,
      { 'game-side-panel-stack--resizing': resizing },
    ]"
    :style="panelStyle"
    @wheel.stop
  >
    <div
      class="game-side-panel-resize-handle"
      @pointerdown="startPanelResize"
    ></div>
    <slot />
  </aside>
</template>

<style scoped>
.game-side-panel-stack {
  --game-side-panel-resize-hit-size: 14px;
  --game-side-panel-resize-line-end-inset: 8px;
  --game-side-panel-resize-line-inset: 3px;
  --game-side-panel-resize-line-size: 2px;

  position: absolute;
  top: var(--game-side-panel-top);
  bottom: var(--game-side-panel-bottom);
  z-index: var(--z-ui-panel);
  display: flex;
  flex-direction: column;
  width: min(var(--game-side-panel-width), calc(100vw - var(--button-top) * 2));
  min-height: 0;
  pointer-events: auto;
}

.game-side-panel-stack--left {
  left: var(--button-top);
}

.game-side-panel-stack--right {
  right: var(--button-top);
}

.game-side-panel-stack :deep(.game-panel),
.game-side-panel-stack :deep(.record-panel) {
  position: relative;
  min-width: 0;
  height: 100%;
}

.game-side-panel-stack :deep(.record-panel) {
  flex: 1 1 auto;
  min-height: 0;
}

.game-side-panel-stack :deep(.game-panel)::after,
.game-side-panel-stack :deep(.record-panel)::after {
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

.game-side-panel-stack--left :deep(.game-panel)::after,
.game-side-panel-stack--left :deep(.record-panel)::after {
  right: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-stack--right :deep(.game-panel)::after,
.game-side-panel-stack--right :deep(.record-panel)::after {
  left: var(--game-side-panel-resize-line-inset);
}

.game-side-panel-stack:has(.game-side-panel-resize-handle:hover) :deep(.game-panel)::after,
.game-side-panel-stack:has(.game-side-panel-resize-handle:hover) :deep(.record-panel)::after,
.game-side-panel-stack--resizing :deep(.game-panel)::after,
.game-side-panel-stack--resizing :deep(.record-panel)::after {
  opacity: 0.42;
}

.game-side-panel-resize-handle {
  position: absolute;
  z-index: var(--z-ui-handle);
  top: 0;
  bottom: 0;
  width: var(--game-side-panel-resize-hit-size);
  cursor: ew-resize;
  touch-action: none;
}

.game-side-panel-stack--left .game-side-panel-resize-handle {
  right: 0;
}

.game-side-panel-stack--right .game-side-panel-resize-handle {
  left: 0;
}

:global(.game-side-panel-resizing),
:global(.game-side-panel-resizing *) {
  cursor: ew-resize !important;
  user-select: none !important;
}
</style>
