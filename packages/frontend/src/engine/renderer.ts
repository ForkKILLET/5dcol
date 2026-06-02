import { Mat3, type Color4, type Device as Screen, type Camera, Vec2, Transform } from '@engine/basic'
import type { TextureID } from '@engine/texture'
import type { Logger } from '@engine/logger'
import { RenderLayer } from '@engine/constant'
import { Disposable, Empty, exhuastive, uninitialized } from '@/utils'

export abstract class Renderer extends Disposable(Empty) {
  constructor(
    protected logger: Logger,
  ) {
    super()
  }

  protected camera: Camera = {
    scale: 1,
    center: [0, 0],
  }
  protected screen: Screen = uninitialized

  protected worldToDeviceMat: Mat3 = uninitialized
  protected worldToScreenMat: Mat3 = uninitialized
  protected screenToWorldMat: Mat3 = uninitialized

  protected renderItems: RenderItem[] = []

  abstract drawQuad(item: QuadRenderItem): void
  abstract drawRoundRect(item: RoundRectRenderItem): void
  abstract drawPolygon(item: PolygonRenderItem): void
  abstract drawCircle(item: CircleRenderItem): void
  abstract drawTexture(item: TextureRenderItem): void
  abstract drawText(item: TextRenderItem): void

  start() {
    this.resize()
  }

  resize() {
    const dpr = window.devicePixelRatio || 1
    const widthCss = window.innerWidth
    const heightCss = window.innerHeight

    this.setScreen({ dpr, widthCss, heightCss })


    this.updateProjMats()
  }

  getScreen(): Screen { return this.screen }
  setScreen(screen: Screen) {
    this.screen = screen
  }

  getCamera(): Camera { return this.camera }
  setCamera(camera: Partial<Camera>) {
    this.camera = { ...this.camera, ...camera }
    this.updateProjMats()
  }

  worldToScreen(pos: Vec2): Vec2 {
    return Mat3.apply(this.worldToScreenMat, pos)
  }
  screenToWorld(pos: Vec2): Vec2 {
    return Mat3.apply(this.screenToWorldMat, pos)
  }

  protected updateProjMats() {
    const widthDevice = Math.floor(this.screen.widthCss * this.screen.dpr)
    const heightDevice = Math.floor(this.screen.heightCss * this.screen.dpr)
    const deviceTransform: Transform = [
      [widthDevice / 2, heightDevice / 2],
      Vec2.splat(this.screen.dpr)
    ]
    const screenTransform: Transform = [
      [this.screen.widthCss / 2, this.screen.heightCss / 2],
      Vec2.splat(1)
    ]
    const cameraTransform: Transform = [
      Vec2.scale(Vec2.neg(this.camera.center), this.camera.scale),
      Vec2.splat(this.camera.scale),
    ]

    this.worldToDeviceMat = Mat3.multiply(
      Mat3.transform(...deviceTransform),
      Mat3.transform(...cameraTransform),
    )
    this.worldToScreenMat = Mat3.multiply(
      Mat3.transform(...screenTransform),
      Mat3.transform(...cameraTransform),
    )
    this.screenToWorldMat = Mat3.multiply(
      Mat3.transformInv(...cameraTransform),
      Mat3.transformInv(...screenTransform),
    )
  }

  submit(item: RenderItem) {
    this.renderItems.push(item)
  }

  flush() {
    this.renderItems.sort((a, b) => a.layer - b.layer)

    for (const item of this.renderItems) {
      switch (item.type) {
        case RenderItemType.Quad:
          this.drawQuad(item)
          break
        case RenderItemType.RoundRect:
          this.drawRoundRect(item)
          break
        case RenderItemType.Texture:
          this.drawTexture(item)
          break
        case RenderItemType.Polygon:
          this.drawPolygon(item)
          break
        case RenderItemType.Circle:
          this.drawCircle(item)
          break
        case RenderItemType.Text:
          this.drawText(item)
          break
        default:
          exhuastive(item)
      }
    }

    this.renderItems = []
  }
}

export const enum RenderItemType {
  Quad,
  RoundRect,
  Texture,
  Polygon,
  Circle,
  Text,
}

export interface RenderItemBase {
  layer: RenderLayer
}

export interface QuadRenderItem extends RenderItemBase {
  type: RenderItemType.Quad
  mat: Mat3
  color: Color4
}

export interface RoundRectRenderItem extends RenderItemBase {
  type: RenderItemType.RoundRect
  pos: Vec2
  size: Vec2
  radius: number | CornerRadii
  fill: Color4 | null
  stroke: Color4 | null
  strokeWidth?: number
}

export interface CornerRadii {
  tl: number
  tr: number
  br: number
  bl: number
}

export interface TextureRenderItem extends RenderItemBase {
  type: RenderItemType.Texture
  mat: Mat3
  textureId: TextureID
}

export interface PolygonRenderItem extends RenderItemBase {
  type: RenderItemType.Polygon
  points: Vec2[]
  fill: Color4 | null
  stroke: Color4 | null
  strokeWidth?: number
}

export interface CircleRenderItem extends RenderItemBase {
  type: RenderItemType.Circle
  center: Vec2
  radius: number
  fill: Color4 | null
  stroke: Color4 | null
  strokeWidth?: number
}

export interface TextRenderItem extends RenderItemBase {
  type: RenderItemType.Text
  pos: Vec2
  angle: number
  text: string
  fontSize: number
  fontFamily: string
  fontStyle?: string
  color: Color4
  align: CanvasTextAlign
  baseline: CanvasTextBaseline
}

export type RenderItem =
  | QuadRenderItem
  | RoundRectRenderItem
  | TextureRenderItem
  | PolygonRenderItem
  | CircleRenderItem
  | TextRenderItem
