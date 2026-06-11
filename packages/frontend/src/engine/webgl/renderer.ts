import { Mat3, type Device as Screen, Vec2, type Vec2 as Vec2Type } from '@engine/basic'
import type {
  CircleRenderItem,
  CornerRadii,
  CurveRenderItem,
  FillStyle,
  PolygonRenderItem,
  QuadRenderItem,
  RoundRectRenderItem,
  TextRenderItem,
  TextureRenderItem,
} from '@engine/renderer'
import { Renderer } from '@engine/renderer'
import type { AssetLoadProgressCallback } from '@engine/assets'
import type { Logger } from '@engine/logger'
import { WebGLTextTextureManager } from '@engine/webgl/textTextureManager'
import { WebGLTextureManager } from '@engine/webgl/textureManager'
import quadVertexShader from '@engine/webgl/shader/quad.vert.glsl?raw'
import quadFragmentShader from '@engine/webgl/shader/quad.frag.glsl?raw'
import textureVertexShader from '@engine/webgl/shader/texture.vert.glsl?raw'
import textureFragmentShader from '@engine/webgl/shader/texture.frag.glsl?raw'
import meshVertexShader from '@engine/webgl/shader/mesh.vert.glsl?raw'
import meshFragmentShader from '@engine/webgl/shader/mesh.frag.glsl?raw'

const QUAD_VERTICES = new Float32Array([
  0, 0,
  1, 0,
  0, 1,
  0, 1,
  1, 0,
  1, 1,
])

const MESH_COMPONENTS_PER_VERTEX = 2
const MESH_STRIDE_BYTES = MESH_COMPONENTS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT
const MAX_GRADIENT_STOPS = 4
const TEXTURE_LOD_BIAS = -0.75
const TEXT_TEXTURE_LOD_BIAS = -1
const ROUND_RECT_CORNER_SEGMENTS = 8
const CIRCLE_SEGMENTS = 48

