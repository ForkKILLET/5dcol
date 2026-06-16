<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Player } from '@5dcol/core'
import { getAssetUrl } from '@engine/assets'
import { Color4, Scalar } from '@engine/basic'
import { Colors } from '@engine/constant'
import { getMainArrowPoints, type MainMenuLayout } from '@engine/mainMenuLayout'
import Card from './Card.vue'

type MainMenuMode = 'home' | 'versus' | 'study'

const props = defineProps<{
  visible: boolean
  mode: MainMenuMode
  width: number
  height: number
  layout: MainMenuLayout
}>()

const emit = defineEmits<{
  interact: []
  uiSound: []
  annihilateSound: []
}>()

const { t } = useI18n({ useScope: 'global' })

const canvas = useTemplateRef('canvas')
const annihilationScore = ref(0)
const annihilationVisible = computed(() => annihilationScore.value > 0)

let vortexCycle = 0
let frameTime = performance.now()
let animationFrame: number | null = null
let animationStartedAt = 0
let pieceSpawnTimer: number | null = null
let flyingPieceId = 0
let selectedFlyingPieceId: number | null = null
let vortexBufferCanvas: HTMLCanvasElement | null = null
const pieceImageCache = new Map<string, HTMLImageElement>()
const pieceHitMaskCache = new Map<string, MainMenuPieceHitMask | null>()

const MAIN_VORTEX_CONFIG = {
  centerXRatio: 0.5,
  centerYRatio: 0.51,
  renderScale: 0.5,
  innerRadius: 4,
  outerRadiusScale: 1.65,
  ringCount: 42,
  sectorCount: 8,
  twistPerRing: 0.24,
  direction: 1,
  durationSeconds: 3,
  glowRadiusScale: 0.36,
  glowOpacity: 1,
  layerOpacity: 0.86,
  radiusGrowth: 7.5,
  tileInnerOpacity: 0.24,
  tileOuterOpacity: 0.82,
  tileCoreSkipRadiusScale: 0.055,
  tileCoreFadeRadiusScale: 0.065,
  vignetteRadiusScale: 0.9,
  vignetteOpacity: 0.46,
}

const MAIN_MENU_PIECE_ASSETS = [
  'PW', 'NW', 'BW', 'RW', 'QW', 'KW',
  'PB', 'NB', 'BB', 'RB', 'QB', 'KB',
].map(piece => ({
  key: piece.slice(0, 1),
  player: piece.endsWith('W') ? Player.W : Player.B,
  imageUrl: getAssetUrl(`assets/textures/pieces/${piece}.svg`),
}))

const MAIN_MENU_ANNIHILATION_FADE_MS = 260
const MAIN_MENU_PIECE_HIT_MASK_SIZE = 128
const MAIN_MENU_PIECE_HIT_ALPHA_THRESHOLD = 24

const MAIN_MENU_FLYING_PIECE_CONFIG = {
  maxPieces: 24,
  colorBalanceStrength: 0.12,
  colorBalanceMaxBias: 0.38,
  spawnDelayMinMs: 500,
  spawnDelayMaxMs: 1000,
  durationMinMs: 7500,
  durationMaxMs: 7500,
  centerRadiusMin: 3,
  centerRadiusScale: 0.022,
  screenPlaneDistanceRatioMin: 1.20,
  screenPlaneDistanceRatioMax: 2.00,
  baseSizeScale: 0.05,
  baseSizeMin: 36,
  baseSizeMax: 80,
  startScaleMin: 0.20,
  startScaleMax: 0.28,
  endScaleMin: 20,
  endScaleMax: 30,
  bezierX1: 0.95,
  bezierY1: 0,
  bezierX2: 1,
  bezierY2: 0,
  screenPlaneFadeStart: 0.62,
  spinMinTurns: 0.5,
  spinMaxTurns: 1.0,
}

interface MainMenuFlyingPiece {
  id: number
  key: string
  player: Player
  imageUrl: string
  startedAt: number
  durationMs: number
  baseSize: number
  startX: number
  startY: number
  endX: number
  endY: number
  startScale: number
  endScale: number
  startRotate: number
  endRotate: number
  annihilatedAt: number | null
}

interface MainMenuFlyingPieceFrame {
  x: number
  y: number
  scale: number
  rotate: number
  opacity: number
  visualSize: number
}

interface MainMenuPieceHitMask {
  data: Uint8ClampedArray
  size: number
}

