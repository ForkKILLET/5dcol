import type { InjectionKey } from 'vue'

export const UiSoundKey: InjectionKey<() => void> = Symbol('ui-sound')