export class WebGLRenderer extends Renderer {
  private constructor(
    private readonly textureManager: WebGLTextureManager,
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    logger: Logger,
  ) {
    super(logger)
    this.textTextureManager = new WebGLTextTextureManager(gl)

    this.quadProgram = createProgram(gl, quadVertexShader, quadFragmentShader)
    this.quadPositionLocation = gl.getAttribLocation(this.quadProgram, 'a_position')
    this.quadMatrixLocation = getUniformLocation(gl, this.quadProgram, 'u_matrix')
    this.quadResolutionLocation = getUniformLocation(gl, this.quadProgram, 'u_resolution')
    this.quadColorLocation = getUniformLocation(gl, this.quadProgram, 'u_color')
    this.quadVertexBuffer = createBuffer(gl, QUAD_VERTICES)

    this.textureProgram = createProgram(gl, textureVertexShader, textureFragmentShader)
    this.texturePositionLocation = gl.getAttribLocation(this.textureProgram, 'a_position')
    this.textureMatrixLocation = getUniformLocation(gl, this.textureProgram, 'u_matrix')
    this.textureResolutionLocation = getUniformLocation(gl, this.textureProgram, 'u_resolution')
    this.textureSamplerLocation = getUniformLocation(gl, this.textureProgram, 'u_texture')
    this.textureAlphaLocation = getUniformLocation(gl, this.textureProgram, 'u_alpha')
    this.textureLodBiasLocation = getUniformLocation(gl, this.textureProgram, 'u_lod_bias')

    this.meshProgram = createProgram(gl, meshVertexShader, meshFragmentShader)
    this.meshPositionLocation = gl.getAttribLocation(this.meshProgram, 'a_position')
    this.meshMatrixLocation = getUniformLocation(gl, this.meshProgram, 'u_matrix')
    this.meshResolutionLocation = getUniformLocation(gl, this.meshProgram, 'u_resolution')
    this.meshUseGradientLocation = getUniformLocation(gl, this.meshProgram, 'u_use_gradient')
    this.meshColorLocation = getUniformLocation(gl, this.meshProgram, 'u_color')
    this.meshGradientFromLocation = getUniformLocation(gl, this.meshProgram, 'u_gradient_from')
    this.meshGradientToLocation = getUniformLocation(gl, this.meshProgram, 'u_gradient_to')
    this.meshGradientStopCountLocation = getUniformLocation(gl, this.meshProgram, 'u_gradient_stop_count')
    this.meshGradientOffsetsLocation = getUniformLocation(gl, this.meshProgram, 'u_gradient_offsets')
    this.meshGradientColorsLocation = getUniformLocation(gl, this.meshProgram, 'u_gradient_colors')
    this.meshVertexBuffer = createBuffer(gl, new Float32Array())

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  private readonly quadProgram: WebGLProgram
  private readonly quadVertexBuffer: WebGLBuffer
  private readonly quadPositionLocation: number
  private readonly quadMatrixLocation: WebGLUniformLocation
  private readonly quadResolutionLocation: WebGLUniformLocation
  private readonly quadColorLocation: WebGLUniformLocation
  private readonly textureProgram: WebGLProgram
  private readonly texturePositionLocation: number
  private readonly textureMatrixLocation: WebGLUniformLocation
  private readonly textureResolutionLocation: WebGLUniformLocation
  private readonly textureSamplerLocation: WebGLUniformLocation
  private readonly textureAlphaLocation: WebGLUniformLocation
  private readonly textureLodBiasLocation: WebGLUniformLocation
  private readonly textTextureManager: WebGLTextTextureManager
  private readonly meshProgram: WebGLProgram
  private readonly meshVertexBuffer: WebGLBuffer
  private readonly meshPositionLocation: number
  private readonly meshMatrixLocation: WebGLUniformLocation
  private readonly meshResolutionLocation: WebGLUniformLocation
  private readonly meshUseGradientLocation: WebGLUniformLocation
  private readonly meshColorLocation: WebGLUniformLocation
  private readonly meshGradientFromLocation: WebGLUniformLocation
  private readonly meshGradientToLocation: WebGLUniformLocation
  private readonly meshGradientStopCountLocation: WebGLUniformLocation
  private readonly meshGradientOffsetsLocation: WebGLUniformLocation
  private readonly meshGradientColorsLocation: WebGLUniformLocation
  private warnedUnsupportedCurve = false

  static async create(
    canvas: HTMLCanvasElement,
    logger: Logger,
    onProgress?: AssetLoadProgressCallback,
  ): Promise<WebGLRenderer> {
    onProgress?.({ completed: 0, total: 0 })
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
    })
    if (! gl) throw Error('WebGL2 is not available')
    const textureManager = new WebGLTextureManager(gl)
    logger.info('Loading assets...')
    await textureManager.loadAll(onProgress)
    logger.info('Using WebGL renderer')
    return new WebGLRenderer(textureManager, canvas, gl, logger)
  }

  protected getDisplaySize() {
    const { width, height } = this.canvas.getBoundingClientRect()
    return {
      widthCss: width || window.innerWidth,
      heightCss: height || window.innerHeight,
    }
  }

  setScreen(screen: Screen): void {
    super.setScreen(screen)

    const { dpr, widthCss, heightCss } = screen
    const widthDevice = Math.floor(widthCss * dpr)
    const heightDevice = Math.floor(heightCss * dpr)

    if (this.canvas.width !== widthDevice || this.canvas.height !== heightDevice) {
      this.canvas.width = widthDevice
      this.canvas.height = heightDevice
    }

    this.canvas.style.width = `${widthCss}px`
    this.canvas.style.height = `${heightCss}px`
    this.gl.viewport(0, 0, widthDevice, heightDevice)
  }

  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor
  }

  flush() {
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)

    super.flush()
  }

  drawQuad({ mat, color, space }: QuadRenderItem): void {
    const gl = this.gl
    const transform = Mat3.multiply(space === 'screen' ? this.screenToDeviceMat : this.worldToDeviceMat, mat)

    gl.useProgram(this.quadProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertexBuffer)
    gl.enableVertexAttribArray(this.quadPositionLocation)
    gl.vertexAttribPointer(this.quadPositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix3fv(this.quadMatrixLocation, false, transform)
    gl.uniform2f(
      this.quadResolutionLocation,
      Math.floor(this.screen.widthCss * this.screen.dpr),
      Math.floor(this.screen.heightCss * this.screen.dpr),
    )
    gl.uniform4f(this.quadColorLocation, color[0], color[1], color[2], color[3])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  drawRoundRect({ pos, size, radius, fill, stroke, strokeWidth = 1, space }: RoundRectRenderItem): void {
    if (size[0] <= 0 || size[1] <= 0) return

    if (fill) {
      const points = getRoundRectPoints(pos, size, radius)
      const triangles = triangulatePolygon(points)
      if (triangles.length > 0) this.drawMesh(triangles, fill, space)
    }

    if (stroke && strokeWidth > 0) {
      const halfStroke = strokeWidth / 2
      const outerPos: Vec2Type = [pos[0] - halfStroke, pos[1] - halfStroke]
      const outerSize: Vec2Type = [size[0] + strokeWidth, size[1] + strokeWidth]
      const innerPos: Vec2Type = [pos[0] + halfStroke, pos[1] + halfStroke]
      const innerSize: Vec2Type = [size[0] - strokeWidth, size[1] - strokeWidth]
      if (innerSize[0] <= 0 || innerSize[1] <= 0) return

      const outer = getRoundRectPoints(outerPos, outerSize, offsetCornerRadii(radius, halfStroke))
      const inner = getRoundRectPoints(innerPos, innerSize, offsetCornerRadii(radius, -halfStroke))
      this.drawMesh(getRingTriangles(outer, inner), stroke, space)
    }
  }
  drawPolygon(item: PolygonRenderItem): void {
    const { points, fill, stroke, strokeWidth = 1, space } = item
    if (points.length < 2) return

    if (fill && points.length >= 3) {
      const triangles = triangulatePolygon(points)
      if (triangles.length > 0) {
        this.drawMesh(triangles, fill, space)
      }
    }

    if (stroke && strokeWidth > 0) {
      this.drawStrokePath(points, strokeWidth, stroke, space)
    }
  }
  drawCurve(_item: CurveRenderItem): void {
    if (this.warnedUnsupportedCurve) return
    this.warnedUnsupportedCurve = true
    this.logger.warn('WebGL renderer does not support CurveRenderItem; curves should be submitted as polygons')
  }
  drawCircle({ center, radius, fill, stroke, strokeWidth = 1, space }: CircleRenderItem): void {
    if (radius <= 0) return

    if (fill) {
      this.drawMesh(getCircleFillTriangles(center, radius), fill, space)
    }

    if (stroke && strokeWidth > 0) {
      const outerRadius = radius + strokeWidth / 2
      const innerRadius = radius - strokeWidth / 2
      if (innerRadius <= 0) {
        this.drawMesh(getCircleFillTriangles(center, outerRadius), stroke, space)
        return
      }

      const outer = getCirclePoints(center, outerRadius)
      const inner = getCirclePoints(center, innerRadius)
      this.drawMesh(getRingTriangles(outer, inner), stroke, space)
    }
  }
  drawTexture({ textureId, mat, alpha = 1, space }: TextureRenderItem): void {
    const { texture } = this.textureManager.get(textureId)
    this.drawRawTexture(texture, mat, alpha, space, TEXTURE_LOD_BIAS)
  }

  drawText(item: TextRenderItem): void {
    const texture = this.textTextureManager.get(item)
    this.drawRawTexture(
      texture.texture,
      getTextTextureMat(item.pos, item.angle, texture.offset, texture.size),
      item.color[3],
      item.space,
      TEXT_TEXTURE_LOD_BIAS,
    )
  }

  private drawRawTexture(
    texture: WebGLTexture,
    mat: Mat3,
    alpha: number,
    space: 'world' | 'screen' = 'world',
    lodBias: number,
  ): void {
    const gl = this.gl
    const transform = Mat3.multiply(space === 'screen' ? this.screenToDeviceMat : this.worldToDeviceMat, mat)

    gl.useProgram(this.textureProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVertexBuffer)
    gl.enableVertexAttribArray(this.texturePositionLocation)
    gl.vertexAttribPointer(this.texturePositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix3fv(this.textureMatrixLocation, false, transform)
    gl.uniform2f(
      this.textureResolutionLocation,
      Math.floor(this.screen.widthCss * this.screen.dpr),
      Math.floor(this.screen.heightCss * this.screen.dpr),
    )
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(this.textureSamplerLocation, 0)
    gl.uniform1f(this.textureAlphaLocation, alpha)
    gl.uniform1f(this.textureLodBiasLocation, lodBias)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  dispose() {
    const gl = this.gl
    this.textureManager.dispose()
    this.textTextureManager.dispose()
    gl.deleteBuffer(this.quadVertexBuffer)
    gl.deleteBuffer(this.meshVertexBuffer)
    gl.deleteProgram(this.quadProgram)
    gl.deleteProgram(this.textureProgram)
    gl.deleteProgram(this.meshProgram)
    super.dispose()
  }

  private drawStrokePath(
    points: Vec2Type[],
    strokeWidth: number,
    stroke: FillStyle,
    space: 'world' | 'screen' = 'world',
  ) {
    if (points.length < 2) return

    const sides = this.getStrokePathSides(points, strokeWidth)
    if (! sides) return

    const { left, right } = sides
    const triangles: Vec2Type[] = []
    for (let i = 0; i < points.length; i += 1) {
      const next = (i + 1) % points.length
      triangles.push(left[i], left[next], right[i], right[i], left[next], right[next])
    }

    this.drawMesh(triangles, stroke, space)
  }

  private getStrokePathSides(
    points: Vec2Type[],
    strokeWidth: number,
  ): { left: Vec2Type[], right: Vec2Type[] } | null {
    const halfWidth = strokeWidth / 2
    const left: Vec2Type[] = []
    const right: Vec2Type[] = []

    for (let i = 0; i < points.length; i += 1) {
      const current = points[i]
      const previous = i === 0
        ? points[points.length - 1]
        : points[i - 1]
      const next = i === points.length - 1
        ? points[0]
        : points[i + 1]
      const offset = getStrokeJoinOffset(previous, current, next, halfWidth)
      if (! offset) return null

      left.push(Vec2.add(current, offset))
      right.push(Vec2.sub(current, offset))
    }

    return { left, right }
  }

  private drawMesh(points: Vec2Type[], fill: FillStyle, space: 'world' | 'screen' = 'world') {
    if (points.length === 0) return

    const gl = this.gl
    const transform = space === 'screen' ? this.screenToDeviceMat : this.worldToDeviceMat

    gl.useProgram(this.meshProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flat()), gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(this.meshPositionLocation)
    gl.vertexAttribPointer(this.meshPositionLocation, 2, gl.FLOAT, false, MESH_STRIDE_BYTES, 0)
    gl.uniformMatrix3fv(this.meshMatrixLocation, false, transform)
    gl.uniform2f(
      this.meshResolutionLocation,
      Math.floor(this.screen.widthCss * this.screen.dpr),
      Math.floor(this.screen.heightCss * this.screen.dpr),
    )
    this.applyMeshFill(fill)
    gl.drawArrays(gl.TRIANGLES, 0, points.length)
  }

  private applyMeshFill(fill: FillStyle) {
    const gl = this.gl
    if (Array.isArray(fill)) {
      gl.uniform1i(this.meshUseGradientLocation, 0)
      gl.uniform4f(this.meshColorLocation, fill[0], fill[1], fill[2], fill[3])
      return
    }

    const stops = fill.stops.slice(0, MAX_GRADIENT_STOPS)
    const offsets = new Float32Array(MAX_GRADIENT_STOPS)
    const colors = new Float32Array(MAX_GRADIENT_STOPS * 4)
    for (let i = 0; i < stops.length; i += 1) {
      offsets[i] = stops[i].offset
      colors[i * 4] = stops[i].color[0]
      colors[i * 4 + 1] = stops[i].color[1]
      colors[i * 4 + 2] = stops[i].color[2]
      colors[i * 4 + 3] = stops[i].color[3]
    }

    gl.uniform1i(this.meshUseGradientLocation, 1)
    gl.uniform2f(this.meshGradientFromLocation, fill.from[0], fill.from[1])
    gl.uniform2f(this.meshGradientToLocation, fill.to[0], fill.to[1])
    gl.uniform1i(this.meshGradientStopCountLocation, stops.length)
    gl.uniform1fv(this.meshGradientOffsetsLocation, offsets)
    gl.uniform4fv(this.meshGradientColorsLocation, colors)
  }
}

function getStrokeJoinOffset(
  previous: Vec2Type | null,
  current: Vec2Type,
  next: Vec2Type | null,
  halfWidth: number,
): Vec2Type | null {
  const previousDirection = previous ? getUnitDirection(previous, current) : null
  const nextDirection = next ? getUnitDirection(current, next) : null
  if (! previousDirection && ! nextDirection) return null

  if (! previousDirection) return getNormalOffset(nextDirection!, halfWidth)
  if (! nextDirection) return getNormalOffset(previousDirection, halfWidth)

  const previousNormal = getNormal(previousDirection)
  const nextNormal = getNormal(nextDirection)
  const miter = Vec2.add(previousNormal, nextNormal)
  const miterLength = Vec2.length(miter)
  if (miterLength === 0) return getNormalOffset(nextDirection, halfWidth)

  const unitMiter = Vec2.scale(miter, 1 / miterLength)
  const denominator = unitMiter[0] * nextNormal[0] + unitMiter[1] * nextNormal[1]
  if (Math.abs(denominator) < 0.2) return getNormalOffset(nextDirection, halfWidth)

  const length = Math.min(Math.abs(halfWidth / denominator), halfWidth * 4)
  return Vec2.scale(unitMiter, length)
}

function getNormalOffset(direction: Vec2Type, halfWidth: number): Vec2Type {
  return Vec2.scale(getNormal(direction), halfWidth)
}

function getNormal([x, y]: Vec2Type): Vec2Type {
  return [-y, x]
}

function getUnitDirection(from: Vec2Type, to: Vec2Type): Vec2Type | null {
  const direction = Vec2.sub(to, from)
  const length = Vec2.length(direction)
  if (length === 0) return null
  return Vec2.scale(direction, 1 / length)
}

function getTextTextureMat(pos: Vec2Type, angle: number, offset: Vec2Type, size: Vec2Type): Mat3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const [ox, oy] = offset
  const [w, h] = size

  return new Float32Array([
    cos * w, sin * w, 0,
    -sin * h, cos * h, 0,
    pos[0] + cos * ox - sin * oy,
    pos[1] + sin * ox + cos * oy,
    1,
  ])
}

function getRoundRectPoints(
  [x, y]: Vec2Type,
  [w, h]: Vec2Type,
  radius: number | CornerRadii,
): Vec2Type[] {
  const radii = normalizeCornerRadii(radius, w, h)
  return [
    ...getArcPoints([x + w - radii.tr, y + radii.tr], radii.tr, -Math.PI / 2, 0, ROUND_RECT_CORNER_SEGMENTS),
    ...getArcPoints([x + w - radii.br, y + h - radii.br], radii.br, 0, Math.PI / 2, ROUND_RECT_CORNER_SEGMENTS),
    ...getArcPoints([x + radii.bl, y + h - radii.bl], radii.bl, Math.PI / 2, Math.PI, ROUND_RECT_CORNER_SEGMENTS),
    ...getArcPoints([x + radii.tl, y + radii.tl], radii.tl, Math.PI, Math.PI * 1.5, ROUND_RECT_CORNER_SEGMENTS),
  ]
}

function normalizeCornerRadii(radius: number | CornerRadii, w: number, h: number): CornerRadii {
  if (typeof radius === 'number') {
    const r = clampRadius(radius, w, h)
    return { tl: r, tr: r, br: r, bl: r }
  }

  return {
    tl: clampRadius(radius.tl, w, h),
    tr: clampRadius(radius.tr, w, h),
    br: clampRadius(radius.br, w, h),
    bl: clampRadius(radius.bl, w, h),
  }
}

function offsetCornerRadii(radius: number | CornerRadii, offset: number): number | CornerRadii {
  if (typeof radius === 'number') return Math.max(0, radius + offset)
  return {
    tl: Math.max(0, radius.tl + offset),
    tr: Math.max(0, radius.tr + offset),
    br: Math.max(0, radius.br + offset),
    bl: Math.max(0, radius.bl + offset),
  }
}

function clampRadius(radius: number, w: number, h: number): number {
  return Math.max(0, Math.min(radius, w / 2, h / 2))
}

function getArcPoints(
  center: Vec2Type,
  radius: number,
  start: number,
  end: number,
  segments: number,
): Vec2Type[] {
  const points: Vec2Type[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const angle = start + (end - start) * t
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ])
  }
  return points
}