interface MainVortexTile {
  batchIndex: number
  innerRadius: number
  outerRadius: number
  innerStart: number
  innerEnd: number
  outerStart: number
  outerEnd: number
  tone: 'light' | 'dark'
  opacity: number
}

interface MainVortexTileBatch {
  tone: MainVortexTile['tone']
  opacity: number
  tiles: MainVortexTile[]
}

interface MainVortexGeometry {
  centerX: number
  centerY: number
  glowRadius: number
  vignetteRadius: number
  tiles: MainVortexTile[]
}

const flyingPieces = ref<MainMenuFlyingPiece[]>([])

function startAnimation() {
  if (animationFrame !== null) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    frameTime = performance.now()
    drawCanvas(frameTime)
    return
  }

  const durationMs = Math.max(1, MAIN_VORTEX_CONFIG.durationSeconds * 1000)
  animationStartedAt = performance.now() - vortexCycle * durationMs

  const update = (time: number) => {
    const elapsedCycles = (time - animationStartedAt) / durationMs
    frameTime = time
    vortexCycle = elapsedCycles
    drawCanvas(time)
    animationFrame = window.requestAnimationFrame(update)
  }

  animationFrame = window.requestAnimationFrame(update)
}

function stopAnimation() {
  if (animationFrame === null) return
  window.cancelAnimationFrame(animationFrame)
  animationFrame = null
}

function startFlyingPieces() {
  if (pieceSpawnTimer !== null) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (props.mode !== 'home') return
  schedulePieceSpawn(160)
}

function stopPieceSpawn() {
  if (pieceSpawnTimer !== null) {
    window.clearTimeout(pieceSpawnTimer)
    pieceSpawnTimer = null
  }
}

function stopFlyingPieces() {
  stopPieceSpawn()
  selectedFlyingPieceId = null
  flyingPieces.value = []
  resetAnnihilation()
}

function schedulePieceSpawn(delay = randomBetween(
  MAIN_MENU_FLYING_PIECE_CONFIG.spawnDelayMinMs,
  MAIN_MENU_FLYING_PIECE_CONFIG.spawnDelayMaxMs,
)) {
  if (! props.visible || props.mode !== 'home' || pieceSpawnTimer !== null) return
  pieceSpawnTimer = window.setTimeout(() => {
    pieceSpawnTimer = null
    spawnFlyingPiece()
    schedulePieceSpawn()
  }, delay)
}

function spawnFlyingPiece() {
  if (! props.visible) return
  const config = MAIN_MENU_FLYING_PIECE_CONFIG
  const width = props.width
  const height = props.height
  const now = performance.now()
  frameTime = now
  const geometry = getVortexGeometry(width, height, props.layout.scale, vortexCycle)
  const startAngle = randomBetween(0, Math.PI * 2)
  const startRadius = Math.sqrt(Math.random()) * Math.max(
    config.centerRadiusMin,
    Math.min(width, height) * config.centerRadiusScale,
  )
  const startX = geometry.centerX + Math.cos(startAngle) * startRadius
  const startY = geometry.centerY + Math.sin(startAngle) * startRadius
  const flyAngle = randomBetween(0, Math.PI * 2)
  const baseSize = getPieceBaseSize(width, height)
  const durationMs = randomBetween(config.durationMinMs, config.durationMaxMs)
  const startScale = randomBetween(config.startScaleMin, config.startScaleMax)
  const endScale = randomBetween(config.endScaleMin, config.endScaleMax)
  const edgeDistance = getDistanceToViewportEdge(startX, startY, flyAngle, width, height)
  const endDistance = edgeDistance * randomBetween(
    config.screenPlaneDistanceRatioMin,
    config.screenPlaneDistanceRatioMax,
  )
  const endX = startX + Math.cos(flyAngle) * endDistance
  const endY = startY + Math.sin(flyAngle) * endDistance
  const startRotate = randomBetween(0, 360)
  const spinDirection = Math.random() < 0.5 ? -1 : 1
  const endRotate = startRotate + spinDirection * 360 * randomBetween(config.spinMinTurns, config.spinMaxTurns)
  const asset = getBalancedPieceAsset()
  const piece: MainMenuFlyingPiece = {
    id: ++ flyingPieceId,
    key: asset.key,
    player: asset.player,
    imageUrl: asset.imageUrl,
    startedAt: now,
    durationMs,
    baseSize,
    startX,
    startY,
    endX,
    endY,
    startScale,
    endScale,
    startRotate,
    endRotate,
    annihilatedAt: null,
  }

  flyingPieces.value = [
    ...flyingPieces.value.slice(-config.maxPieces + 1),
    piece,
  ]
  window.setTimeout(() => removeFlyingPiece(piece.id), durationMs + 100)
}

