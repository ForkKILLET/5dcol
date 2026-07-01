import { computed, reactive, type ComputedRef, type Ref } from 'vue'
import { Sizes } from '@engine/constant'

export type GamePanelId = 'chat' | 'clock' | 'members' | 'record'
export type GamePanelSide = 'left' | 'right'

export interface GamePanelGroup {
  activePanelId: GamePanelId
  id: string
  panelIds: GamePanelId[]
}

export interface GamePanelColumn {
  groups: GamePanelGroup[]
  size: number
}

export interface GamePanelLayout {
  columns: Record<GamePanelSide, GamePanelColumn>
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
const DEFAULT_GROUP_PREFIX = 'panel-group'

const ALL_SIDE_PANEL_IDS: GamePanelId[] = ['record', 'members', 'chat']

export function usePanelLayout({
  clockOpen,
  onlineStudyActive,
  viewportWidth,
}: PanelLayoutOptions) {
  let nextGroupId = 1

  const layout = reactive<GamePanelLayout>({
    columns: {
      left: {
        size: LEFT_PANEL_DEFAULT_SIZE,
        groups: [],
      },
      right: {
        size: Sizes.RecordPanelWidth,
        groups: [],
      },
    },
  })

  const viewportInsets = computed<GamePanelViewportInsets>(() => ({
    left: getSideInset('left'),
    right: getSideInset('right'),
  }))

  const visiblePanelIds = computed(() => (
    ALL_SIDE_PANEL_IDS.filter(id => isPanelVisible(id))
  ))

  const hiddenPanelIds = computed(() => (
    ALL_SIDE_PANEL_IDS.filter(id => isPanelAvailable(id) && ! isPanelVisible(id))
  ))

  function createGroup(side: GamePanelSide, panelIds: GamePanelId[]): GamePanelGroup {
    return {
      id: `${DEFAULT_GROUP_PREFIX}-${side}-${nextGroupId++}`,
      activePanelId: panelIds[0],
      panelIds: [...panelIds],
    }
  }

  function isPanelAvailable(id: GamePanelId): boolean {
    if (id === 'clock') return true
    if (id === 'members' || id === 'chat') return onlineStudyActive.value
    return true
  }

  function isPanelOpen(id: GamePanelId): boolean {
    if (id === 'clock') return clockOpen.value
    return isPanelAvailable(id) && isPanelVisible(id)
  }

  function isPanelVisible(id: GamePanelId): boolean {
    return findPanelLocation(id) !== null
  }

  function setPanelOpen(id: GamePanelId, open: boolean) {
    if (id === 'clock') {
      clockOpen.value = open
      return
    }
    if (open) showPanel(id)
    else hidePanel(id)
  }

  function togglePanel(id: GamePanelId): boolean {
    const open = ! isPanelOpen(id)
    setPanelOpen(id, open)
    return open
  }

  function showPanel(id: GamePanelId) {
    if (! isPanelAvailable(id)) return
    const location = findPanelLocation(id)
    if (location) {
      location.group.activePanelId = id
      return
    }
    const side = getDefaultPanelSide(id)
    addPanelToSide(id, side)
  }

  function addPanelToSide(id: GamePanelId, side: GamePanelSide) {
    if (! isPanelAvailable(id)) return
    hidePanel(id)
    layout.columns[side].groups.push(createGroup(side, [id]))
  }

  function addPanelToGroup(id: GamePanelId, groupId: string) {
    if (! isPanelAvailable(id)) return
    const group = findGroup(groupId)
    if (! group) return
    hidePanel(id)
    group.panelIds.push(id)
    group.activePanelId = id
  }

  function hidePanel(id: GamePanelId) {
    const location = findPanelLocation(id)
    if (! location) return

    const { group, groupIndex, panelIndex, side } = location
    group.panelIds.splice(panelIndex, 1)
    if (group.panelIds.length === 0) {
      layout.columns[side].groups.splice(groupIndex, 1)
      return
    }
    if (group.activePanelId === id) {
      group.activePanelId = group.panelIds[Math.min(panelIndex, group.panelIds.length - 1)]
    }
  }

  function setGroupActivePanel(groupId: string, panelId: GamePanelId) {
    const group = findGroup(groupId)
    if (! group || ! group.panelIds.includes(panelId)) return
    group.activePanelId = panelId
  }

  function getSideGroups(side: GamePanelSide): GamePanelGroup[] {
    return layout.columns[side].groups.filter(group => (
      group.panelIds.some(id => isPanelAvailable(id))
    ))
  }

  function getGroupPanels(group: GamePanelGroup): GamePanelId[] {
    return group.panelIds.filter(id => isPanelAvailable(id))
  }

  function setPanelSize(id: GamePanelId, size: number) {
    const side = findPanelLocation(id)?.side ?? getDefaultPanelSide(id)
    setSideSize(side, size)
  }

  function setSideSize(side: GamePanelSide, size: number) {
    const minSize = getSideMinSize(side)
    const maxWidth = Math.max(minSize, viewportWidth.value - Sizes.ButtonTop * 2)
    layout.columns[side].size = Math.min(Math.max(size, minSize), maxWidth)
  }

  function setOnlineStudyDefaultPanels() {
    if (! isPanelOpen('members')) addPanelToSide('members', 'left')
    if (! isPanelOpen('chat')) addPanelToSide('chat', 'left')
  }

  function closeStudyPanels() {
    hidePanel('members')
    hidePanel('chat')
  }

  function closeAll() {
    hidePanel('record')
    closeStudyPanels()
  }

  function getPanelSize(id: GamePanelId): number {
    const side = findPanelLocation(id)?.side ?? getDefaultPanelSide(id)
    return layout.columns[side].size
  }

  function getSideSize(side: GamePanelSide): number {
    return layout.columns[side].size
  }

  function getSideInset(side: GamePanelSide): number {
    const groups = getSideGroups(side).filter(group => (
      getGroupPanels(group).some(id => isPanelOpen(id))
    ))
    if (groups.length === 0) return 0

    const width = layout.columns[side].size
    return Math.min(width, Math.max(0, viewportWidth.value - Sizes.ButtonTop * 2))
      + Sizes.ButtonTop
      + Sizes.ButtonShadowOffset
  }

  function findPanelLocation(id: GamePanelId): {
    group: GamePanelGroup
    groupIndex: number
    panelIndex: number
    side: GamePanelSide
  } | null {
    for (const side of ['left', 'right'] as const) {
      const groups = layout.columns[side].groups
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex]
        const panelIndex = group.panelIds.indexOf(id)
        if (panelIndex >= 0) return { group, groupIndex, panelIndex, side }
      }
    }
    return null
  }

  function findGroup(groupId: string): GamePanelGroup | null {
    for (const side of ['left', 'right'] as const) {
      const group = layout.columns[side].groups.find(item => item.id === groupId)
      if (group) return group
    }
    return null
  }

  return {
    addPanelToGroup,
    addPanelToSide,
    closeAll,
    closeStudyPanels,
    getGroupPanels,
    getPanelSize,
    getSideGroups,
    getSideSize,
    hiddenPanelIds,
    isPanelAvailable,
    isPanelOpen,
    isPanelVisible,
    layout,
    setGroupActivePanel,
    setOnlineStudyDefaultPanels,
    setPanelOpen,
    setPanelSize,
    setSideSize,
    togglePanel,
    visiblePanelIds,
    viewportInsets,
  }
}

function getDefaultPanelSide(id: GamePanelId): GamePanelSide {
  return id === 'record' ? 'right' : 'left'
}

function getMinPanelSize(id: GamePanelId): number {
  return id === 'record' ? Sizes.RecordPanelMinWidth : 260
}

function getSideMinSize(side: GamePanelSide): number {
  return side === 'right'
    ? getMinPanelSize('record')
    : Math.max(getMinPanelSize('members'), getMinPanelSize('chat'))
}
