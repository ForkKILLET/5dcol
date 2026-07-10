import { z } from 'zod'

export const GAME_KEYBINDING_ACTIONS = [
  'undoMove',
  'redoMove',
  'undoAllMoves',
  'submitMoves',
  'panUp',
  'panLeft',
  'panDown',
  'panRight',
  'zoomOut',
  'zoomIn',
  'toggleViewPlayer',
  'recordPrevious',
  'recordNext',
  'recordBlockStart',
  'recordBlockEnd',
  'cycleRecordVariation',
  'toggleRecordPanel',
  'togglePanelPicker',
  'toggleClockPanel',
  'toggleSettings',
] as const

export type GameKeybindingAction = typeof GAME_KEYBINDING_ACTIONS[number]

export interface GameKeybinding {
  code: string
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
}

export type GameKeybindingSettings = Record<GameKeybindingAction, GameKeybinding[]>

const key = (
  code: string,
  modifiers: Partial<Pick<GameKeybinding, 'shift' | 'ctrl' | 'alt' | 'meta'>> = {},
): GameKeybinding => ({
  code,
  shift: modifiers.shift ?? false,
  ctrl: modifiers.ctrl ?? false,
  alt: modifiers.alt ?? false,
  meta: modifiers.meta ?? false,
})

export const DEFAULT_GAME_KEYBINDINGS: GameKeybindingSettings = {
  undoMove: [key('KeyZ'), key('Backspace')],
  redoMove: [key('KeyY')],
  undoAllMoves: [key('KeyZ', { shift: true })],
  submitMoves: [key('KeyF'), key('Enter')],
  panUp: [key('KeyW')],
  panLeft: [key('KeyA')],
  panDown: [key('KeyS')],
  panRight: [key('KeyD')],
  zoomOut: [key('KeyQ')],
  zoomIn: [key('KeyE')],
  toggleViewPlayer: [key('KeyU')],
  recordPrevious: [key('BracketLeft')],
  recordNext: [key('BracketRight')],
  recordBlockStart: [key('BracketLeft', { shift: true })],
  recordBlockEnd: [key('BracketRight', { shift: true })],
  cycleRecordVariation: [key('Backslash')],
  toggleRecordPanel: [key('KeyR')],
  togglePanelPicker: [key('KeyP')],
  toggleClockPanel: [key('KeyC')],
  toggleSettings: [key('Backquote')],
}

const GameKeybindingSchema = z
  .object({
    code: z.string().min(1),
    shift: z.boolean().catch(false),
    ctrl: z.boolean().catch(false),
    alt: z.boolean().catch(false),
    meta: z.boolean().catch(false),
  })
  .transform(binding => ({
    code: binding.code,
    shift: binding.shift,
    ctrl: binding.ctrl,
    alt: binding.alt,
    meta: binding.meta,
  } satisfies GameKeybinding))

const cloneGameKeybinding = (binding: GameKeybinding): GameKeybinding => ({ ...binding })

const cloneGameKeybindingList = (bindings: readonly GameKeybinding[]): GameKeybinding[] => (
  bindings.map(cloneGameKeybinding)
)

const cloneDefaultGameKeybindingSettings = (): GameKeybindingSettings => (
  Object.fromEntries(
    GAME_KEYBINDING_ACTIONS.map(action => [action, cloneGameKeybindingList(DEFAULT_GAME_KEYBINDINGS[action])]),
  ) as GameKeybindingSettings
)

const dedupeGameKeybindings = (bindings: GameKeybinding[]): GameKeybinding[] => {
  const next: GameKeybinding[] = []
  for (const binding of bindings) {
    if (! next.some(candidate => isSameGameKeybinding(candidate, binding))) {
      next.push(binding)
    }
  }
  return next
}

const GameKeybindingListSchema = z.preprocess(
  value => {
    if (Array.isArray(value)) return value
    if (value === null) return []
    if (value && typeof value === 'object') return [value]
    return []
  },
  z.array(GameKeybindingSchema).catch([]),
).transform(dedupeGameKeybindings)

