import { isElem } from '@/utils'
import { getAssetUrl, type AssetLoadProgressCallback } from '@engine/assets'
import { getTextureLabel, TEXTURE_ID_TO_NAME, type TextureID, TextureManager, type TextureName } from '@engine/texture'

export const enum CanvasTextureType {
  Bitmap,
  SVG,
}

export interface CanvasTextureBase {
  width: number
  height: number
}

export interface CanvasBitmapTexture extends CanvasTextureBase {
  type: CanvasTextureType.Bitmap
  image: HTMLImageElement | OffscreenCanvas
}

export interface SVGPathStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  fillRule?: CanvasFillRule
  lineCap?: CanvasLineCap
  lineJoin?: CanvasLineJoin
}

export interface Path2DStyled extends SVGPathStyle {
  path: Path2D
}

export interface CanvasSVGTexture extends CanvasTextureBase {
  type: CanvasTextureType.SVG
  paths: Path2DStyled[]
}

export type CanvasTexture =
  | CanvasBitmapTexture
  | CanvasSVGTexture

export const CANVAS_TEXTURE_PATH = 'assets/textures'

export namespace SVGParser {
  const IGNORED_TAGS = new Set([
    'desc',
    'metadata',
    'title',
  ])

  export const parseNumber = (str: string | null): number | undefined => {
    if (! str) return undefined
    const num = Number(str)
    if (Number.isNaN(num) || ! Number.isFinite(num)) throw Error(`invalid number: "${str}"`)
    return num
  }

  const LINE_CAP_VALUES = ['butt', 'round', 'square'] as const

  export const parseLineCap = (str: string | null): CanvasLineCap | undefined => {
    if (! str) return undefined
    if (isElem(str, LINE_CAP_VALUES)) return str
    throw Error(`invalid line cap: "${str}"`)
  }

  const LINE_JOIN_VALUES = ['bevel', 'round', 'miter'] as const

  export const parseLineJoin = (str: string | null): CanvasLineJoin | undefined => {
    if (! str) return undefined
    if (isElem(str, LINE_JOIN_VALUES)) return str
    throw Error(`invalid line join: "${str}"`)
  }

  const FILL_RULE_VALUES = ['nonzero', 'evenodd'] as const

  
  export const parseFillRule = (str: string | null): CanvasFillRule | undefined => {
    if (! str) return undefined
    if (isElem(str, FILL_RULE_VALUES)) return str
    throw Error(`invalid fill rule: "${str}"`)
  }

  export const parseStyle = (el: Element, style: SVGPathStyle): SVGPathStyle => {
    const fill = el.getAttribute('fill') ?? style.fill
    const stroke = el.getAttribute('stroke') ?? style.stroke
    const strokeWidth = SVGParser.parseNumber(el.getAttribute('stroke-width')) ?? style.strokeWidth
    const lineCap = SVGParser.parseLineCap(el.getAttribute('stroke-linecap')) ?? style.lineCap
    const lineJoin = SVGParser.parseLineJoin(el.getAttribute('stroke-linejoin')) ?? style.lineJoin
    const fillRule = SVGParser.parseFillRule(el.getAttribute('fill-rule')) ?? style.fillRule
    return { fill, stroke, strokeWidth, lineCap, lineJoin, fillRule }
  }

  export const parseElement = (el: Element, style: SVGPathStyle): Path2DStyled[] => {
    switch (el.tagName) {
      case 'g':
      case 'svg':
        return parseGroup(el, style)
      case 'path':
        return [parsePath(el, style)]
      case 'circle':
        return [parseCircle(el, style)]
      case 'ellipse':
        return [parseEllipse(el, style)]
      default:
        if (! IGNORED_TAGS.has(el.tagName)) {
          console.warn(`Unsupported SVG element ignored: <${el.tagName}>`)
        }
        return []
    }
  }

  export const parseGroup = (el: Element, style: SVGPathStyle): Path2DStyled[] => {
    const styleThis = parseStyle(el, style)
    return Array
      .from(el.children)
      .flatMap(child => parseElement(child, styleThis))
  }

  export const parsePath = (el: Element, style: SVGPathStyle): Path2DStyled => {
    const dAttr = el.getAttribute('d')
    if (! dAttr) throw Error('invalid path: missing d attribute')
    const path = new Path2D(dAttr)
    const styleThis = parseStyle(el, style)
    return { path, ...styleThis }
  }

