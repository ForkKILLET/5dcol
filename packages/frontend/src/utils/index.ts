export type Ctor<T = {}, Args extends any[] = any[]> = new (...args: Args) => T

export type Func = (...args: any[]) => any

export type StripIndexSignature<T> = {
  [K in keyof T as K extends `${any}` ? K : never]: T[K]
}

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never

export const exhuastive = (_: never) => {}

export const isElem = <T>(x: unknown, xs: readonly T[]): x is T => (xs as unknown[]).includes(x)

export const clamp = (x: number, min: number, max: number): number => Math.min(Math.max(x, min), max)

export const uninitialized = null as any

export const getCtorName = (obj: {}) => (Object.getPrototypeOf(obj) as Object).constructor.name

export type Effect = () => void

export namespace Effect {
  export const run = (effect: Effect) => effect()

  export const compose = (effects: Effect[]): Effect => (
    () => effects.forEach(Effect.run)
  )

  export function useListener<E extends keyof WindowEventMap>(
    target: Window,
    event: E,
    listener: (this: Window, ev: WindowEventMap[E]) => any,
    options?: boolean | AddEventListenerOptions,
  ): Func
  export function useListener<E extends keyof DocumentEventMap>(
    target: Document,
    event: E,
    listener: (this: Document, ev: DocumentEventMap[E]) => any,
    options?: boolean | AddEventListenerOptions,
  ): Func
  export function useListener<E extends keyof ShadowRootEventMap>(
    target: ShadowRoot,
    event: E,
    listener: (this: ShadowRoot, ev: ShadowRootEventMap[E]) => any,
    options?: boolean | AddEventListenerOptions
  ): Func
  export function useListener<E extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    event: E,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[E]) => any,
    options?: boolean | AddEventListenerOptions
  ): Func

  export function useListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): Effect {
    target.addEventListener(type, listener, options)
    return () => target.removeEventListener(type, listener, options)
  }
}

export class Empty {}

export interface Disposable {
  collect(effect: Effect): void
  adopt<T extends Disposable>(disposable: T): T
  dispose(): void
}

export const Disposable = <Base extends Ctor>(Base: Base) => class extends Base implements Disposable {
  private effects: Effect[] = []
  private disposed = false

  collect(effect: Effect) {
    this.effects.push(effect)
  }

  adopt<T extends Disposable>(disposable: T) {
    this.collect(() => disposable.dispose())
    return disposable
  }

  dispose() {
    if (this.disposed) return
    this.effects.forEach(Effect.run)
    this.disposed = true
  }
}

export type EventMap = Record<string, any[]>
export const EventMap = <EM extends EventMap>() => ({} as EM)
export const kEventMap: unique symbol = Symbol('EventMap')

export type Listener<EM extends EventMap, K extends keyof EM> = (...args: EM[K]) => void
type ListenerMap<EM extends EventMap> = {
  [K in keyof EM]?: Listener<EM, K>[]
}

export interface Emitter<EM extends EventMap> {
  on<K extends keyof EM>(event: K, listener: Listener<EM, K>): Effect
  once<K extends keyof EM>(event: K, listener: Listener<EM, K>): Effect
  emit<K extends keyof EM>(event: K, ...args: EM[K]): void
}

export const Emitter = <EMI extends EventMap, Base extends Ctor<Disposable>>(eventMap: EMI, Base: Base) => {
  type EM = StripIndexSignature<EMI>

  return class extends Base implements Emitter<EM> {
    readonly [kEventMap]: EM = eventMap

    private listenerMap: ListenerMap<EM> = {}

    on<K extends keyof EM>(event: K, listener: Listener<EM, K>): Effect {
      const listeners = this.listenerMap[event] ??= []
      listeners.push(listener)
      const off = () => {
        const i = listeners.indexOf(listener)
        if (i !== -1) listeners.splice(i, 1)
      }
      this.collect(off)
      return off
    }

    once<K extends keyof EM>(event: K, listener: Listener<EM, K>): Effect {
      const wrappedListener: Listener<EM, K> = (...args) => {
        off()
        listener(...args)
      }
      const off = this.on(event, wrappedListener)
      return off
    }

    emit<K extends keyof EM>(event: K, ...args: EM[K]) {
      const listeners = this.listenerMap[event]
      listeners?.forEach(listener => listener(...args))
    }
  }
}