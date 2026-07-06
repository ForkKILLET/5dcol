<script setup lang="ts">
import { Piece, Player } from '@5dcol/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game, GameAxisViewBoardColumn, GameAxisViewMode, GameAxisViewSnapshot } from '@engine/game'
import { getAssetUrl } from '@engine/assets'
import { Color4 } from '@engine/basic'
import { Colors } from '@engine/constant'
import { PIECE_TO_TEXTURE_ID, TEXTURE_ID_TO_NAME } from '@engine/texture'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import GameToggle from './GameToggle.vue'

interface CanvasRect {
  h: number
  w: number
  x: number
  y: number
}

interface AxisViewHitItem {
  column: GameAxisViewBoardColumn
  rect: CanvasRect
}

type AxisViewPlayerFilter = 'black' | 'both' | 'white'

interface VisibleAxisViewColumn {
  column: GameAxisViewBoardColumn
  sourceIndex: number
}

interface AxisViewCanvasLayout {
  bottomLabelY: number
  cellSize: number
  columnXs: number[]
  gridH: number
  gridW: number
  gridX: number
  gridY: number
  rowLabelX: number
  topLabelY: number
}

const props = defineProps<{
  blackLabel: string
  bothLabel: string
  emptyText: string
  game: Game | null
  modeXTLabel: string
  modeYTLabel: string
  whiteLabel: string
}>()

const emit = defineEmits<{
  focusBoard: [board: { l: number, m: number }]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const hoveredBoardKey = ref<string | null>(null)
const fixedCoord = ref(0)
const mode = ref<GameAxisViewMode>('yt')
const playerFilter = ref<AxisViewPlayerFilter>('both')
const maxFixedCoord = ref(7)

let frameId: number | null = null
let lastHitItems: AxisViewHitItem[] = []
const pieceImageCache = new Map<Piece, HTMLImageElement>()

const axisLabel = computed(() => {
  const coord = fixedCoord.value
  return mode.value === 'yt'
    ? getAxisViewFileLabel(coord)
    : `${coord + 1}`
})

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

  const snapshot = props.game?.getAxisViewSnapshot(mode.value, fixedCoord.value)
  if (! snapshot || snapshot.columns.length === 0) return
  if (snapshot.maxFixedCoord !== maxFixedCoord.value) maxFixedCoord.value = snapshot.maxFixedCoord
  if (snapshot.fixedCoord !== fixedCoord.value) fixedCoord.value = snapshot.fixedCoord

  drawSnapshot(ctx, snapshot, width, height, getAxisViewColors(canvasElement))
}

