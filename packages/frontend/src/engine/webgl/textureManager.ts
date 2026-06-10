import { getAssetUrl, type AssetLoadProgressCallback } from '@engine/assets'
import { getTextureLabel, TEXTURE_ID_TO_NAME, type TextureID, TextureManager, type TextureName } from '@engine/texture'

const WEBGL_TEXTURE_PATH = 'assets/canvas/textures'
const SVG_TEXTURE_SIZE = 512

export interface WebGLTextureResource {
  texture: WebGLTexture
  width: number
  height: number
}

export class WebGLTextureManager extends TextureManager<WebGLTextureResource> {
  constructor(private readonly gl: WebGL2RenderingContext) {
    super()
  }

  private textures = new Map<TextureID, WebGLTextureResource>()

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
    const image = name.endsWith('.svg')
      ? await loadSVGImage(id, name)
      : await loadBitmapImage(id, name)
    const texture = this.createTexture(id, image)
    this.textures.set(id, texture)
    return texture
  }

  get(id: TextureID) {
    const texture = this.textures.get(id)
    if (! texture) throw Error(`Texture [${getTextureLabel(id)}] not loaded`)
    return texture
  }

  dispose() {
    for (const { texture } of this.textures.values()) {
      this.gl.deleteTexture(texture)
    }
    this.textures.clear()
  }

  private createTexture(id: TextureID, image: HTMLImageElement): WebGLTextureResource {
    const gl = this.gl
    const texture = gl.createTexture()
    if (! texture) throw Error(`Failed to create WebGL texture [${getTextureLabel(id)}]`)

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.bindTexture(gl.TEXTURE_2D, null)

    return {
      texture,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    }
  }
}

async function loadSVGImage(id: TextureID, name: TextureName): Promise<HTMLImageElement> {
  try {
    const res = await fetch(getAssetUrl(`${WEBGL_TEXTURE_PATH}/${name}`))
    if (! res.ok) throw res.status

    const svgText = await res.text()
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    if (! svg) throw Error('invalid SVG: missing <svg>')

    svg.setAttribute('width', `${SVG_TEXTURE_SIZE}`)
    svg.setAttribute('height', `${SVG_TEXTURE_SIZE}`)

    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    try {
      return await loadImageUrl(id, url)
    }
    finally {
      URL.revokeObjectURL(url)
    }
  }
  catch (err) {
    throw Error(`Failed to load WebGL SVG texture [${getTextureLabel(id)}]: ${err}`)
  }
}

function loadBitmapImage(id: TextureID, name: TextureName): Promise<HTMLImageElement> {
  return loadImageUrl(id, getAssetUrl(`${WEBGL_TEXTURE_PATH}/${name}`), true)
}

function loadImageUrl(id: TextureID, url: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(Error(`Failed to load WebGL texture [${getTextureLabel(id)}]`))
    image.src = url
  })
}