function getBalancedPieceAsset() {
  const livePieces = flyingPieces.value.filter(piece => piece.annihilatedAt === null)
  const whiteCount = livePieces.filter(piece => piece.player === Player.W).length
  const blackCount = livePieces.length - whiteCount
  const whiteProbability = Scalar.clamp(
    0.5 + (blackCount - whiteCount) * MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceStrength,
    0.5 - MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceMaxBias,
    0.5 + MAIN_MENU_FLYING_PIECE_CONFIG.colorBalanceMaxBias,
  )
  const player = Math.random() < whiteProbability ? Player.W : Player.B
  const assets = MAIN_MENU_PIECE_ASSETS.filter(asset => asset.player === player)
  return assets[Math.floor(Math.random() * assets.length)] ?? MAIN_MENU_PIECE_ASSETS[0]
}

function removeFlyingPiece(id: number) {
  flyingPieces.value = flyingPieces.value.filter(piece => piece.id !== id)
  if (selectedFlyingPieceId === id) selectedFlyingPieceId = null
}

function remapFlyingPiecesForResize(
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
) {
  if (oldWidth <= 0 || oldHeight <= 0 || newWidth <= 0 || newHeight <= 0) return
  if (flyingPieces.value.length === 0) return

  const oldCenter = getVortexCenter(oldWidth, oldHeight)
  const newCenter = getVortexCenter(newWidth, newHeight)
  const scaleX = newWidth / oldWidth
  const scaleY = newHeight / oldHeight
  const oldPieceBaseSize = getPieceBaseSize(oldWidth, oldHeight)
  const newPieceBaseSize = getPieceBaseSize(newWidth, newHeight)
  const baseSizeScale = oldPieceBaseSize > 0 ? newPieceBaseSize / oldPieceBaseSize : 1

  flyingPieces.value = flyingPieces.value.map(piece => {
    const [startX, startY] = remapPointForResize(
      [piece.startX, piece.startY],
      oldCenter,
      newCenter,
      scaleX,
      scaleY,
    )
    const [endX, endY] = remapPointForResize(
      [piece.endX, piece.endY],
      oldCenter,
      newCenter,
      scaleX,
      scaleY,
    )

    return {
      ...piece,
      baseSize: piece.baseSize * baseSizeScale,
      startX,
      startY,
      endX,
      endY,
    }
  })
}

function getVortexCenter(width: number, height: number): [number, number] {
  return [
    width * MAIN_VORTEX_CONFIG.centerXRatio,
    height * MAIN_VORTEX_CONFIG.centerYRatio,
  ]
}

function getPieceBaseSize(width: number, height: number) {
  const config = MAIN_MENU_FLYING_PIECE_CONFIG
  return Math.min(
    config.baseSizeMax,
    Math.max(config.baseSizeMin, Math.min(width, height) * config.baseSizeScale),
  )
}

function remapPointForResize(
  point: [number, number],
  oldCenter: [number, number],
  newCenter: [number, number],
  scaleX: number,
  scaleY: number,
): [number, number] {
  return [
    newCenter[0] + (point[0] - oldCenter[0]) * scaleX,
    newCenter[1] + (point[1] - oldCenter[1]) * scaleY,
  ]
}

function drawCanvas(time: number) {
  const canvasElement = canvas.value
  if (! canvasElement || ! props.visible) return

  const width = props.width
  const height = props.height
  if (width <= 0 || height <= 0) return

  const dpr = window.devicePixelRatio || 1
  const widthDevice = Math.floor(width * dpr)
  const heightDevice = Math.floor(height * dpr)
  if (canvasElement.width !== widthDevice || canvasElement.height !== heightDevice) {
    canvasElement.width = widthDevice
    canvasElement.height = heightDevice
  }
  canvasElement.style.width = `${width}px`
  canvasElement.style.height = `${height}px`

  const ctx = canvasElement.getContext('2d')
  if (! ctx) return

  frameTime = time
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#7889aa'
  ctx.fillRect(0, 0, width, height)

  const geometry = getVortexGeometry(width, height, props.layout.scale, vortexCycle)
  drawVortexLayer(ctx, geometry, width, height, dpr)
  drawFlyingPieces(ctx)
  if (props.mode === 'home') drawArrow(ctx, props.layout)
}

