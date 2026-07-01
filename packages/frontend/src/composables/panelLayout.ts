import { computed, type ComputedRef, type Ref } from 'vue'
import { z } from 'zod'
import { Sizes } from '@engine/constant'
import { useStorageRef } from './storage'

export type GamePanelId = 'chat' | 'clock' | 'members' | 'record'
export type GamePanelSide = 'left' | 'right'

export interface GamePanelGroup {
  activePanelId: GamePanelId
  height: number
  id: string
  panelIds: GamePanelId[]
  top: number
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
  clockAvailable: ComputedRef<boolean>
  onlineStudyActive: ComputedRef<boolean>
  viewportWidth: Ref<number>
}

export type GamePanelGroupResizeEdge = 'before' | 'after'

export interface GamePanelGroupResizeSnapshot {
  edge: GamePanelGroupResizeEdge
  groupId: string
  groups: Array<{
    heightPx: number
    id: string
    topPx: number
  }>
  totalHeightPx: number
}

export const PANEL_LAYOUT_STORAGE_KEY = '5dcol.panelLayout'
export const PANEL_LAYOUT_STORAGE_VERSION = 1

const LEFT_PANEL_DEFAULT_SIZE = 360
const DEFAULT_GROUP_PREFIX = 'panel-group'
const MIN_GROUP_HEIGHT = 132

const GamePanelIdSchema = z.enum(['chat', 'clock', 'members', 'record'])
const GamePanelGroupSchema = z.object({
  activePanelId: GamePanelIdSchema,
  height: z.number().refine(Number.isFinite).catch(1),
  id: z.string(),
  panelIds: z.array(GamePanelIdSchema),
  top: z.number().refine(Number.isFinite).catch(Number.NaN),
})
const GamePanelColumnSchema = z.object({
  groups: z.array(GamePanelGroupSchema),
  size: z.number().refine(Number.isFinite).catch(LEFT_PANEL_DEFAULT_SIZE),
})
const StoredPanelLayoutSchema = z.object({
  version: z.literal(PANEL_LAYOUT_STORAGE_VERSION),
  columns: z.object({
    left: GamePanelColumnSchema,
    right: GamePanelColumnSchema,
  }),
  nextGroupId: z.number().int().positive().catch(1),
})

type StoredPanelLayout = z.infer<typeof StoredPanelLayoutSchema>

const ALL_SIDE_PANEL_IDS: GamePanelId[] = ['record', 'members', 'chat', 'clock']
const PANEL_SIDES: GamePanelSide[] = ['left', 'right']
const DEFAULT_LAYOUT: StoredPanelLayout = {
  version: PANEL_LAYOUT_STORAGE_VERSION,
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
  nextGroupId: 1,
}

