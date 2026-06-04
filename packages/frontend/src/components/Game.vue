<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef } from 'vue'

import { Color4 } from '@engine/basic'
import { Animations, Colors, Sizes } from '@engine/constant'
import { Game, type GameToolbarButton } from '@engine/game'
import { Logger, type GameMessage } from '@engine/logger'
import { CanvasRenderer } from '@engine/canvas/renderer'

const canvas = useTemplateRef('canvas')

const messages = reactive<GameMessage[]>([])
const toolbarButtons = ref<GameToolbarButton[]>([])
const logger = new Logger(messages)
let game: Game | null = null

const query = new URLSearchParams(window.location.search)
const primaryButtonIds = new Set(['undo-move', 'deselect-piece', 'submit-moves'])

const primaryButtons = computed(() => (
  toolbarButtons.value.filter(button => primaryButtonIds.has(button.id))
))
const secondaryButtons = computed(() => (
  toolbarButtons.value.filter(button => ! primaryButtonIds.has(button.id))
))
const uiStyle = computed(() => ({
  '--button-width': `${Sizes.ButtonWidth}px`,
  '--secondary-button-width': `${Sizes.RestartButtonWidth}px`,
  '--button-height': `${Sizes.ButtonHeight}px`,
  '--button-top': `${Sizes.ButtonTop}px`,
  '--button-shadow-offset': `${Sizes.ButtonShadowOffset}px`,
  '--button-border': `${Sizes.ButtonBorder}px`,
  '--button-font-size': `${Sizes.ButtonFontSize}px`,
  '--button-icon-size': `${Sizes.ButtonIconSize}px`,
  '--button-content-gap': `${Sizes.ButtonContentGap}px`,
  '--button-shadow-color': Color4.toRgbaString(Colors.Shadow),
  '--button-pulse-duration': `${Animations.PulseEffectDuration * 2}ms`,
}))

function getButtonStyle(button: GameToolbarButton) {
  return {
    '--button-border-color': button.colors.border,
    '--button-fill-color': button.colors.fill,
    '--button-text-color': button.colors.text,
    '--button-hover-border-color': button.hoverColors.border,
    '--button-hover-fill-color': button.hoverColors.fill,
    '--button-hover-text-color': button.hoverColors.text,
    '--button-pulse-border-color': button.pulseColors.border,
    '--button-pulse-fill-color': button.pulseColors.fill,
    '--button-pulse-text-color': button.pulseColors.text,
  }
}

function clickToolbarButton(button: GameToolbarButton) {
  game?.clickToolbarButton(button.id)
}

async function init() {
  try {
    const renderer = await CanvasRenderer.create(canvas.value!, logger)
    game = new Game({
      renderer,
      logger,
      debug: query.get('debug') === '1',
      onToolbarChange: buttons => {
        toolbarButtons.value = buttons
      },
    })
    game.start()
  }
  catch (err) {
    logger.error(String(err))
    console.error(err)
  }
}

onMounted(init)
onUnmounted(() => game?.dispose())
</script>

<template>
  <div class="game">
    <canvas ref="canvas"></canvas>
    <div
      class="ui-layer"
      :style="uiStyle"
      @mousemove.stop
      @mousedown.stop
      @mouseup.stop
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @contextmenu.prevent.stop
    >
      <div class="toolbar toolbar-primary">
        <button
          v-for="button in primaryButtons"
          :key="button.id"
          class="game-button"
          :class="{ 'is-pulsing': button.effect === 'pulse' && !button.disabled }"
          :style="getButtonStyle(button)"
          :disabled="button.disabled"
          type="button"
          @click="clickToolbarButton(button)"
        >
          <span>{{ button.text }}</span>
          <img
            v-if="button.pieceImageUrl"
            class="piece-icon"
            :src="button.pieceImageUrl"
            alt=""
            draggable="false"
          >
        </button>
      </div>

      <div class="toolbar toolbar-secondary">
        <button
          v-for="button in secondaryButtons"
          :key="button.id"
          class="game-button"
          :class="{ 'is-pulsing': button.effect === 'pulse' && !button.disabled }"
          :style="getButtonStyle(button)"
          :disabled="button.disabled"
          type="button"
          @click="clickToolbarButton(button)"
        >
          <span>{{ button.text }}</span>
          <img
            v-if="button.pieceImageUrl"
            class="piece-icon"
            :src="button.pieceImageUrl"
            alt=""
            draggable="false"
          >
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background-color: #8293b3;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  font-family: Georgia, 'Times New Roman', serif;
}

.toolbar {
  position: absolute;
  display: flex;
  gap: calc(var(--button-content-gap) * 2);
  pointer-events: auto;
}

.toolbar-primary {
  top: var(--button-top);
  left: 50%;
  transform: translateX(-50%);
}

.toolbar-secondary {
  right: var(--button-top);
  bottom: var(--button-top);
}

.game-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--button-content-gap);
  width: var(--button-width);
  height: var(--button-height);
  padding: 0 20px;
  border: var(--button-border) solid var(--button-border-color);
  border-radius: calc(var(--button-height) / 2);
  background: var(--button-fill-color);
  color: var(--button-text-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  font: inherit;
  font-size: var(--button-font-size);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  user-select: none;
}

.toolbar-secondary .game-button {
  width: var(--secondary-button-width);
}

.game-button:not(:disabled):hover,
.game-button:not(:disabled):focus-visible {
  border-color: var(--button-hover-border-color);
  background: var(--button-hover-fill-color);
  color: var(--button-hover-text-color);
}

.game-button:not(:disabled):active {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
}

.game-button:disabled {
  box-shadow: none;
  transform: translateY(var(--button-shadow-offset));
  cursor: default;
}

.game-button.is-pulsing:not(:hover):not(:focus-visible) {
  animation: button-pulse var(--button-pulse-duration) ease-in-out infinite;
}

.piece-icon {
  display: inline-flex;
  width: var(--button-icon-size);
  height: var(--button-icon-size);
  object-fit: contain;
  pointer-events: none;
}

@keyframes button-pulse {
  0%,
  100% {
    border-color: var(--button-border-color);
    background: var(--button-fill-color);
    color: var(--button-text-color);
  }

  50% {
    border-color: var(--button-pulse-border-color);
    background: var(--button-pulse-fill-color);
    color: var(--button-pulse-text-color);
  }
}

.message-list {
  position: absolute;
  right: 1em;
  top: 1em;
  min-width: 33vw;
  max-width: 66vw;
}

.message.error {
  color: #9b3a32;
}
</style>