function getVortexGeometry(width: number, height: number, scale: number, cycle: number): MainVortexGeometry {
  const config = MAIN_VORTEX_CONFIG
  const cycleOffset = Math.floor(cycle)
  const phase = cycle - cycleOffset
  const centerX = width * config.centerXRatio
  const centerY = height * config.centerYRatio
  const maxDistance = Math.hypot(
    Math.max(centerX, width - centerX),
    Math.max(centerY, height - centerY),
  )
  const innerRadius = Math.max(6, config.innerRadius * scale)
  const outerRadius = maxDistance * config.outerRadiusScale
  const ringCount = config.ringCount
  const sectorCount = config.sectorCount
  const sectorStep = Math.PI * 2 / sectorCount
  const twistStep = config.twistPerRing * config.direction
  const coreSkipRadius = Math.min(width, height) * config.tileCoreSkipRadiusScale
  const coreFadeRadius = Math.max(1, Math.min(width, height) * config.tileCoreFadeRadiusScale)
  const tiles: MainVortexTile[] = []
  const ringBuffer = 3

  for (let ring = -ringBuffer; ring < ringCount + ringBuffer; ring ++) {
    const innerCoord = ring + phase
    const outerCoord = ring + 1 + phase
    const innerTwist = innerCoord * twistStep
    const outerTwist = outerCoord * twistStep
    const inner = getVortexRadiusAt(innerRadius, outerRadius, ringCount, config.radiusGrowth, innerCoord)
    const outer = getVortexRadiusAt(innerRadius, outerRadius, ringCount, config.radiusGrowth, outerCoord)
    if (outer <= coreSkipRadius) continue

    const clippedInner = Math.max(inner, coreSkipRadius)
    const innerClipProgress = getVortexRadiusProgress(inner, outer, clippedInner)
    const clippedInnerTwist = Scalar.lerp(innerTwist, outerTwist, innerClipProgress)
    const coreFadeOpacity = smoothStep(Scalar.clamp((outer - coreSkipRadius) / coreFadeRadius, 0, 1))
    const ringOpacity = getVortexTileOpacity(
      (innerCoord + outerCoord) / 2,
      ringCount,
      config.tileInnerOpacity,
      config.tileOuterOpacity,
    ) * coreFadeOpacity
    if (ringOpacity <= 0.001) continue

    for (let sector = 0; sector < sectorCount; sector ++) {
      const innerStart = sector * sectorStep + clippedInnerTwist
      const innerEnd = (sector + 1) * sectorStep + clippedInnerTwist
      const outerStart = sector * sectorStep + outerTwist
      const outerEnd = (sector + 1) * sectorStep + outerTwist
      tiles.push({
        batchIndex: ring,
        innerRadius: clippedInner,
        outerRadius: outer,
        innerStart,
        innerEnd,
        outerStart,
        outerEnd,
        tone: isEven(ring + sector + cycleOffset) ? 'light' : 'dark',
        opacity: ringOpacity,
      })
    }
  }

  return {
    centerX,
    centerY,
    glowRadius: Math.max(width, height) * config.glowRadiusScale,
    vignetteRadius: Math.max(width, height) * config.vignetteRadiusScale,
    tiles,
  }
}

function getVortexRadiusAt(
  innerRadius: number,
  outerRadius: number,
  ringCount: number,
  radiusGrowth: number,
  ringCoord: number,
) {
  const denominator = Math.expm1(radiusGrowth)
  const t = ringCoord / ringCount
  const eased = denominator === 0
    ? t
    : Math.expm1(radiusGrowth * t) / denominator
  return Math.max(0.1, innerRadius + (outerRadius - innerRadius) * eased)
}

function getVortexRadiusProgress(innerRadius: number, outerRadius: number, radius: number) {
  if (outerRadius <= innerRadius) return 0
  if (radius <= innerRadius) return 0
  if (radius >= outerRadius) return 1

  return Math.log(radius / innerRadius) / Math.log(outerRadius / innerRadius)
}

function getVortexTileOpacity(
  ringCoord: number,
  ringCount: number,
  innerOpacity: number,
  outerOpacity: number,
) {
  const t = Scalar.clamp(ringCoord / ringCount, 0, 1)
  const eased = Math.sqrt(t)
  return Scalar.lerp(innerOpacity, outerOpacity, eased)
}

