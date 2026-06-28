import { computed, reactive, type ComputedRef, type Ref } from 'vue'
import { Sizes } from '@engine/constant'

export type GamePanelId = 'chat' | 'clock' | 'members' | 'record'
export type GamePanelSide = 'floating' | 'left' | 'right'

export interface GamePanelLayoutItem {
  collapsed: boolean
  open: boolean
  order: number
  side: GamePanelSide
  size: number
}

export interface GamePanelLayout {
  panels: Record<GamePanelId, GamePanelLayoutItem>
}

export interface GamePanelViewportInsets {
  left: number
  right: number
}

interface PanelLayoutOptions {
  clockOpen: Ref<boolean>
  onlineStudyActive: ComputedRef<boolean>
  viewportWidth: Ref<number>
}

const LEFT_PANEL_DEFAULT_SIZE = 360

export function usePanelLayout({
  clockOpen,
  onlineStudyActive,
  viewportWidth,
}: PanelLayoutOptions) {
  const layout = reactive<GamePanelLayout>({
    panels: {
      record: {
        collapsed: false,
        open: false,
        order: 0,
        side: 'right',
        size: Sizes.RecordPanelWidth,
      },
      clock: {
        collapsed: false,
        open: clockOpen.value,
        order: 1,
        side: 'floating',
        size: 0,
      },
      members: {
        collapsed: false,
        open: false,
        order: 0,
        side: 'left',
        size: LEFT_PANEL_DEFAULT_SIZE,
      },
      chat: {
        collapsed: false,
        open: false,
        order: 1,
        side: 'left',
        size: LEFT_PANEL_DEFAULT_SIZE,
      },
    },
  })

  const viewportInsets = computed<GamePanelViewportInsets>(() => ({
    left: getSideInset('left'),
    right: getSideInset('right'),
  }))

  function isPanelOpen(id: GamePanelId): boolean {
    return id === 'clock' ? clockOpen.value : layout.panels[id].open
  }

  function setPanelOpen(id: GamePanelId, open: boolean) {
    if (id === 'clock') {
      clockOpen.value = open
      layout.panels.clock.open = open
      return
    }
    layout.panels[id].open = open
  }

  function togglePanel(id: GamePanelId): boolean {
    const open = ! isPanelOpen(id)
    setPanelOpen(id, open)
    return open
  }

  function setPanelSize(id: GamePanelId, size: number) {
    const panel = layout.panels[id]
    const maxWidth = Math.max(getMinPanelSize(id), viewportWidth.value - Sizes.ButtonTop * 2)
    panel.size = Math.min(Math.max(size, getMinPanelSize(id)), maxWidth)
  }

  function setSideSize(side: 'left' | 'right', size: number) {
    for (const id of getSidePanelIds(side)) {
      setPanelSize(id, size)
    }
  }

  function setOnlineStudyDefaultPanels() {
    setPanelOpen('members', true)
    setPanelOpen('chat', true)
  }

  function closeStudyPanels() {
    setPanelOpen('members', false)
    setPanelOpen('chat', false)
  }

  function closeAll() {
    setPanelOpen('record', false)
    closeStudyPanels()
  }

  function getPanelSize(id: GamePanelId): number {
    return layout.panels[id].size
  }

  function getSideInset(side: 'left' | 'right'): number {
    const panels = Object.entries(layout.panels)
      .filter(([id, panel]) => {
        if (panel.side !== side) return false
        if (! isPanelOpen(id as GamePanelId)) return false
        if ((id === 'members' || id === 'chat') && ! onlineStudyActive.value) return false
        return true
      })
      .map(([, panel]) => panel)
    if (panels.length === 0) return 0

    const width = Math.max(...panels.map(panel => panel.size))
    return Math.min(width, Math.max(0, viewportWidth.value - Sizes.ButtonTop * 2))
      + Sizes.ButtonTop
      + Sizes.ButtonShadowOffset
  }

  return {
    closeAll,
    closeStudyPanels,
    getPanelSize,
    isPanelOpen,
    layout,
    setOnlineStudyDefaultPanels,
    setPanelOpen,
    setPanelSize,
    setSideSize,
    togglePanel,
    viewportInsets,
  }
}

function getMinPanelSize(id: GamePanelId): number {
  return id === 'record' ? Sizes.RecordPanelMinWidth : 260
}

function getSidePanelIds(side: 'left' | 'right'): GamePanelId[] {
  return side === 'left'
    ? ['members', 'chat']
    : ['record']
}