  const parseFiniteNumber = (str: string | null, name: string): number => {
    const num = parseNumber(str)
    if (num === undefined) throw Error(`invalid <${name}>: missing ${name} attribute`)
    return num
  }

  export const parseCircle = (el: Element, style: SVGPathStyle): Path2DStyled => {
    const cx = parseFiniteNumber(el.getAttribute('cx'), 'cx')
    const cy = parseFiniteNumber(el.getAttribute('cy'), 'cy')
    const r = parseFiniteNumber(el.getAttribute('r'), 'r')
    if (r < 0) throw Error(`invalid circle radius: ${r}`)

    const path = new Path2D()
    path.arc(cx, cy, r, 0, Math.PI * 2)

    const styleThis = parseStyle(el, style)
    return { path, ...styleThis }
  }

  export const parseEllipse = (el: Element, style: SVGPathStyle): Path2DStyled => {
    const cx = parseFiniteNumber(el.getAttribute('cx'), 'cx')
    const cy = parseFiniteNumber(el.getAttribute('cy'), 'cy')
    const rx = parseFiniteNumber(el.getAttribute('rx'), 'rx')
    const ry = parseFiniteNumber(el.getAttribute('ry'), 'ry')
    if (rx < 0) throw Error(`invalid ellipse rx: ${rx}`)
    if (ry < 0) throw Error(`invalid ellipse ry: ${ry}`)

    const path = new Path2D()
    path.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)

    const styleThis = parseStyle(el, style)
    return { path, ...styleThis }
  }
}

export class CanvasTextureManager extends TextureManager<CanvasTexture> {
  private images = new Map<TextureID, CanvasTexture>()

  async loadAll(onProgress?: AssetLoadProgressCallback) {
    const entries = Array.from(TEXTURE_ID_TO_NAME.entries())
    let completed = 0
    onProgress?.({ completed, total: entries.length })

    return await Promise.all(entries.map(async ([id, name]) => {
      const texture = await this.load(id, name)
      completed += 1
      onProgress?.({ completed, total: entries.length })
      return texture
    }))
  }

  async load(id: TextureID, name: TextureName) {
    const texture = await this.fetch(id, name)
    this.images.set(id, texture)
    return texture
  }

  fetch(id: TextureID, name: TextureName): Promise<CanvasTexture> {
    if (name.endsWith('.svg')) return this.fetchSVG(id, name)
    return this.fetchBitmap(id, name)
  }

  fetchBitmap(id: TextureID, name: TextureName): Promise<CanvasBitmapTexture> {
    return new Promise<CanvasBitmapTexture>((resolve, reject) => {
      const image = new Image()
      image.src = getAssetUrl(`${CANVAS_TEXTURE_PATH}/${name}`)
      image.onload = () => resolve({
        type: CanvasTextureType.Bitmap,
        image,
        width: image.width,
        height: image.height,
      })
      image.onerror = () => reject(Error(`Failed to load Bitmap texture [${getTextureLabel(id)}]`))
    })
  }

  async fetchSVG(id: TextureID, name: TextureName): Promise<CanvasSVGTexture> {
    try {
      const res = await fetch(getAssetUrl(`${CANVAS_TEXTURE_PATH}/${name}`))

      if (! res.ok) throw res.status
      const svgText = await res.text()
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')

      const svg = doc.querySelector('svg')
      if (! svg) throw Error('invalid SVG: missing <svg>')

      const viewBox = svg.getAttribute('viewBox')
      if (! viewBox) throw Error('invalid SVG: missing viewBox attribute')

      const [, , width, height] = viewBox.split(/\s+/).map(Number)
      if (! (width > 0 && height > 0)) throw Error(`invalid viewBox: "${viewBox}"`)

      const paths = SVGParser.parseElement(svg, {})

      return {
        type: CanvasTextureType.SVG,
        width,
        height,
        paths,
      }
    }
    catch (err) {
      throw Error(`Failed to load SVG texture [${getTextureLabel(id)}]: ${err}`)
    }
  }

  get(id: TextureID) {
    const texture = this.images.get(id)
    if (! texture) throw Error(`Texture [${getTextureLabel(id)}] not loaded`)
    return texture
  }
}