function drawVortexLayer(
  ctx: CanvasRenderingContext2D,
  geometry: MainVortexGeometry,
  width: number,
  height: number,
  dpr: number,
) {
  const renderScale = Scalar.clamp(MAIN_VORTEX_CONFIG.renderScale, 0.1, 1)
  if (renderScale >= 0.999) {
    drawVortex(ctx, geometry, width, height)
    return
  }

  const buffer = getVortexBufferCanvas()
  const bufferWidth = Math.max(1, Math.floor(width * dpr * renderScale))
  const bufferHeight = Math.max(1, Math.floor(height * dpr * renderScale))
  if (buffer.width !== bufferWidth || buffer.height !== bufferHeight) {
    buffer.width = bufferWidth
    buffer.height = bufferHeight
  }

  const bufferCtx = buffer.getContext('2d')
  if (! bufferCtx) {
    drawVortex(ctx, geometry, width, height)
    return
  }

  const bufferScale = dpr * renderScale
  bufferCtx.setTransform(bufferScale, 0, 0, bufferScale, 0, 0)
  bufferCtx.clearRect(0, 0, width, height)
  drawVortex(bufferCtx, geometry, width, height)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(buffer, 0, 0, width, height)
  ctx.restore()
}

function getVortexBufferCanvas() {
  if (vortexBufferCanvas) return vortexBufferCanvas

  vortexBufferCanvas = document.createElement('canvas')
  return vortexBufferCanvas
}

