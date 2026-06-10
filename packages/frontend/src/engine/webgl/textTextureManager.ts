import { Color4, type Vec2 } from '@engine/basic'
import type { TextRenderItem } from '@engine/renderer'

const TEXT_TEXTURE_SCALE = 8
const TEXT_TEXTURE_PADDING = 4
const DEFAULT_FONT_FAMILY = '"Times New Roman", serif'

export interface WebGLTextTexture {
  texture: WebGLTexture
  size: Vec2
  offset: Vec2
}

export class WebGLTextTextureManager {
  constructor(private readonly gl: WebGL2RenderingContext) {}

  private textures = new Map<string, WebGLTextTexture>()
  private canvas = document.createElement('canvas')
  private ctx = this.createContext()

  get(item: TextRenderItem): WebGLTextTexture {
    const key = getTextTextureKey(item)
    const cached = this.textures.get(key)
    if (cached) return cached

    const texture = this.createTexture(item)
    this.textures.set(key, texture)
    return texture
  }

  dispose() {
    for (const { texture } of this.textures.values()) {
      this.gl.deleteTexture(texture)
    }
    this.textures.clear()
  }

  private createContext(): CanvasRenderingContext2D {
    const ctx = this.canvas.getContext('2d')
    if (! ctx) throw Error('Failed to create text texture canvas context')
    return ctx
  }

  private createTexture(item: TextRenderItem): WebGLTextTexture {
    const ctx = this.ctx
    const font = getTextFont(item)
    ctx.font = font
    ctx.textAlign = item.align
    ctx.textBaseline = item.baseline

    const bounds = measureTextBounds(ctx, item)
    const width = Math.max(1, bounds.right - bounds.left + TEXT_TEXTURE_PADDING * 2)
    const height = Math.max(1, bounds.bottom - bounds.top + TEXT_TEXTURE_PADDING * 2)
    const pixelWidth = Math.max(1, Math.ceil(width * TEXT_TEXTURE_SCALE))
    const pixelHeight = Math.max(1, Math.ceil(height * TEXT_TEXTURE_SCALE))

    this.canvas.width = pixelWidth
    this.canvas.height = pixelHeight

    ctx.resetTransform()
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    ctx.scale(TEXT_TEXTURE_SCALE, TEXT_TEXTURE_SCALE)
    ctx.font = font
    ctx.textAlign = item.align
    ctx.textBaseline = item.baseline
    ctx.fillStyle = Color4.toRgbaString([item.color[0], item.color[1], item.color[2], 1])
    ctx.fillText(
      item.text,
      -bounds.left + TEXT_TEXTURE_PADDING,
      -bounds.top + TEXT_TEXTURE_PADDING,
    )

    return {
      texture: this.uploadTexture(this.canvas),
      size: [width, height],
      offset: [
        bounds.left - TEXT_TEXTURE_PADDING,
        bounds.top - TEXT_TEXTURE_PADDING,
      ],
    }
  }

  private uploadTexture(canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.gl
    const texture = gl.createTexture()
    if (! texture) throw Error('Failed to create WebGL text texture')

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.bindTexture(gl.TEXTURE_2D, null)

    return texture
  }
}

interface TextBounds {
  left: number
  right: number
  top: number
  bottom: number
}

function measureTextBounds(ctx: CanvasRenderingContext2D, item: TextRenderItem): TextBounds {
  const metrics = ctx.measureText(item.text)
  const left = -metrics.actualBoundingBoxLeft
  const right = metrics.actualBoundingBoxRight
  const top = -metrics.actualBoundingBoxAscent
  const bottom = metrics.actualBoundingBoxDescent

  if (
    Number.isFinite(left)
    && Number.isFinite(right)
    && Number.isFinite(top)
    && Number.isFinite(bottom)
    && right > left
    && bottom > top
  ) {
    return { left, right, top, bottom }
  }

  return getFallbackTextBounds(metrics.width, item)
}

function getFallbackTextBounds(width: number, item: TextRenderItem): TextBounds {
  const left = getFallbackTextLeft(width, item.align)
  const top = getFallbackTextTop(item.fontSize, item.baseline)
  return {
    left,
    right: left + width,
    top,
    bottom: top + item.fontSize,
  }
}

function getFallbackTextLeft(width: number, align: CanvasTextAlign): number {
  switch (align) {
    case 'center':
      return -width / 2
    case 'right':
    case 'end':
      return -width
    case 'left':
    case 'start':
    default:
      return 0
  }
}

function getFallbackTextTop(fontSize: number, baseline: CanvasTextBaseline): number {
  switch (baseline) {
    case 'top':
    case 'hanging':
      return 0
    case 'middle':
      return -fontSize / 2
    case 'bottom':
    case 'ideographic':
      return -fontSize
    case 'alphabetic':
    default:
      return -fontSize * 0.8
  }
}

function getTextTextureKey(item: TextRenderItem): string {
  return [
    item.text,
    item.fontSize,
    item.fontFamily ?? DEFAULT_FONT_FAMILY,
    item.fontStyle ?? '',
    getColorKey(item.color),
    item.align,
    item.baseline,
  ].join('\u0000')
}

function getTextFont(item: TextRenderItem): string {
  return `${item.fontStyle ? `${item.fontStyle} ` : ''}${item.fontSize}px ${item.fontFamily ?? DEFAULT_FONT_FAMILY}`
}

function getColorKey(color: Color4): string {
  return color
    .slice(0, 3)
    .map(component => Math.round(component * 255))
    .join(',')
}
