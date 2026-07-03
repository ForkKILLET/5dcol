<script setup lang="ts">
import { Player } from '@5dcol/core'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game, GameMinimapBoard, GameMinimapSnapshot } from '@engine/game'
import { Color4, type Rect, type Vec2 } from '@engine/basic'
import { Colors } from '@engine/constant'
import GamePanel from './GamePanel.vue'

interface CanvasRect {
  x: number
  y: number
  w: number
  h: number
}

interface MinimapTransform {
  offset: Vec2
  scale: number
}

const props = defineProps<{
  emptyText: string
  game: Game | null
}>()

const emit = defineEmits<{
  focusBoard: [board: { l: number, m: number }]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const hoveredBoardKey = ref<string | null>(null)

let frameId: number | null = null
let lastHitItems: Array<{ board: GameMinimapBoard, rect: CanvasRect }> = []

onMounted(() => {
  frameId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (frameId !== null) cancelAnimationFrame(frameId)
  frameId = null
})

function loop() {
  draw()
  frameId = requestAnimationFrame(loop)
}

function draw() {
  const canvasElement = canvas.value
  if (! canvasElement) return

  const rect = canvasElement.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const dpr = window.devicePixelRatio || 1
  const pixelWidth = Math.max(1, Math.round(width * dpr))
  const pixelHeight = Math.max(1, Math.round(height * dpr))
  if (canvasElement.width !== pixelWidth || canvasElement.height !== pixelHeight) {
    canvasElement.width = pixelWidth
    canvasElement.height = pixelHeight
  }

  const ctx = canvasElement.getContext('2d')
  if (! ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  lastHitItems = []

  const snapshot = props.game?.getMinimapSnapshot()
  if (! snapshot?.bounds || snapshot.boards.length === 0) return

  const transform = getMinimapTransform(
    snapshot.bounds,
    width,
    height,
    getMinimapWorldPadding(snapshot),
  )
  const colors = getMinimapColors(canvasElement)

  drawGrid(ctx, snapshot, transform, colors)
  drawBoards(ctx, snapshot, transform, colors)
  drawViewport(ctx, snapshot.viewport, transform, colors)
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  snapshot: GameMinimapSnapshot,
  transform: MinimapTransform,
  colors: ReturnType<typeof getMinimapColors>,
) {
  for (const cell of snapshot.gridCells) {
    const rect = worldRectToCanvasRect(cell.rect, transform)
    ctx.fillStyle = cell.white ? colors.gridWhiteFill : colors.gridBlackFill
    fillCanvasRect(ctx, rect)
  }
}

function drawBoards(
  ctx: CanvasRenderingContext2D,
  snapshot: GameMinimapSnapshot,
  transform: MinimapTransform,
  colors: ReturnType<typeof getMinimapColors>,
) {
  const hoverKey = getHoveredBoardKey()

  for (const board of snapshot.boards) {
    const rect = worldRectToCanvasRect(board.rect, transform)
    lastHitItems.push({ board, rect })
    const key = getBoardKey(board)

    ctx.globalAlpha = board.active ? 0.92 : 0.68
    ctx.fillStyle = board.player === Player.W ? colors.boardWhiteFill : colors.boardBlackFill
    fillCanvasRect(ctx, rect)
    ctx.globalAlpha = 1

    if (board.mandatory) {
      ctx.fillStyle = colors.mandatoryFill
      fillCanvasRect(ctx, rect)
    }

    ctx.lineWidth = board.focused || board.active || key === hoverKey ? 2 : 1
    ctx.strokeStyle = board.focused
      ? colors.focusStroke
      : key === hoverKey
        ? colors.hoverStroke
        : board.active
          ? colors.activeStroke
          : colors.boardStroke
    strokeCanvasRect(ctx, rect)
  }
}

function drawViewport(
  ctx: CanvasRenderingContext2D,
  viewport: Rect,
  transform: MinimapTransform,
  colors: ReturnType<typeof getMinimapColors>,
) {
  const rect = worldRectToCanvasRect(viewport, transform)
  ctx.lineWidth = 2
  ctx.strokeStyle = colors.viewportStroke
  strokeCanvasRect(ctx, rect)
}

function getMinimapTransform(
  bounds: Rect,
  width: number,
  height: number,
  paddingWorld: number,
): MinimapTransform {
  const [[x, y], [w, h]] = bounds
  const paddedX = x - paddingWorld
  const paddedY = y - paddingWorld
  const paddedWidth = w + paddingWorld * 2
  const paddedHeight = h + paddingWorld * 2
  const scale = Math.min(
    width / Math.max(1, paddedWidth),
    height / Math.max(1, paddedHeight),
  )
  return {
    scale: Math.max(0.001, scale),
    offset: [
      (width - paddedWidth * scale) / 2 - paddedX * scale,
      (height - paddedHeight * scale) / 2 - paddedY * scale,
    ],
  }
}

function getMinimapWorldPadding(snapshot: GameMinimapSnapshot): number {
  const boardRect = snapshot.boards[0]?.rect
  if (! boardRect) return 0
  return Math.max(boardRect[1][0], boardRect[1][1])
}

function worldRectToCanvasRect([[x, y], [w, h]]: Rect, transform: MinimapTransform): CanvasRect {
  return {
    x: x * transform.scale + transform.offset[0],
    y: y * transform.scale + transform.offset[1],
    w: w * transform.scale,
    h: h * transform.scale,
  }
}

function fillCanvasRect(ctx: CanvasRenderingContext2D, { x, y, w, h }: CanvasRect) {
  ctx.fillRect(x, y, w, h)
}

function strokeCanvasRect(ctx: CanvasRenderingContext2D, { x, y, w, h }: CanvasRect) {
  ctx.strokeRect(x, y, w, h)
}

function getMinimapColors(element: HTMLElement) {
  const style = getComputedStyle(element)
  const participant = getCssColor(style, '--record-participant-color', 'rgba(132, 93, 156, 1)')
  const active = getCssColor(style, '--game-status-color', participant)
  return {
    activeStroke: active,
    boardBlackFill: Color4.toRgbaString(Colors.BoardBlack),
    boardWhiteFill: Color4.toRgbaString(Colors.BoardWhite),
    boardStroke: withAlpha(getCssColor(style, '--button-border-color', 'rgba(39, 39, 39, 1)'), 0.6),
    focusStroke: participant,
    gridBlackFill: withAlpha(Color4.toRgbaString(Colors.BoardTimeBlack), 0.36),
    gridWhiteFill: withAlpha(Color4.toRgbaString(Colors.BoardTimeWhite), 0.36),
    hoverStroke: getCssColor(style, '--button-hover-border-color', 'rgba(152, 180, 149, 1)'),
    mandatoryFill: withAlpha(active, 0.18),
    viewportStroke: participant,
  }
}

function getCssColor(style: CSSStyleDeclaration, name: string, fallback: string) {
  return style.getPropertyValue(name).trim() || fallback
}

function withAlpha(color: string, alpha: number): string {
  const numbers = color.match(/[\d.]+/g)?.map(Number) ?? []
  if (numbers.length < 3) return color
  return `rgba(${numbers[0]}, ${numbers[1]}, ${numbers[2]}, ${alpha})`
}

function handlePointerMove(event: PointerEvent) {
  const board = getBoardAtEvent(event)
  hoveredBoardKey.value = board ? getBoardKey(board) : null
}

function handlePointerLeave() {
  hoveredBoardKey.value = null
}

function handleClick(event: MouseEvent) {
  const board = getBoardAtEvent(event)
  if (! board) return
  emit('focusBoard', { l: board.l, m: board.m })
}

function getBoardAtEvent(event: MouseEvent | PointerEvent): GameMinimapBoard | null {
  const canvasElement = canvas.value
  if (! canvasElement) return null
  const rect = canvasElement.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  for (let index = lastHitItems.length - 1; index >= 0; index--) {
    const item = lastHitItems[index]!
    if (isPointInCanvasRect(x, y, item.rect)) return item.board
  }
  return null
}

function isPointInCanvasRect(x: number, y: number, rect: CanvasRect): boolean {
  const padding = 4
  return (
    x >= rect.x - padding
    && x <= rect.x + rect.w + padding
    && y >= rect.y - padding
    && y <= rect.y + rect.h + padding
  )
}

function getHoveredBoardKey(): string | null {
  return hoveredBoardKey.value
}

function getBoardKey({ l, m }: Pick<GameMinimapBoard, 'l' | 'm'>): string {
  return `${l}:${m}`
}
</script>

<template>
  <GamePanel class="minimap-panel">
    <canvas
      ref="canvas"
      class="minimap-canvas"
      :class="{ 'is-hovering-board': hoveredBoardKey !== null }"
      @click="handleClick"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    ></canvas>
    <div
      v-if="!game"
      class="minimap-empty"
    >
      {{ emptyText }}
    </div>
  </GamePanel>
</template>

<style scoped>
.minimap-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.minimap-canvas {
  display: block;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 120px;
  border-radius: 5px;
  cursor: default;
  touch-action: none;
}

.minimap-canvas.is-hovering-board {
  cursor: pointer;
}

.minimap-empty {
  position: absolute;
  inset: calc(var(--button-content-gap) * 1.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--button-text-color);
  font-size: 18px;
  opacity: 0.68;
  pointer-events: none;
  text-align: center;
}
</style>