function drawVortex(
  ctx: CanvasRenderingContext2D,
  geometry: MainVortexGeometry,
  width: number,
  height: number,
) {
  const config = MAIN_VORTEX_CONFIG

  ctx.save()
  ctx.globalAlpha = config.layerOpacity * config.glowOpacity
  const glow = ctx.createRadialGradient(
    geometry.centerX,
    geometry.centerY,
    0,
    geometry.centerX,
    geometry.centerY,
    geometry.glowRadius,
  )
  glow.addColorStop(0, 'rgba(238, 242, 249, 0.96)')
  glow.addColorStop(0.18, 'rgba(219, 228, 241, 0.62)')
  glow.addColorStop(0.62, 'rgba(181, 195, 218, 0.16)')
  glow.addColorStop(1, 'rgba(112, 130, 163, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  ctx.save()
  const batches = getVortexTileBatches(geometry.tiles)
  for (const batch of batches) {
    ctx.globalAlpha = config.layerOpacity * batch.opacity
    ctx.fillStyle = getVortexTileFillStyle(batch.tone)
    ctx.beginPath()
    for (const tile of batch.tiles) {
      addVortexTilePath(ctx, geometry.centerX, geometry.centerY, tile)
    }
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = config.layerOpacity
  const vignette = ctx.createRadialGradient(
    geometry.centerX,
    geometry.centerY,
    0,
    geometry.centerX,
    geometry.centerY,
    geometry.vignetteRadius,
  )
  vignette.addColorStop(0, 'rgba(118, 136, 169, 0)')
  vignette.addColorStop(0.56, 'rgba(118, 136, 169, 0)')
  vignette.addColorStop(1, `rgba(55, 68, 96, ${config.vignetteOpacity})`)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function getVortexTileBatches(tiles: MainVortexTile[]): MainVortexTileBatch[] {
  const batches: MainVortexTileBatch[] = []
  let lastBatchIndex: number | null = null
  let lightBatch: MainVortexTileBatch | null = null
  let darkBatch: MainVortexTileBatch | null = null

  for (const tile of tiles) {
    if (lastBatchIndex !== tile.batchIndex) {
      lastBatchIndex = tile.batchIndex
      lightBatch = { tone: 'light', opacity: tile.opacity, tiles: [] }
      darkBatch = { tone: 'dark', opacity: tile.opacity, tiles: [] }
      batches.push(lightBatch, darkBatch)
    }

    const batch = tile.tone === 'light' ? lightBatch : darkBatch
    batch?.tiles.push(tile)
  }

  return batches.filter(batch => batch.tiles.length > 0)
}

function getVortexTileFillStyle(tone: MainVortexTile['tone']) {
  return tone === 'light'
    ? 'rgba(190, 202, 222, 0.24)'
    : 'rgba(82, 101, 136, 0.18)'
}

function addVortexTilePath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tile: MainVortexTile,
) {
  const innerStartPoint = polarPoint(centerX, centerY, tile.innerRadius, tile.innerStart)
  ctx.moveTo(innerStartPoint[0], innerStartPoint[1])
  addLogSpiralCubicPath(ctx, centerX, centerY, tile.innerRadius, tile.innerStart, tile.outerRadius, tile.outerStart)
  ctx.arc(centerX, centerY, tile.outerRadius, tile.outerStart, tile.outerEnd, false)
  addLogSpiralCubicPath(ctx, centerX, centerY, tile.outerRadius, tile.outerEnd, tile.innerRadius, tile.innerEnd)
  ctx.arc(centerX, centerY, tile.innerRadius, tile.innerEnd, tile.innerStart, true)
  ctx.closePath()
}

function drawFlyingPieces(ctx: CanvasRenderingContext2D) {
  const pieces = flyingPieces.value
    .map(piece => ({ piece, frame: getFlyingPieceFrame(piece) }))
    .sort((a, b) => a.frame.visualSize - b.frame.visualSize)

  for (const { piece, frame } of pieces) {
    if (frame.opacity <= 0) continue
    const image = getPieceImage(piece.imageUrl)
    if (! image.complete || image.naturalWidth <= 0) continue

    ctx.save()
    ctx.globalAlpha = frame.opacity
    ctx.translate(frame.x, frame.y)
    ctx.rotate(frame.rotate * Math.PI / 180)
    ctx.scale(frame.scale, frame.scale)
    ctx.drawImage(image, -piece.baseSize / 2, -piece.baseSize / 2, piece.baseSize, piece.baseSize)
    ctx.restore()
  }
}

function getPieceImage(url: string) {
  let image = pieceImageCache.get(url)
  if (image) return image

  image = new Image()
  image.decoding = 'async'
  image.onload = () => drawCanvas(frameTime)
  image.src = url
  pieceImageCache.set(url, image)
  return image
}

function drawArrow(ctx: CanvasRenderingContext2D, layout: MainMenuLayout) {
  const points = getMainArrowPoints(layout.arrowWidth, layout.arrowHeight, layout.arrowBorderWidth)
  if (points.length === 0) return

  ctx.save()
  ctx.translate(layout.centerX - layout.arrowWidth / 2, layout.areaTop)
  ctx.globalAlpha = 0.82
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1])
  ctx.closePath()
  ctx.fillStyle = Color4.toRgbaString(Colors.Purple)
  ctx.strokeStyle = Color4.toRgbaString(Colors.PurpleDark)
  ctx.lineJoin = 'miter'
  ctx.lineWidth = layout.arrowBorderWidth
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function handlePointerDown(event: PointerEvent) {
  emit('interact')
  const canvasElement = canvas.value
  if (! canvasElement) return

  const rect = canvasElement.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const piece = pickFlyingPiece(x, y)
  if (! piece) {
    updateCursorAt(x, y)
    return
  }

  emit('uiSound')
  clickFlyingPiece(piece)
  updateCursorAt(x, y)
}

function handlePointerMove(event: PointerEvent) {
  const canvasElement = canvas.value
  if (! canvasElement) return

  const rect = canvasElement.getBoundingClientRect()
  updateCursorAt(event.clientX - rect.left, event.clientY - rect.top)
}

function handlePointerLeave() {
  if (! canvas.value) return
  canvas.value.style.cursor = ''
}

function updateCursorAt(x: number, y: number) {
  const canvasElement = canvas.value
  if (! canvasElement) return

  canvasElement.style.cursor = pickFlyingPiece(x, y) ? 'pointer' : ''
}

function pickFlyingPiece(x: number, y: number): MainMenuFlyingPiece | null {
  const candidates = flyingPieces.value
    .filter(piece => piece.annihilatedAt === null)
    .map(piece => ({ piece, frame: getFlyingPieceFrame(piece) }))
    .filter(({ frame }) => frame.opacity > 0.18)
    .sort((a, b) => b.frame.visualSize - a.frame.visualSize)

  for (const { piece, frame } of candidates) {
    if (isPointInFlyingPiece(x, y, piece, frame)) return piece
  }

  return null
}

function isPointInFlyingPiece(
  x: number,
  y: number,
  piece: MainMenuFlyingPiece,
  frame: MainMenuFlyingPieceFrame,
) {
  const dx = x - frame.x
  const dy = y - frame.y
  const angle = frame.rotate * Math.PI / 180
  const localX = (dx * Math.cos(angle) + dy * Math.sin(angle)) / frame.scale
  const localY = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / frame.scale
  const halfSize = piece.baseSize / 2
  if (Math.abs(localX) > halfSize || Math.abs(localY) > halfSize) return false

  return isPointInPieceMask(
    piece.imageUrl,
    (localX + halfSize) / piece.baseSize,
    (localY + halfSize) / piece.baseSize,
  )
}

function isPointInPieceMask(imageUrl: string, u: number, v: number) {
  const mask = getPieceHitMask(imageUrl)
  if (mask === undefined) return false
  if (mask === null) return true

  const x = Scalar.clamp(Math.floor(u * mask.size), 0, mask.size - 1)
  const y = Scalar.clamp(Math.floor(v * mask.size), 0, mask.size - 1)
  const alpha = mask.data[(y * mask.size + x) * 4 + 3]
  return alpha >= MAIN_MENU_PIECE_HIT_ALPHA_THRESHOLD
}

function getPieceHitMask(imageUrl: string): MainMenuPieceHitMask | null | undefined {
  if (pieceHitMaskCache.has(imageUrl)) {
    return pieceHitMaskCache.get(imageUrl) ?? null
  }

  const image = getPieceImage(imageUrl)
  if (! image.complete || image.naturalWidth <= 0) return undefined

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = MAIN_MENU_PIECE_HIT_MASK_SIZE
  maskCanvas.height = MAIN_MENU_PIECE_HIT_MASK_SIZE
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (! ctx) return null

  try {
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    ctx.drawImage(image, 0, 0, maskCanvas.width, maskCanvas.height)
    const mask = {
      data: ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data,
      size: maskCanvas.width,
    }
    pieceHitMaskCache.set(imageUrl, mask)
    return mask
  }
  catch {
    pieceHitMaskCache.set(imageUrl, null)
    return null
  }
}

function clickFlyingPiece(piece: MainMenuFlyingPiece) {
  const selectedPiece = selectedFlyingPieceId === null
    ? null
    : flyingPieces.value.find(item => item.id === selectedFlyingPieceId) ?? null
  if (
    selectedPiece
    && selectedPiece.id !== piece.id
    && selectedPiece.annihilatedAt === null
    && selectedPiece.key === piece.key
    && selectedPiece.player !== piece.player
  ) {
    annihilateFlyingPieces(selectedPiece, piece)
    selectedFlyingPieceId = null
    return
  }

  selectedFlyingPieceId = piece.id
}

function annihilateFlyingPieces(pieceA: MainMenuFlyingPiece, pieceB: MainMenuFlyingPiece) {
  const now = performance.now()
  pieceA.annihilatedAt = now
  pieceB.annihilatedAt = now
  emit('annihilateSound')
  recordAnnihilation()
  window.setTimeout(() => {
    removeFlyingPiece(pieceA.id)
    removeFlyingPiece(pieceB.id)
  }, MAIN_MENU_ANNIHILATION_FADE_MS + 40)
}

function recordAnnihilation() {
  annihilationScore.value += 1
}

function resetAnnihilation() {
  annihilationScore.value = 0
}

function getFlyingPieceFrame(piece: MainMenuFlyingPiece): MainMenuFlyingPieceFrame {
  const progress = Scalar.clamp(
    (frameTime - piece.startedAt) / piece.durationMs,
    0,
    1,
  )
  const eased = cubicBezierEase(
    progress,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierX1,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierY1,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierX2,
    MAIN_MENU_FLYING_PIECE_CONFIG.bezierY2,
  )
  const x = Scalar.lerp(piece.startX, piece.endX, eased)
  const y = Scalar.lerp(piece.startY, piece.endY, eased)
  const scale = Scalar.lerp(piece.startScale, piece.endScale, eased)
  const rotate = Scalar.lerp(piece.startRotate, piece.endRotate, progress)
  const visualSize = piece.baseSize * scale
  const annihilationOpacity = piece.annihilatedAt === null
    ? 1
    : Math.max(0, 1 - (frameTime - piece.annihilatedAt) / MAIN_MENU_ANNIHILATION_FADE_MS)

  return {
    x,
    y,
    scale,
    rotate,
    opacity: getFlyingPieceOpacity(progress, eased) * annihilationOpacity,
    visualSize,
  }
}

function getFlyingPieceOpacity(progress: number, easedProgress: number) {
  const fadeIn = progress < 0.12
    ? progress / 0.12
    : 1
  const fadeOutStart = MAIN_MENU_FLYING_PIECE_CONFIG.screenPlaneFadeStart
  const fadeOutProgress = Scalar.clamp(
    (easedProgress - fadeOutStart) / (1 - fadeOutStart),
    0,
    1,
  )
  const fadeOut = 1 - smoothStep(fadeOutProgress)
  return 0.9 * fadeIn * fadeOut
}

function smoothStep(t: number) {
  return t * t * (3 - 2 * t)
}

function cubicBezierEase(t: number, x1: number, y1: number, x2: number, y2: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let low = 0
  let high = 1
  let u = t
  for (let i = 0; i < 12; i ++) {
    u = (low + high) / 2
    const x = cubicBezierAxis(u, x1, x2)
    if (x < t) low = u
    else high = u
  }
  return cubicBezierAxis(u, y1, y2)
}

function cubicBezierAxis(t: number, p1: number, p2: number) {
  const inv = 1 - t
  return 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t
}

function getDistanceToViewportEdge(x: number, y: number, angle: number, width: number, height: number) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const tx = dx > 0
    ? (width - x) / dx
    : dx < 0
      ? -x / dx
      : Number.POSITIVE_INFINITY
  const ty = dy > 0
    ? (height - y) / dy
    : dy < 0
      ? -y / dy
      : Number.POSITIVE_INFINITY
  return Math.max(0, Math.min(tx, ty))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function isEven(value: number) {
  return value % 2 === 0
}

function addLogSpiralCubicPath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  fromRadius: number,
  fromAngle: number,
  toRadius: number,
  toAngle: number,
) {
  const from = polarPoint(centerX, centerY, fromRadius, fromAngle)
  const to = polarPoint(centerX, centerY, toRadius, toAngle)
  const deltaLogRadius = Math.log(toRadius / fromRadius)
  const deltaAngle = toAngle - fromAngle
  const fromDerivative = getLogSpiralDerivative(fromRadius, fromAngle, deltaLogRadius, deltaAngle)
  const toDerivative = getLogSpiralDerivative(toRadius, toAngle, deltaLogRadius, deltaAngle)
  const controlScale = 1 / 3
  const control1: [number, number] = [
    from[0] + fromDerivative[0] * controlScale,
    from[1] + fromDerivative[1] * controlScale,
  ]
  const control2: [number, number] = [
    to[0] - toDerivative[0] * controlScale,
    to[1] - toDerivative[1] * controlScale,
  ]

  ctx.bezierCurveTo(
    control1[0],
    control1[1],
    control2[0],
    control2[1],
    to[0],
    to[1],
  )
}

