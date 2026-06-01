import { Color4, Mat3, type Device as Screen } from '@engine/basic'
import { CircleRenderItem, type CornerRadii, PolygonRenderItem, QuadRenderItem, Renderer, RoundRectRenderItem, TextRenderItem, TextureRenderItem } from '@engine/renderer'
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

  static async create(canvas: HTMLCanvasElement, logger: Logger): Promise<CanvasRenderer> {
    const textureManager = new CanvasTextureManager()
    logger.info('Loading assets...')
    await textureManager.loadAll()
    return new CanvasRenderer(textureManager, canvas, logger)
  }

  flush() {
    this.ctx.resetTransform()
    this.ctx.clearRect(0, 0, this.canvasBuffer.width, this.canvasBuffer.height)

    super.flush()
    this.ctxDisplay.drawImage(this.canvasBuffer, 0, 0)
  }

  applyTransform(mat: Mat3) {
    mat = Mat3.multiply(this.worldToDeviceMat, mat)
    this.ctx.setTransform(
      mat[0], mat[1],
      mat[3], mat[4],
      mat[6], mat[7],
    )
  }

  drawTexture({ textureId, mat }: TextureRenderItem): void {
    const texture = this.textureManager.get(textureId)
    switch (texture.type) {
      case CanvasTextureType.Bitmap:
        this.drawBitmapTexture(mat, texture)
        break
      case CanvasTextureType.SVG:
        this.drawSVGTexture(mat, texture)
        break
      default:
        exhuastive(texture)
    }
  }

  drawBitmapTexture(mat: Mat3, { image }: CanvasBitmapTexture): void {
    this.applyTransform(mat)
    this.ctx.drawImage(image, 0, 0, 1, 1)
  }

  drawSVGTexture(mat: Mat3, texture: CanvasSVGTexture): void {
    const { paths, width, height } = texture

    this.applyTransform(Mat3.multiply(
      mat,
      Mat3.scale(1 / width, 1 / height),
    ))

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
    const { pos: [x, y], size: [w, h], radius, fill, stroke } = item

    this.applyTransform(Mat3.identity())
    this.ctx.beginPath()
    if (typeof radius === 'number') {
      const r = Math.min(radius, w / 2, h / 2)
      this.ctx.roundRect(x, y, w, h, r)
    }
    else {
      this.roundRectPath(x, y, w, h, radius)
    }
    if (fill) {
      this.ctx.fillStyle = Color4.toRgbaString(fill)
      this.ctx.fill()
    }
    if (stroke) {
      this.ctx.strokeStyle = Color4.toRgbaString(stroke)
      this.ctx.lineWidth = item.strokeWidth ?? 1
      this.ctx.stroke()
    }
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
      this.ctx.fillStyle = Color4.toRgbaString(item.fill)
      this.ctx.fill()
    }
    if (item.stroke) {
      this.ctx.strokeStyle = Color4.toRgbaString(item.stroke)
      this.ctx.lineWidth = item.strokeWidth ?? 1
      this.ctx.stroke()
    }
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
    const { pos, angle, text, fontSize, fontFamily, fontStyle, color, align, baseline } = item

    this.ctx.save()
    this.ctx.setTransform(
      this.worldToDeviceMat[0], this.worldToDeviceMat[1],
      this.worldToDeviceMat[3], this.worldToDeviceMat[4],
      this.worldToDeviceMat[6], this.worldToDeviceMat[7],
    )
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
