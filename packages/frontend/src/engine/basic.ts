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
