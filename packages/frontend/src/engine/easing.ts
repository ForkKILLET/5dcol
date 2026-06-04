export namespace Easing {
  export const easeInOut = (t: number): number => (
    t * t * (3 - 2 * t)
  )

  export const easeOut = (t: number): number => (
    1 - easeInOut(1 - t)
  )

  export const pulse = (t: number): number => (
    t < 0.5
      ? easeInOut(t * 2)
      : 1 - easeInOut((t - 0.5) * 2)
  )
}