function getLogSpiralDerivative(
  radius: number,
  angle: number,
  deltaLogRadius: number,
  deltaAngle: number,
): [number, number] {
  const radiusDerivative = radius * deltaLogRadius
  return [
    radiusDerivative * Math.cos(angle) - radius * deltaAngle * Math.sin(angle),
    radiusDerivative * Math.sin(angle) + radius * deltaAngle * Math.cos(angle),
  ]
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number): [number, number] {
  return [
    centerX + Math.cos(angle) * radius,
    centerY + Math.sin(angle) * radius,
  ]
}

watch(() => props.visible, visible => {
  if (visible) {
    void nextTick(() => {
      if (! props.visible) return
      startAnimation()
      startFlyingPieces()
    })
  }
  else {
    stopAnimation()
    stopFlyingPieces()
  }
}, { immediate: true })

watch(() => props.mode, mode => {
  if (! props.visible) return
  if (mode === 'home') startFlyingPieces()
  else stopPieceSpawn()
  drawCanvas(frameTime)
})

watch(
  () => [props.width, props.height] as const,
  ([width, height], oldSize) => {
    const [oldWidth, oldHeight] = oldSize ?? [0, 0]
    if (oldWidth !== width || oldHeight !== height) {
      remapFlyingPiecesForResize(oldWidth, oldHeight, width, height)
    }
    if (props.visible) drawCanvas(frameTime)
  },
)

onUnmounted(() => {
  stopAnimation()
  stopFlyingPieces()
})
</script>

<template>
  <canvas
    ref="canvas"
    class="main-menu-canvas"
    aria-hidden="true"
    @pointerdown.stop.prevent="handlePointerDown"
    @pointermove.stop="handlePointerMove"
    @pointerleave.stop="handlePointerLeave"
  ></canvas>
  <Card
    v-if="annihilationVisible"
    class="main-menu-annihilation"
    @pointerdown.stop
    @click.stop
  >
    <div class="main-menu-annihilation-score">
      {{ t('main.annihilationScore', { score: annihilationScore }) }}
    </div>
  </Card>
</template>

<style scoped>
.main-menu-canvas {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.main-menu-annihilation {
  position: absolute;
  top: calc(var(--button-content-gap) * 2);
  right: calc(var(--button-content-gap) * 2);
  z-index: 3;
  display: block;
  text-align: center;
  min-width: 128px;
  font-size: 20px;
  line-height: 1;
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  pointer-events: auto;
}

.main-menu-annihilation-score {
  white-space: nowrap;
  transform: translateY(var(--ui-text-y));
}
</style>
