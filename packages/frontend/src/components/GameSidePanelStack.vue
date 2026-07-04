<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  bottom?: string
  side?: 'left' | 'right'
  size: number
  top?: string
}>(), {
  bottom: 'auto',
  side: 'left',
  top: 'calc(var(--button-top) + 120px)',
})

const panelStyle = computed(() => ({
  '--game-side-panel-bottom': props.bottom,
  '--game-side-panel-top': props.top,
  '--game-side-panel-width': `${props.size}px`,
}))
</script>

<template>
  <aside
    class="game-side-panel-stack"
    :class="`game-side-panel-stack--${side}`"
    :style="panelStyle"
    @wheel.stop
  >
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
  pointer-events: none;
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

:global(.game-side-panel-resizing),
:global(.game-side-panel-resizing *) {
  cursor: ew-resize !important;
  user-select: none !important;
}
</style>
