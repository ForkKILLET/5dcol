<script setup lang="ts">
import { computed, ref } from 'vue'

const model = defineModel<number>({ required: true })

const props = withDefaults(defineProps<{
  ariaLabel?: string
  max?: number
  min?: number
  step?: number
}>(), {
  ariaLabel: '',
  max: 1,
  min: 0,
  step: 0.01,
})

const emit = defineEmits<{
  change: []
}>()

const track = ref<HTMLElement | null>(null)
const dragging = ref(false)

const valueRatio = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return clamp((model.value - props.min) / range, 0, 1)
})

function updateFromPointer(e: PointerEvent) {
  const rect = track.value?.getBoundingClientRect()
  if (! rect || rect.width <= 0) return

  setValue(props.min + (clamp((e.clientX - rect.left) / rect.width, 0, 1) * (props.max - props.min)))
}

function onPointerDown(e: PointerEvent) {
  if (! track.value) return
  dragging.value = true
  track.value.setPointerCapture(e.pointerId)
  updateFromPointer(e)
}

function onPointerMove(e: PointerEvent) {
  if (! dragging.value) return
  updateFromPointer(e)
}

function onPointerUp(e: PointerEvent) {
  if (! dragging.value) return
  dragging.value = false
  track.value?.releasePointerCapture(e.pointerId)
  emit('change')
}

function onKeyDown(e: KeyboardEvent) {
  const step = props.step || 0.01
  const largeStep = step * 10
  let next: number | null = null

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      next = model.value - step
      break
    case 'ArrowRight':
    case 'ArrowUp':
      next = model.value + step
      break
    case 'PageDown':
      next = model.value - largeStep
      break
    case 'PageUp':
      next = model.value + largeStep
      break
    case 'Home':
      next = props.min
      break
    case 'End':
      next = props.max
      break
  }

  if (next === null) return
  e.preventDefault()
  setValue(next)
  emit('change')
}

function setValue(value: number) {
  const step = props.step || 0.01
  const stepped = Math.round((value - props.min) / step) * step + props.min
  model.value = clamp(Number(stepped.toFixed(6)), props.min, props.max)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
</script>

<template>
  <div
    ref="track"
    class="game-slider"
    :class="{ 'is-dragging': dragging }"
    role="slider"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-valuemax="max"
    :aria-valuemin="min"
    :aria-valuenow="model"
    @keydown="onKeyDown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <span class="game-slider-fill"></span>
    <span class="game-slider-thumb"></span>
  </div>
</template>

<style scoped>
.game-slider {
  --slider-height: 34px;
  --slider-line-height: 4px;
  --slider-thumb-size: 24px;
  --slider-shadow-offset: var(--small-button-shadow-offset);
  position: relative;
  box-sizing: border-box;
  width: 170px;
  height: var(--slider-height);
  cursor: pointer;
  outline: none;
  touch-action: none;
  user-select: none;
}

.game-slider::before {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: var(--slider-line-height);
  border: 2px solid var(--button-border-color);
  border-radius: calc(var(--slider-line-height) / 2 + 2px);
  background: var(--button-fill-color);
  content: '';
  transform: translateY(-50%);
}

.game-slider-fill {
  position: absolute;
  left: 2px;
  top: 50%;
  width: calc(v-bind(valueRatio) * 100%);
  height: var(--slider-line-height);
  border-radius: calc(var(--slider-line-height) / 2);
  background: var(--button-text-color);
  transform: translateY(-50%);
}

.game-slider-thumb {
  position: absolute;
  left: calc(v-bind(valueRatio) * 100%);
  top: 50%;
  box-sizing: border-box;
  width: var(--slider-thumb-size);
  height: var(--slider-thumb-size);
  border: 2px solid var(--button-border-color);
  border-radius: 50%;
  background: var(--button-fill-color);
  box-shadow: var(--slider-shadow-offset) var(--slider-shadow-offset) 0 var(--button-shadow-color);
  transform: translate(-50%, calc(-50% - var(--slider-shadow-offset)));
}

.game-slider-thumb:hover,
.game-slider:focus .game-slider-thumb,
.game-slider.is-dragging .game-slider-thumb {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
}

.game-slider:hover,
.game-slider:focus-visible,
.game-slider.is-dragging {
  --button-border-color: var(--button-hover-border-color);
  --button-fill-color: var(--button-hover-fill-color);
}

.game-slider:active .game-slider-thumb,
.game-slider.is-dragging .game-slider-thumb {
  transform: translate(-50%, -50%);
  box-shadow: none;
}
</style>