export function usePanelLayout({
  clockAvailable,
  onlineStudyActive,
  viewportWidth,
}: PanelLayoutOptions) {
  const layout = useStorageRef<StoredPanelLayout>(
    PANEL_LAYOUT_STORAGE_KEY,
    DEFAULT_LAYOUT,
    {
      deep: true,
      parse: raw => normalizeStoredPanelLayout(StoredPanelLayoutSchema.parse(JSON.parse(raw) as unknown)),
      serialize: value => JSON.stringify(normalizeStoredPanelLayout(value)),
    },
  )

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

  function createGroup(side: GamePanelSide, panelIds: GamePanelId[], top = 0, height = 1): GamePanelGroup {
    const id = `${DEFAULT_GROUP_PREFIX}-${side}-${layout.value.nextGroupId++}`
    return {
      activePanelId: panelIds[0],
      height,
      id,
      panelIds: [...panelIds],
      top,
    }
  }

  function isPanelAvailable(id: GamePanelId): boolean {
    if (id === 'clock') return clockAvailable.value
    if (id === 'members' || id === 'chat') return onlineStudyActive.value
    return true
  }

  function isPanelOpen(id: GamePanelId): boolean {
    return isPanelAvailable(id) && isPanelVisible(id)
  }

  function isPanelVisible(id: GamePanelId): boolean {
    return findPanelLocation(id) !== null
  }

  function setPanelOpen(id: GamePanelId, open: boolean) {
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
    const groups = layout.value.columns[side].groups
    const groupCount = groups.length
    if (groupCount === 0) {
      groups.push(createGroup(side, [id], 0, 1))
      return
    }

    const scale = groupCount / (groupCount + 1)
    scaleGroupGeometry(groups, scale)
    groups.push(createGroup(side, [id], scale, 1 - scale))
    normalizeSideGroupLayout(side)
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
      layout.value.columns[side].groups.splice(groupIndex, 1)
      normalizeSideGroupLayout(side)
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
    return layout.value.columns[side].groups.filter(group => {
      const panels = getGroupPanels(group)
      if (panels.length === 0) return false
      if (! panels.includes(group.activePanelId)) group.activePanelId = panels[0]
      return true
    })
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
    layout.value.columns[side].size = Math.min(Math.max(size, minSize), maxWidth)
  }

  function setOnlineStudyDefaultPanels() {
    if (! isPanelVisible('members')) addPanelToSide('members', 'left')
    if (! isPanelVisible('chat')) addPanelToSide('chat', 'left')
  }

  function closeStudyPanels() {
    hidePanel('members')
    hidePanel('chat')
  }

  function closeAll() {
    hidePanel('record')
    hidePanel('clock')
    closeStudyPanels()
  }

  function getPanelSize(id: GamePanelId): number {
    const side = findPanelLocation(id)?.side ?? getDefaultPanelSide(id)
    return layout.value.columns[side].size
  }

  function getSideSize(side: GamePanelSide): number {
    return layout.value.columns[side].size
  }

  function getGroupHeight(group: GamePanelGroup): number {
    return group.height
  }

  function getGroupTop(group: GamePanelGroup): number {
    return group.top
  }

  function getGroupResizeSnapshot(
    side: GamePanelSide,
    groupId: string,
    edge: GamePanelGroupResizeEdge,
    totalHeightPx: number,
  ): GamePanelGroupResizeSnapshot | null {
    const groups = getSideGroups(side)
    const index = groups.findIndex(group => group.id === groupId)
    if (index < 0 || totalHeightPx <= 0) return null

    return {
      edge,
      groupId,
      groups: groups.map(group => ({
        heightPx: group.height * totalHeightPx,
        id: group.id,
        topPx: group.top * totalHeightPx,
      })),
      totalHeightPx,
    }
  }

  function resizeGroupEdge(
    side: GamePanelSide,
    snapshot: GamePanelGroupResizeSnapshot,
    deltaPx: number,
  ) {
    if (snapshot.totalHeightPx <= 0 || snapshot.groups.length === 0) return

    const items = snapshot.groups.map(group => ({
      bottomPx: group.topPx + group.heightPx,
      id: group.id,
      topPx: group.topPx,
    }))
    const index = items.findIndex(group => group.id === snapshot.groupId)
    if (index < 0) return

    const minHeightPx = Math.max(1, Math.min(MIN_GROUP_HEIGHT, snapshot.totalHeightPx / items.length))
    if (snapshot.edge === 'after') {
      resizeGroupAfterEdge(items, index, deltaPx, snapshot.totalHeightPx, minHeightPx)
    } else {
      resizeGroupBeforeEdge(items, index, deltaPx, minHeightPx)
    }

    for (const item of items) {
      const group = findGroupInSide(side, item.id)
      if (! group) continue
      group.top = clampRatio(item.topPx / snapshot.totalHeightPx)
      group.height = clampRatio((item.bottomPx - item.topPx) / snapshot.totalHeightPx)
    }
  }

  function getSideInset(side: GamePanelSide): number {
    const groups = getSideGroups(side).filter(group => (
      getGroupPanels(group).some(id => isPanelOpen(id))
    ))
    if (groups.length === 0) return 0

    const width = layout.value.columns[side].size
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
    for (const side of PANEL_SIDES) {
      const groups = layout.value.columns[side].groups
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        const group = groups[groupIndex]
        const panelIndex = group.panelIds.indexOf(id)
        if (panelIndex >= 0) return { group, groupIndex, panelIndex, side }
      }
    }
    return null
  }

  function findGroup(groupId: string): GamePanelGroup | null {
    for (const side of PANEL_SIDES) {
      const group = layout.value.columns[side].groups.find(item => item.id === groupId)
      if (group) return group
    }
    return null
  }

  function findGroupInSide(side: GamePanelSide, groupId: string): GamePanelGroup | null {
    return layout.value.columns[side].groups.find(group => group.id === groupId) ?? null
  }

  function normalizeSideGroupLayout(side: GamePanelSide) {
    normalizeGroupLayout(layout.value.columns[side].groups)
  }

  return {
    addPanelToGroup,
    addPanelToSide,
    closeAll,
    closeStudyPanels,
    getGroupHeight,
    getGroupPanels,
    getGroupResizeSnapshot,
    getGroupTop,
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
    resizeGroupEdge,
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

function normalizeStoredPanelLayout(layout: StoredPanelLayout): StoredPanelLayout {
  const normalized = StoredPanelLayoutSchema.parse(layout)
  const groupIds = new Set<string>()
  for (const side of PANEL_SIDES) {
    const column = normalized.columns[side]
    column.size = Math.max(getSideMinSize(side), column.size)
    column.groups = column.groups
      .map(group => normalizeGroup(group))
      .filter((group): group is GamePanelGroup => group !== null)
      .filter(group => {
        if (groupIds.has(group.id)) return false
        groupIds.add(group.id)
        return true
      })
    normalizeGroupLayout(column.groups)
  }
  normalized.nextGroupId = Math.max(
    normalized.nextGroupId,
    ...Array.from(groupIds, getGroupIdSequence).map(value => value + 1),
    1,
  )
  return normalized
}

function normalizeGroup(group: GamePanelGroup): GamePanelGroup | null {
  const panelIds = uniquePanelIds(group.panelIds)
  if (panelIds.length === 0) return null
  return {
    ...group,
    activePanelId: panelIds.includes(group.activePanelId) ? group.activePanelId : panelIds[0],
    height: Math.max(0.001, group.height),
    panelIds,
    top: Number.isFinite(group.top) ? group.top : Number.NaN,
  }
}

function uniquePanelIds(panelIds: GamePanelId[]): GamePanelId[] {
  const seen = new Set<GamePanelId>()
  const result: GamePanelId[] = []
  for (const id of panelIds) {
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function normalizeGroupLayout(groups: GamePanelGroup[]) {
  if (groups.length === 0) return
  if (! hasValidGroupGeometry(groups)) {
    packGroupLayoutByHeight(groups)
    return
  }
  for (const group of groups) {
    group.top = clampRatio(group.top)
    group.height = clampRatio(group.height)
  }
}

function hasValidGroupGeometry(groups: GamePanelGroup[]): boolean {
  let previousBottom = 0
  for (const group of groups) {
    if (! Number.isFinite(group.top) || ! Number.isFinite(group.height)) return false
    if (group.height <= 0) return false
    if (group.top < -0.000001) return false
    if (group.top + group.height > 1.000001) return false
    if (group.top < previousBottom - 0.000001) return false
    previousBottom = group.top + group.height
  }
  return true
}

function packGroupLayoutByHeight(groups: GamePanelGroup[]) {
  const total = groups.reduce((sum, group) => (
    sum + (Number.isFinite(group.height) ? Math.max(0.001, group.height) : 0)
  ), 0)
  let cursor = 0
  for (const group of groups) {
    const height = total > 0
      ? Math.max(0.001, group.height) / total
      : 1 / groups.length
    group.top = cursor
    group.height = height
    cursor += height
  }
  if (groups.length > 0) {
    const last = groups[groups.length - 1]
    last.height = Math.max(0.001, 1 - last.top)
  }
}

function scaleGroupGeometry(groups: GamePanelGroup[], scale: number) {
  for (const group of groups) {
    group.top *= scale
    group.height *= scale
  }
}

function resizeGroupAfterEdge(
  items: Array<{ bottomPx: number; id: string; topPx: number }>,
  index: number,
  deltaPx: number,
  totalHeightPx: number,
  minHeightPx: number,
) {
  const item = items[index]
  const startBottom = item.bottomPx
  const minBottom = item.topPx + minHeightPx
  const desiredBottom = startBottom + deltaPx

  if (desiredBottom <= startBottom) {
    item.bottomPx = Math.max(minBottom, desiredBottom)
    return
  }

  const maxBottom = totalHeightPx - minHeightPx * (items.length - index - 1)
  item.bottomPx = Math.min(Math.max(minBottom, desiredBottom), maxBottom)
  let requiredTop = item.bottomPx
  for (let i = index + 1; i < items.length; i++) {
    const next = items[i]
    if (next.topPx >= requiredTop) break

    const originalBottom = next.bottomPx
    if (originalBottom - requiredTop >= minHeightPx) {
      next.topPx = requiredTop
      break
    }

    next.topPx = requiredTop
    next.bottomPx = requiredTop + minHeightPx
    requiredTop = next.bottomPx
  }
}

function resizeGroupBeforeEdge(
  items: Array<{ bottomPx: number; id: string; topPx: number }>,
  index: number,
  deltaPx: number,
  minHeightPx: number,
) {
  const item = items[index]
  const startTop = item.topPx
  const maxTop = item.bottomPx - minHeightPx
  const desiredTop = startTop + deltaPx

  if (desiredTop >= startTop) {
    item.topPx = Math.min(maxTop, desiredTop)
    return
  }

  const minTop = minHeightPx * index
  item.topPx = Math.max(minTop, Math.min(maxTop, desiredTop))
  let requiredBottom = item.topPx
  for (let i = index - 1; i >= 0; i--) {
    const previous = items[i]
    if (previous.bottomPx <= requiredBottom) break

    const originalTop = previous.topPx
    if (requiredBottom - originalTop >= minHeightPx) {
      previous.bottomPx = requiredBottom
      break
    }

    previous.bottomPx = requiredBottom
    previous.topPx = requiredBottom - minHeightPx
    requiredBottom = previous.topPx
  }
}

function clampRatio(value: number): number {
  if (! Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getGroupIdSequence(groupId: string): number {
  const match = /-(\d+)$/.exec(groupId)
  return match ? Number(match[1]) : 0
}