function drawSnapshot(
  ctx: CanvasRenderingContext2D,
  snapshot: GameAxisViewSnapshot,
  width: number,
  height: number,
  colors: ReturnType<typeof getAxisViewColors>,
) {
  const visibleColumns = getVisibleAxisViewColumns(snapshot, playerFilter.value)
  if (visibleColumns.length === 0) return

  const layout = getAxisViewCanvasLayout(width, height, visibleColumns, snapshot.rowLabels.length)
  const hoverKey = hoveredBoardKey.value
  const visibleColumnIndexes = new Map<number, number>()

  ctx.save()
  ctx.font = `${Math.max(10, layout.cellSize * 0.22)}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let columnIndex = 0; columnIndex < visibleColumns.length; columnIndex++) {
    const { column, sourceIndex } = visibleColumns[columnIndex]!
    visibleColumnIndexes.set(sourceIndex, columnIndex)
    const columnRect = getAxisViewColumnRect(layout, columnIndex, snapshot.rowLabels.length)
    lastHitItems.push({ column, rect: columnRect })

    for (let rowIndex = 0; rowIndex < snapshot.rowLabels.length; rowIndex++) {
      const cellRect = getAxisViewCellRect(layout, columnIndex, rowIndex)
      const light = isAxisViewRowLight(snapshot, rowIndex)
      const base = getAxisViewColumnBoardFill(column, visibleColumns, playerFilter.value, colors)
      ctx.fillStyle = light ? base.light : base.dark
      fillCanvasRect(ctx, cellRect)
    }

    if (column.focused || getBoardKey(column) === hoverKey) {
      ctx.fillStyle = colors.columnHighlightFill
      fillCanvasRect(ctx, columnRect)
    }

    ctx.fillStyle = colors.labelText
    ctx.globalAlpha = 0.78
    ctx.fillText(
      column.label,
      columnRect.x + columnRect.w / 2,
      columnIndex % 2 === 0 ? layout.topLabelY : layout.bottomLabelY,
    )
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = colors.labelText
  ctx.globalAlpha = 0.78
  for (let rowIndex = 0; rowIndex < snapshot.rowLabels.length; rowIndex++) {
    ctx.fillText(snapshot.rowLabels[rowIndex]!, layout.rowLabelX, layout.gridY + (rowIndex + 0.5) * layout.cellSize)
  }
  ctx.globalAlpha = 1

  drawPieces(ctx, snapshot, layout, visibleColumnIndexes)
  ctx.restore()
}

function drawPieces(
  ctx: CanvasRenderingContext2D,
  snapshot: GameAxisViewSnapshot,
  layout: AxisViewCanvasLayout,
  visibleColumnIndexes: Map<number, number>,
) {
  for (const pieceCell of snapshot.pieces) {
    const visibleColumnIndex = visibleColumnIndexes.get(pieceCell.columnIndex)
    if (visibleColumnIndex === undefined) continue

    const image = getPieceImage(pieceCell.piece)
    if (! isPieceImageReady(image)) continue

    const cellRect = getAxisViewCellRect(layout, visibleColumnIndex, pieceCell.rowIndex)
    const size = layout.cellSize * 0.88
    const x = cellRect.x + (cellRect.w - size) / 2
    const y = cellRect.y + (cellRect.h - size) / 2
    ctx.drawImage(image, x, y, size, size)
  }
}

function getAxisViewCanvasLayout(
  width: number,
  height: number,
  visibleColumns: VisibleAxisViewColumn[],
  rowCount: number,
): AxisViewCanvasLayout {
  const left = 26
  const right = 8
  const top = 26
  const bottom = 28
  const columnCount = visibleColumns.length
  const cellSize = Math.max(12, Math.min(
    (width - left - right) / Math.max(1, columnCount),
    (height - top - bottom) / Math.max(1, rowCount),
  ))
  const gridW = cellSize * columnCount
  const gridH = cellSize * rowCount
  const gridX = Math.max(left, left + (width - left - right - gridW) / 2)
  const gridY = Math.max(top, top + (height - top - bottom - gridH) / 2)
  const columnXs = getAxisViewColumnXs(visibleColumns, gridX, cellSize)
  return {
    cellSize,
    columnXs,
    gridH,
    gridW,
    gridX,
    gridY,
    bottomLabelY: gridY + gridH + bottom * 0.52,
    rowLabelX: Math.max(10, left * 0.48),
    topLabelY: Math.max(10, gridY - top * 0.48),
  }
}

function fillCanvasRect(ctx: CanvasRenderingContext2D, { x, y, w, h }: CanvasRect) {
  ctx.fillRect(x, y, w, h)
}

function getAxisViewCellRect(
  layout: AxisViewCanvasLayout,
  columnIndex: number,
  rowIndex: number,
): CanvasRect {
  const x0 = getAxisViewColumnEdge(layout, columnIndex)
  const x1 = getAxisViewColumnEdge(layout, columnIndex + 1)
  const y0 = getAxisViewRowEdge(layout, rowIndex)
  const y1 = getAxisViewRowEdge(layout, rowIndex + 1)
  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0),
  }
}

function getAxisViewColumnRect(
  layout: AxisViewCanvasLayout,
  columnIndex: number,
  rowCount: number,
): CanvasRect {
  const x0 = getAxisViewColumnEdge(layout, columnIndex)
  const x1 = getAxisViewColumnEdge(layout, columnIndex + 1)
  const y0 = getAxisViewRowEdge(layout, 0)
  const y1 = getAxisViewRowEdge(layout, rowCount)
  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0),
  }
}

function getAxisViewColumnEdge(layout: AxisViewCanvasLayout, index: number): number {
  return Math.round(layout.gridX + index * layout.cellSize)
}

function getAxisViewRowEdge(layout: AxisViewCanvasLayout, index: number): number {
  return Math.round(layout.gridY + index * layout.cellSize)
}

function isAxisViewRowLight(snapshot: GameAxisViewSnapshot, rowIndex: number): boolean {
  const rowCoord = getAxisViewRowCoord(snapshot, rowIndex)
  return (snapshot.fixedCoord + rowCoord) % 2 === 0
}

function getAxisViewRowCoord(snapshot: GameAxisViewSnapshot, rowIndex: number): number {
  const size = snapshot.mode === 'yt'
    ? snapshot.boardSize.height
    : snapshot.boardSize.width
  return Math.max(0, size - rowIndex - 1)
}

function getAxisViewColors(element: HTMLElement) {
  const style = getComputedStyle(element)
  return {
    dimBoardFill: {
      dark: withAlpha(Color4.toRgbaString(Colors.BoardTimeBlack), 0.8),
      light: withAlpha(Color4.toRgbaString(Colors.BoardTimeWhite), 0.9),
    },
    originalBoardFill: {
      dark: Color4.toRgbaString(Colors.BoardBlack),
      light: Color4.toRgbaString(Colors.BoardWhite),
    },
    columnHighlightFill: withAlpha(Color4.toRgbaString(Colors.BoardHighlightWhite), 0.58),
    labelText: getCssColor(style, '--button-text-color', 'rgba(244, 245, 237, 1)'),
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

function getPieceImage(piece: Piece): HTMLImageElement | null {
  const cached = pieceImageCache.get(piece)
  if (cached) return cached

  const textureId = PIECE_TO_TEXTURE_ID.get(piece)
  const textureName = textureId === undefined ? undefined : TEXTURE_ID_TO_NAME.get(textureId)
  if (! textureName) return null

  const image = new Image()
  image.decoding = 'async'
  image.addEventListener('load', draw, { once: true })
  image.src = getAssetUrl(`assets/textures/${textureName}`)
  pieceImageCache.set(piece, image)
  return image
}

function isPieceImageReady(image: HTMLImageElement | null): image is HTMLImageElement {
  return image !== null && image.complete && image.naturalWidth > 0
}

function getVisibleAxisViewColumns(
  snapshot: GameAxisViewSnapshot,
  filter: AxisViewPlayerFilter,
): VisibleAxisViewColumn[] {
  return snapshot.columns
    .map((column, sourceIndex) => ({ column, sourceIndex }))
    .filter(({ column }) => (
      filter === 'both'
      || (filter === 'white' && column.player === Player.W)
      || (filter === 'black' && column.player === Player.B)
    ))
}

function getAxisViewColumnXs(
  visibleColumns: VisibleAxisViewColumn[],
  gridX: number,
  cellSize: number,
): number[] {
  const columnXs: number[] = []
  let x = gridX
  for (let index = 0; index < visibleColumns.length; index++) {
    columnXs.push(x)
    x += cellSize
  }
  return columnXs
}

function getAxisViewColumnBoardFill(
  column: GameAxisViewBoardColumn,
  visibleColumns: VisibleAxisViewColumn[],
  filter: AxisViewPlayerFilter,
  colors: ReturnType<typeof getAxisViewColors>,
) {
  if (filter !== 'both') return colors.originalBoardFill

  const activePlayers = getActiveAxisViewPlayers(visibleColumns)
  if (activePlayers.size === 0) return colors.originalBoardFill
  return activePlayers.has(column.player)
    ? colors.originalBoardFill
    : colors.dimBoardFill
}

function getActiveAxisViewPlayers(visibleColumns: VisibleAxisViewColumn[]): Set<Player> {
  const players = new Set<Player>()
  for (const { column } of visibleColumns) {
    if (column.active) players.add(column.player)
  }
  return players
}

function handleModeClick(nextMode: GameAxisViewMode) {
  mode.value = nextMode
}

function stepFixedCoord(delta: number) {
  fixedCoord.value = Math.max(0, Math.min(maxFixedCoord.value, fixedCoord.value + delta))
}

function getAxisViewFileLabel(file: number): string {
  return String.fromCharCode('a'.charCodeAt(0) + file)
}

function handlePointerMove(event: PointerEvent) {
  const column = getColumnAtEvent(event)
  hoveredBoardKey.value = column ? getBoardKey(column) : null
}

function handlePointerLeave() {
  hoveredBoardKey.value = null
}

function handleClick(event: MouseEvent) {
  const column = getColumnAtEvent(event)
  if (! column) return
  emit('focusBoard', { l: column.l, m: column.m })
}

function getColumnAtEvent(event: MouseEvent | PointerEvent): GameAxisViewBoardColumn | null {
  const canvasElement = canvas.value
  if (! canvasElement) return null
  const rect = canvasElement.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  for (let index = lastHitItems.length - 1; index >= 0; index--) {
    const item = lastHitItems[index]!
    if (isPointInCanvasRect(x, y, item.rect)) return item.column
  }
  return null
}

function isPointInCanvasRect(x: number, y: number, rect: CanvasRect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

function getBoardKey({ l, m }: Pick<GameAxisViewBoardColumn, 'l' | 'm'>): string {
  return `${l}:${m}`
}
</script>

<template>
  <GamePanel class="axis-view-panel">
    <div class="axis-view-toolbar">
      <div class="axis-view-mode-tabs">
        <GameTab
          :pressed="mode === 'yt'"
          @click="handleModeClick('yt')"
        >
          {{ modeYTLabel }}
        </GameTab>
        <GameTab
          :pressed="mode === 'xt'"
          @click="handleModeClick('xt')"
        >
          {{ modeXTLabel }}
        </GameTab>
      </div>
      <div class="axis-view-player-filter">
        <GameToggle
          v-model="playerFilter"
          type="radio"
          size="small"
          value="black"
        >
          {{ blackLabel }}
        </GameToggle>
        <GameToggle
          v-model="playerFilter"
          type="radio"
          size="small"
          value="white"
        >
          {{ whiteLabel }}
        </GameToggle>
        <GameToggle
          v-model="playerFilter"
          type="radio"
          size="small"
          value="both"
        >
          {{ bothLabel }}
        </GameToggle>
      </div>
      <div class="axis-view-axis-control">
        <GameButton
          size="tiny"
          shape="circle"
          :disabled="fixedCoord <= 0"
          @click="stepFixedCoord(-1)"
        >
          <GameIcon name="chevron-left" />
        </GameButton>
        <span>{{ axisLabel }}</span>
        <GameButton
          size="tiny"
          shape="circle"
          :disabled="fixedCoord >= maxFixedCoord"
          @click="stepFixedCoord(1)"
        >
          <GameIcon name="chevron-right" />
        </GameButton>
      </div>
    </div>
    <canvas
      ref="canvas"
      class="axis-view-canvas"
      :class="{ 'is-hovering-board': hoveredBoardKey !== null }"
      @click="handleClick"
      @pointermove="handlePointerMove"
      @pointerleave="handlePointerLeave"
    ></canvas>
    <div
      v-if="!game"
      class="axis-view-empty"
    >
      {{ emptyText }}
    </div>
  </GamePanel>
</template>

<style scoped>
.axis-view-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.axis-view-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--button-content-gap);
  min-width: 0;
}

.axis-view-mode-tabs {
  display: flex;
  min-width: 0;
  gap: calc(var(--button-content-gap) * 0.75);
}

.axis-view-mode-tabs :deep(.game-tab) {
  min-width: 48px;
  height: var(--button-tiny-height);
  padding: 0 8px;
  border-width: var(--button-tiny-border);
  font-size: var(--button-tiny-font-size);
}

.axis-view-player-filter {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.8);
  min-width: 0;
}

.axis-view-player-filter :deep(.game-toggle) {
  font-size: 14px;
}

.axis-view-axis-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 0.5);
  margin-left: auto;
  font-size: 18px;
  line-height: 1;
  white-space: nowrap;
}

.axis-view-axis-control :deep(.game-button) {
  width: var(--button-tiny-height);
  min-width: var(--button-tiny-height);
}

.axis-view-canvas {
  display: block;
  flex: 1 1 auto;
  align-self: stretch;
  width: 100%;
  min-height: 0;
  border-radius: 5px;
  cursor: default;
  touch-action: none;
}

.axis-view-canvas.is-hovering-board {
  cursor: pointer;
}

.axis-view-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--button-content-gap);
  color: var(--button-text-color);
  font-size: 22px;
  text-align: center;
  opacity: 0.72;
  pointer-events: none;
}
</style>
