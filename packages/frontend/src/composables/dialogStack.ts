import { computed, shallowRef } from 'vue'

export function useDialogStack<T extends string>() {
  const stack = shallowRef<T[]>([])
  const current = computed<T | 'none'>(() => stack.value.at(-1) ?? 'none')
  const previous = computed<T | null>(() => stack.value.at(-2) ?? null)

  function open(mode: T) {
    stack.value = [mode]
  }

  function push(mode: T) {
    stack.value = [...stack.value, mode]
  }

  function replace(mode: T) {
    stack.value = stack.value.length > 0
      ? [...stack.value.slice(0, -1), mode]
      : [mode]
  }

  function back() {
    stack.value = stack.value.slice(0, -1)
  }

  function close() {
    stack.value = []
  }

  return {
    back,
    close,
    current,
    open,
    previous,
    push,
    replace,
    stack,
  }
}
