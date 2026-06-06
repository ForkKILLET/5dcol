import { Color4, Mat3, type Device as Screen } from '@engine/basic'
import type { AssetLoadProgressCallback } from '@engine/assets'
import { CircleRenderItem, type CornerRadii, CurveRenderItem, type FillStyle, PolygonRenderItem, QuadRenderItem, Renderer, RoundRectRenderItem, TextRenderItem, TextureRenderItem } from '@engine/renderer'
import { CanvasBitmapTexture, CanvasSVGTexture, CanvasTextureManager, CanvasTextureType } from '@engine/canvas/textureManager'
import type { Logger } from '@engine/logger'
import { exhuastive } from '@/utils'

export class CanvasRenderer extends Renderer {
  constructor(
    private textureManager: CanvasTextureManager,
    canvas: HTMLCanvasElement,
    logger: Logger,
  ) {
    super(logger)

    this.canvasDisplay = canvas
    this.ctxDisplay = canvas.getContext('2d')!
    this.canvasBuffer = new OffscreenCanvas(0, 0)
    this.ctx = this.canvasBuffer.getContext('2d')!
  }

  private canvasDisplay: HTMLCanvasElement
  private ctxDisplay: CanvasRenderingContext2D
  private canvasBuffer: OffscreenCanvas
  private ctx: OffscreenCanvasRenderingContext2D

  setScreen(screen: Screen): void {
    super.setScreen(screen)

    const { dpr, widthCss, heightCss } = screen
    const { canvasDisplay, canvasBuffer } = this

    const widthDevice = Math.floor(widthCss * dpr)
    const heightDevice = Math.floor(heightCss * dpr)

    if (canvasBuffer.width !== widthDevice || canvasBuffer.height !== heightDevice ) {
      canvasBuffer.width = widthDevice
      canvasBuffer.height = heightDevice
      canvasDisplay.width = widthDevice
      canvasDisplay.height = heightDevice
    }

    canvasDisplay.style.width = `${widthCss}px`
    canvasDisplay.style.height = `${heightCss}px`
  }

  static async create(
    canvas: HTMLCanvasElement,
    logger: Logger,
    onProgress?: AssetLoadProgressCallback,
  ): Promise<CanvasRenderer> {
    const textureManager = new CanvasTextureManager()
    logger.info('Loading assets...')
    await textureManager.loadAll(onProgress)
    return new CanvasRenderer(textureManager, canvas, logger)
  }

  flush() {
    this.ctx.resetTransform()
    this.ctx.clearRect(0, 0, this.canvasBuffer.width, this.canvasBuffer.height)

    super.flush()
    this.ctxDisplay.drawImage(this.canvasBuffer, 0, 0)
  }

  applyTransform(mat: Mat3, space: 'world' | 'screen' = 'world') {
    mat = Mat3.multiply(space === 'screen' ? this.screenToDeviceMat : this.worldToDeviceMat, mat)
    this.ctx.setTransform(
      mat[0], mat[1],
      mat[3], mat[4],
      mat[6], mat[7],
    )
  }

  drawTexture({ textureId, mat, alpha = 1, space }: TextureRenderItem): void {
    const texture = this.textureManager.get(textureId)

    if (alpha !== 1) {
      this.ctx.save()
      this.ctx.globalAlpha *= alpha
    }

    switch (texture.type) {
      case CanvasTextureType.Bitmap:
        this.drawBitmapTexture(mat, texture, space)
        break
      case CanvasTextureType.SVG:
        this.drawSVGTexture(mat, texture, space)
        break
      default:
        exhuastive(texture)
    }

    if (alpha !== 1) {
      this.ctx.restore()
    }
  }

  drawBitmapTexture(mat: Mat3, { image }: CanvasBitmapTexture, space: 'world' | 'screen' = 'world'): void {
    this.applyTransform(mat, space)
    this.ctx.drawImage(image, 0, 0, 1, 1)
  }

  drawSVGTexture(mat: Mat3, texture: CanvasSVGTexture, space: 'world' | 'screen' = 'world'): void {
    const { paths, width, height } = texture

    this.applyTransform(Mat3.multiply(
      mat,
      Mat3.scale(1 / width, 1 / height),
    ), space)

    for (const path of paths) {
      if (path.fill !== 'none') {
        this.ctx.fillStyle = path.fill ?? '#000'
        this.ctx.fill(path.path)
      }
      if (path.stroke && path.stroke !== 'none') {
        this.ctx.strokeStyle = path.stroke
        this.ctx.lineWidth = path.strokeWidth ?? 1
        if (path.lineCap) this.ctx.lineCap = path.lineCap
        if (path.lineJoin) this.ctx.lineJoin = path.lineJoin
        this.ctx.stroke(path.path)
      }
    }
  }

