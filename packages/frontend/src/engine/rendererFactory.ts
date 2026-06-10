import type { AssetLoadProgressCallback } from '@engine/assets'
import { CanvasRenderer } from '@engine/canvas/renderer'
import type { Logger } from '@engine/logger'
import type { Renderer } from '@engine/renderer'
import { WebGLRenderer } from '@engine/webgl/renderer'

export type RendererBackend = 'canvas' | 'webgl'
export type RendererPreference = 'auto' | RendererBackend
export type RendererFallbackReason = 'unsupported' | 'create-failed'

export interface CreateRendererOptions {
  backend: RendererPreference
  onProgress?: AssetLoadProgressCallback
}

export interface CreateRendererResult {
  renderer: Renderer
  backend: RendererBackend
  fallbackReason?: RendererFallbackReason
}

export async function createGameRenderer(
  canvas: HTMLCanvasElement,
  logger: Logger,
  {
    backend,
    onProgress,
  }: CreateRendererOptions,
): Promise<CreateRendererResult> {
  const webGLSupported = backend !== 'canvas' && isWebGLSupported()
  const shouldTryWebGL = backend === 'webgl' || (backend === 'auto' && webGLSupported)
  let fallbackReason: RendererFallbackReason | undefined

  if (shouldTryWebGL) {
    try {
      return {
        renderer: await WebGLRenderer.create(canvas, logger, onProgress),
        backend: 'webgl',
      }
    }
    catch (error) {
      fallbackReason = 'create-failed'
      logger.warn(`Failed to create WebGL renderer: ${error}`)
      logger.info('Falling back to Canvas renderer.')
    }
  }
  else if (backend === 'auto' && ! webGLSupported) {
    fallbackReason = 'unsupported'
    logger.info('WebGL2 is not available. Using Canvas renderer.')
  }

  return {
    renderer: await CanvasRenderer.create(canvas, logger, onProgress),
    backend: 'canvas',
    fallbackReason,
  }
}

export function isWebGLSupported(): boolean {
  if (typeof document === 'undefined') return false

  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
  })
  if (! gl) return false

  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return true
}

export function parseRendererPreference(
  value: unknown,
  fallback: RendererPreference = 'auto',
): RendererPreference {
  return value === 'auto' || value === 'webgl' || value === 'canvas'
    ? value
    : fallback
}

export function parseRendererPreferenceParam(value: string | null): RendererPreference | null {
  return value === 'auto' || value === 'webgl' || value === 'canvas'
    ? value
    : null
}