function getCirclePoints(center: Vec2Type, radius: number, segments = CIRCLE_SEGMENTS): Vec2Type[] {
  const points: Vec2Type[] = []
  for (let i = 0; i < segments; i += 1) {
    const angle = i / segments * Math.PI * 2
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ])
  }
  return points
}

function getCircleFillTriangles(center: Vec2Type, radius: number): Vec2Type[] {
  const points = getCirclePoints(center, radius)
  const triangles: Vec2Type[] = []
  for (let i = 0; i < points.length; i += 1) {
    triangles.push(center, points[i], points[(i + 1) % points.length])
  }
  return triangles
}

function getRingTriangles(outer: Vec2Type[], inner: Vec2Type[]): Vec2Type[] {
  if (outer.length !== inner.length) return []

  const triangles: Vec2Type[] = []
  for (let i = 0; i < outer.length; i += 1) {
    const next = (i + 1) % outer.length
    triangles.push(
      outer[i], outer[next], inner[i],
      inner[i], outer[next], inner[next],
    )
  }
  return triangles
}

function triangulatePolygon(points: Vec2Type[]): Vec2Type[] {
  const indices = points.map((_, index) => index)
  const triangles: Vec2Type[] = []
  const winding = getPolygonArea(points) >= 0 ? 1 : -1
  let guard = 0

  while (indices.length > 3 && guard < points.length * points.length) {
    let earIndex = -1

    for (let i = 0; i < indices.length; i += 1) {
      const previousIndex = indices[(i + indices.length - 1) % indices.length]
      const currentIndex = indices[i]
      const nextIndex = indices[(i + 1) % indices.length]
      if (! isEar(points, indices, previousIndex, currentIndex, nextIndex, winding)) continue

      earIndex = i
      triangles.push(points[previousIndex], points[currentIndex], points[nextIndex])
      break
    }

    if (earIndex === -1) return triangulatePolygonFan(points)
    indices.splice(earIndex, 1)
    guard += 1
  }

  if (indices.length === 3) {
    triangles.push(points[indices[0]], points[indices[1]], points[indices[2]])
  }

  return triangles
}