const createActionSchema = () => (
  GameKeybindingListSchema
)

export const GameKeybindingSettingsSchema = z.preprocess(
  value => {
    const settings = value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {}
    return Object.fromEntries(
      GAME_KEYBINDING_ACTIONS.map(action => [
        action,
        settings[action] ?? DEFAULT_GAME_KEYBINDINGS[action],
      ]),
    )
  },
  z.object({
    undoMove: createActionSchema(),
    redoMove: createActionSchema(),
    undoAllMoves: createActionSchema(),
    submitMoves: createActionSchema(),
    panUp: createActionSchema(),
    panLeft: createActionSchema(),
    panDown: createActionSchema(),
    panRight: createActionSchema(),
    zoomOut: createActionSchema(),
    zoomIn: createActionSchema(),
    toggleViewPlayer: createActionSchema(),
    recordPrevious: createActionSchema(),
    recordNext: createActionSchema(),
    recordBlockStart: createActionSchema(),
    recordBlockEnd: createActionSchema(),
    cycleRecordVariation: createActionSchema(),
    toggleRecordPanel: createActionSchema(),
    togglePanelPicker: createActionSchema(),
    toggleClockPanel: createActionSchema(),
    toggleSettings: createActionSchema(),
  }).transform(settings => {
    const defaults = cloneDefaultGameKeybindingSettings()
    return Object.fromEntries(
      GAME_KEYBINDING_ACTIONS.map(action => [action, settings[action] ?? defaults[action]]),
    ) as GameKeybindingSettings
  }),
)

export const normalizeGameKeybindingSettings = (settings: unknown): GameKeybindingSettings => (
  GameKeybindingSettingsSchema.parse(settings)
)

export const gameKeybindingFromEvent = (event: KeyboardEvent): GameKeybinding | null => {
  if (! event.code) return null
  if (event.key === 'Tab') return null
  if (event.key === 'Escape') return null
  if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') return null
  return {
    code: event.code,
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  }
}

export const isSameGameKeybinding = (
  a: GameKeybinding | null | undefined,
  b: GameKeybinding | null | undefined,
): boolean => (
  Boolean(a && b)
  && a!.code === b!.code
  && a!.shift === b!.shift
  && a!.ctrl === b!.ctrl
  && a!.alt === b!.alt
  && a!.meta === b!.meta
)

export const getGameKeybindingAction = (
  event: KeyboardEvent,
  settings: GameKeybindingSettings,
  actions: readonly GameKeybindingAction[] = GAME_KEYBINDING_ACTIONS,
): GameKeybindingAction | null => {
  const binding = gameKeybindingFromEvent(event)
  if (! binding) return null

  return actions.find(action => settings[action].some(candidate => isSameGameKeybinding(candidate, binding))) ?? null
}

export const findGameKeybindingConflict = (
  settings: GameKeybindingSettings,
  action: GameKeybindingAction,
  bindingIndex: number | null,
  binding: GameKeybinding | null,
): GameKeybindingAction | null => {
  if (! binding) return null
  return GAME_KEYBINDING_ACTIONS.find(candidate => (
    settings[candidate].some((candidateBinding, candidateIndex) => (
      (candidate !== action || candidateIndex !== bindingIndex)
      && isSameGameKeybinding(candidateBinding, binding)
    ))
  )) ?? null
}

const CODE_LABELS: Record<string, string> = {
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  Delete: 'Delete',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Esc',
  Minus: '-',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
}

export const formatGameKeybinding = (binding: GameKeybinding | null): string => {
  if (! binding) return '-'

  const parts: string[] = []
  if (binding.ctrl) parts.push('Ctrl')
  if (binding.alt) parts.push('Alt')
  if (binding.shift) parts.push('Shift')
  if (binding.meta) parts.push('Meta')
  parts.push(formatCode(binding.code))
  return parts.join('+')
}

const formatCode = (code: string): string => {
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`
  if (code.startsWith('Arrow')) return code.slice(5)
  return code
}
