/**
 * 3×3 matrix, column-major
 * ```
 * [ a d 0 ]
 * [ b e 0 ]
 * [ c f 1 ]
 * ```
 */
export type Mat3 = Float32Array

export namespace Mat3 {
  export const empty = (): Mat3 => new Float32Array(9)

  export const identity = (): Mat3 => new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ])

  export const translate = (tx: number, ty: number): Mat3 => new Float32Array([
    1,  0,  0,
    0,  1,  0,
    tx, ty, 1,
  ])

  export const scale = (sx: number, sy: number): Mat3 => new Float32Array([
    sx, 0,  0,
    0,  sy, 0,
    0,  0,  1,
  ])

  export const multiply = (a: Mat3, b: Mat3): Mat3 => {
    const out = empty()
    for (let r = 0; r < 3; r ++) {
      for (let c = 0; c < 3; c ++) {
        out[c * 3 + r] = (
          a[0 * 3 + r] * b[c * 3 + 0] +
          a[1 * 3 + r] * b[c * 3 + 1] +
          a[2 * 3 + r] * b[c * 3 + 2]
        )
      }
    }
    return out
  }

  export const transform = ([x, y]: Vec2, [w, h]: Vec2): Mat3 => new Float32Array([
    w, 0, 0,
    0, h, 0,
    x, y, 1,
  ])

  export const transformInv = ([x, y]: Vec2, [w, h]: Vec2): Mat3 => {
    const wi = 1 / w
    const hi = 1 / h
    return new Float32Array([
      wi,       0,        0,
      0,        hi,       0,
      -x * wi,  -y * hi,  1,
    ])
  }

  export const apply = (mat: Mat3, [x0, y0]: Vec2): Vec2 => {
    const x1 = mat[0] * x0 + mat[3] * y0 + mat[6]
    const y1 = mat[1] * x0 + mat[4] * y0 + mat[7]
    return [x1, y1]
  }
}

export namespace Scalar {
  export const lerp = (a: number, b: number, t: number): number => (
    a + (b - a) * t
  )

  export const clamp = (x: number, min: number, max: number): number => (
    Math.min(Math.max(x, min), max)
  )

  export const smoothstep = (t: number): number => (
    t * t * (3 - 2 * t)
  )
}

export type Vec2 = [number, number]

export namespace Vec2 {
  export const add = ([x0, y0]: Vec2, [x1, y1]: Vec2): Vec2 =>
    [x0 + x1, y0 + y1]

  export const sub = ([x0, y0]: Vec2, [x1, y1]: Vec2): Vec2 =>
    [x0 - x1, y0 - y1]
  
  export const scale = ([x, y]: Vec2, s: number): Vec2 =>
    [x * s, y * s]

  export const neg = ([x, y]: Vec2): Vec2 =>
    [-x, -y]

  export const splat = (m: number): Vec2 =>
    [m, m]

  export const length = ([x, y]: Vec2): number =>
    Math.sqrt(x * x + y * y)

  export const mix = ([x0, y0]: Vec2, [x1, y1]: Vec2, t: number): Vec2 => [
    Scalar.lerp(x0, x1, t),
    Scalar.lerp(y0, y1, t),
  ]

  export namespace curry {
    export const add = (a: Vec2) => (b: Vec2) => Vec2.add(a, b)

    export const sub = (a: Vec2) => (b: Vec2) => Vec2.sub(b, a)

    export const scale = (s: number) => (v: Vec2) => Vec2.scale(v, s)
  }
}

export type Rect = [pos: Vec2, size: Vec2]

export const Rect = {
  clampPoint: ([x, y]: Vec2, [[rx, ry], [rw, rh]]: Rect): Vec2 => [
    Scalar.clamp(x, rx, rx + rw),
    Scalar.clamp(y, ry, ry + rh),
  ],

  bounds: (rects: Rect[]): Rect | null => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity

    for (const [[x, y], [w, h]] of rects) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + w)
      y1 = Math.max(y1, y + h)
    }

    if (! Number.isFinite(x0) || ! Number.isFinite(y0)) return null
    return [[x0, y0], [x1 - x0, y1 - y0]]
  },

  center: ([pos, size]: Rect): Vec2 => (
    Vec2.add(pos, Vec2.scale(size, 0.5))
  ),
}

export const CubicBezier = {
  point: (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
    const u = 1 - t
    return [
      u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1],
    ]
  },

  tangent: (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
    const u = 1 - t
    return [
      3 * u ** 2 * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t ** 2 * (p3[0] - p2[0]),
      3 * u ** 2 * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t ** 2 * (p3[1] - p2[1]),
    ]
  },

  length: (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, samples: number): number => {
    let length = 0
    let prev = p0

    for (let i = 1; i <= samples; i ++) {
      const point = CubicBezier.point(p0, p1, p2, p3, i / samples)
      length += Vec2.length(Vec2.sub(point, prev))
      prev = point
    }

    return length
  },

  tAtDistanceProgress: (
    p0: Vec2,
    p1: Vec2,
    p2: Vec2,
    p3: Vec2,
    progress: number,
    samples: number,
  ): number => {
    const targetDistance = CubicBezier.length(p0, p1, p2, p3, samples)
      * Scalar.clamp(progress, 0, 1)
    if (targetDistance <= 0) return 0

    let distance = 0
    let prev = p0

    for (let i = 1; i <= samples; i ++) {
      const t = i / samples
      const point = CubicBezier.point(p0, p1, p2, p3, t)
      const segmentLength = Vec2.length(Vec2.sub(point, prev))

      if (distance + segmentLength >= targetDistance) {
        const segmentProgress = segmentLength === 0
          ? 0
          : (targetDistance - distance) / segmentLength
        return Scalar.lerp((i - 1) / samples, t, segmentProgress)
      }

      distance += segmentLength
      prev = point
    }

    return 1
  },
}

/**
 * `[position, scale]`
 */
export type Transform = [Vec2, Vec2]

export type Color4 = [number, number, number, number]

export namespace Color4 {
  export const toRgbaString = (color: Color4): string => (
    `rgba(${Math.floor(color[0] * 255)}, ${Math.floor(color[1] * 255)}, ${Math.floor(color[2] * 255)}, ${color[3]})`
  )

  export const fromRgba = (r: number, g: number, b: number, a: number): Color4 => [
    r / 255, g / 255, b / 255, a
  ]

  export const mix = (a: Color4, b: Color4, t: number): Color4 => [
    Scalar.lerp(a[0], b[0], t),
    Scalar.lerp(a[1], b[1], t),
    Scalar.lerp(a[2], b[2], t),
    Scalar.lerp(a[3], b[3], t),
  ]

  export const withAlpha = (color: Color4, alpha: number): Color4 => (
    [color[0], color[1], color[2], color[3] * alpha]
  )
}

export interface Camera {
  scale: number
  center: Vec2
}

export interface Device {
  dpr: number
  widthCss: number
  heightCss: number
}