function triangulatePolygonFan(points: Vec2Type[]): Vec2Type[] {
  const triangles: Vec2Type[] = []
  for (let i = 1; i < points.length - 1; i += 1) {
    triangles.push(points[0], points[i], points[i + 1])
  }
  return triangles
}

function isEar(
  points: Vec2Type[],
  indices: number[],
  previousIndex: number,
  currentIndex: number,
  nextIndex: number,
  winding: 1 | -1,
): boolean {
  const previous = points[previousIndex]
  const current = points[currentIndex]
  const next = points[nextIndex]
  if (getCross(previous, current, next) * winding <= 0) return false

  for (const index of indices) {
    if (index === previousIndex || index === currentIndex || index === nextIndex) continue
    if (isPointInTriangle(points[index], previous, current, next)) return false
  }

  return true
}

function getPolygonArea(points: Vec2Type[]): number {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    area += x0 * y1 - x1 * y0
  }
  return area / 2
}

function getCross(a: Vec2Type, b: Vec2Type, c: Vec2Type): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function isPointInTriangle(point: Vec2Type, a: Vec2Type, b: Vec2Type, c: Vec2Type): boolean {
  const c0 = getCross(a, b, point)
  const c1 = getCross(b, c, point)
  const c2 = getCross(c, a, point)
  return (c0 >= 0 && c1 >= 0 && c2 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0)
}

function createBuffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer()
  if (! buffer) throw Error('Failed to create WebGL buffer')

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  return buffer
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (! program) throw Error('Failed to create WebGL program')

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (! gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error'
    gl.deleteProgram(program)
    throw Error(`Failed to link WebGL program: ${log}`)
  }

  return program
}

function createShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (! shader) throw Error('Failed to create WebGL shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (! gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error'
    gl.deleteShader(shader)
    throw Error(`Failed to compile WebGL shader: ${log}`)
  }

  return shader
}

function getUniformLocation(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name)
  if (! location) throw Error(`Missing WebGL uniform: ${name}`)
  return location
}