  drawQuad({ mat, color }: QuadRenderItem): void {
    this.applyTransform(mat)
    this.ctx.fillStyle = Color4.toRgbaString(color)
    this.ctx.fillRect(0, 0, 1, 1)
  }

  drawRoundRect(item: RoundRectRenderItem): void {
    const { pos: [x, y], size: [w, h], radius, fill, stroke, space } = item

    this.applyTransform(Mat3.identity(), space)
    this.ctx.beginPath()
    if (typeof radius === 'number') {
      const r = Math.min(radius, w / 2, h / 2)
      this.ctx.roundRect(x, y, w, h, r)
    }
    else {
      this.roundRectPath(x, y, w, h, radius)
    }
    if (fill) {
      this.ctx.fillStyle = this.getFillStyle(fill)
      this.ctx.fill()
    }
    if (stroke) {
      this.ctx.strokeStyle = this.getFillStyle(stroke)
      this.ctx.lineWidth = item.strokeWidth ?? 1
      this.ctx.stroke()
    }
  }

  private getFillStyle(fill: FillStyle): string | CanvasGradient {
    if (Array.isArray(fill)) return Color4.toRgbaString(fill)

    const gradient = this.ctx.createLinearGradient(
      fill.from[0],
      fill.from[1],
      fill.to[0],
      fill.to[1],
    )
    for (const stop of fill.stops) {
      gradient.addColorStop(stop.offset, Color4.toRgbaString(stop.color))
    }
    return gradient
  }

  private roundRectPath(x: number, y: number, w: number, h: number, radii: CornerRadii) {
    const clampRadius = (radius: number) => Math.min(radius, w / 2, h / 2)
    const tl = clampRadius(radii.tl)
    const tr = clampRadius(radii.tr)
    const br = clampRadius(radii.br)
    const bl = clampRadius(radii.bl)

    this.ctx.moveTo(x + tl, y)
    this.ctx.lineTo(x + w - tr, y)
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
    this.ctx.lineTo(x + w, y + h - br)
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
    this.ctx.lineTo(x + bl, y + h)
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
    this.ctx.lineTo(x, y + tl)
    this.ctx.quadraticCurveTo(x, y, x + tl, y)
    this.ctx.closePath()
  }

  drawPolygon(item: PolygonRenderItem): void {
    this.applyTransform(Mat3.identity())
    this.ctx.beginPath()
    const [firstPoint, ...otherPoints] = item.points
    this.ctx.moveTo(...firstPoint)
    for (const point of otherPoints) this.ctx.lineTo(...point)
    this.ctx.closePath()
    if (item.fill) {
      this.ctx.fillStyle = this.getFillStyle(item.fill)
      this.ctx.fill()
    }
    if (item.stroke) {
      this.ctx.strokeStyle = this.getFillStyle(item.stroke)
      this.ctx.lineWidth = item.strokeWidth ?? 1
      this.ctx.stroke()
    }
  }

  drawCurve(item: CurveRenderItem): void {
    this.applyTransform(Mat3.identity(), item.space)
    this.ctx.beginPath()
    this.ctx.moveTo(...item.from)
    this.ctx.bezierCurveTo(
      item.control1[0],
      item.control1[1],
      item.control2[0],
      item.control2[1],
      item.to[0],
      item.to[1],
    )
    this.ctx.strokeStyle = Color4.toRgbaString(item.stroke)
    this.ctx.lineWidth = item.strokeWidth ?? 1
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    this.ctx.stroke()
  }

  drawCircle(item: CircleRenderItem): void {
    this.applyTransform(Mat3.identity())
    this.ctx.beginPath()
    this.ctx.arc(item.center[0], item.center[1], item.radius, 0, Math.PI * 2)
    if (item.fill) {
      this.ctx.fillStyle = Color4.toRgbaString(item.fill)
      this.ctx.fill()
    }
    if (item.stroke) {
      this.ctx.strokeStyle = Color4.toRgbaString(item.stroke)
      this.ctx.lineWidth = item.strokeWidth ?? 1
      this.ctx.stroke()
    }
  }

  drawText(item: TextRenderItem): void {
    const {
      pos,
      angle,
      text,
      fontSize,
      fontFamily = '"Times New Roman", serif',
      fontStyle,
      color,
      align,
      baseline,
      space
    } = item

    this.ctx.save()
    const mat = space === 'screen' ? this.screenToDeviceMat : this.worldToDeviceMat
    this.ctx.setTransform(mat[0], mat[1], mat[3], mat[4], mat[6], mat[7])
    this.ctx.translate(...pos)
    this.ctx.rotate(angle)
    this.ctx.fillStyle = Color4.toRgbaString(color)
    this.ctx.font = `${fontStyle ? `${fontStyle} ` : ''}${fontSize}px ${fontFamily}`
    this.ctx.textAlign = align
    this.ctx.textBaseline = baseline
    this.ctx.fillText(text, 0, 0)
    this.ctx.restore()
  }
}
