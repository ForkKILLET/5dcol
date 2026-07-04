import { computed, type ComputedRef, type Ref } from 'vue'
import { z } from 'zod'
import { Sizes } from '@engine/constant'
import { useStorageRef } from './storage'

export type GamePanelId = 'axisView' | 'chat' | 'clock' | 'members' | 'minimap' | 'record'
export type GamePanelSide = 'left' | 'right'
export type GamePanelStretch = 'bottom' | 'never' | 'top' | 'top-bottom'

export interface GamePanelGroup {
  activePanelId: GamePanelId
  height: number
  id: string
  panelIds: GamePanelId[]
  savedFreeAfter?: number
  savedFreeBefore?: number
  stretch?: GamePanelStretch
  top: number
  width?: number
}

export interface GamePanelColumn {
  groups: GamePanelGroup[]
  size?: number
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
  viewportHeight: Ref<number>
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

interface DetachedPanel {
  groupId: string
  groupHeight: number
  groupIndex: number
  groupStretch?: GamePanelStretch
  groupTop: number
  groupWidth?: number
  panelIndex: number
  removedGroup: boolean
  side: GamePanelSide
}

export const PANEL_LAYOUT_STORAGE_KEY = '5dcol.panelLayout'
export const PANEL_LAYOUT_STORAGE_VERSION = 4

const LEFT_PANEL_DEFAULT_SIZE = 360
const DEFAULT_GROUP_PREFIX = 'panel-group'
const MIN_GROUP_HEIGHT = 132
const GROUP_WIDTH_SNAP_PX = 10
const FILL_PANEL_IDS = new Set<GamePanelId>(['chat', 'members', 'record'])
const COMPACT_PANEL_DEFAULT_HEIGHT = 0.2
const COMPACT_PANEL_DEFAULT_WIDTHS = new Map<GamePanelId, number>([
  ['axisView', 520],
  ['clock', 260],
  ['minimap', 260],
])

const GamePanelIdSchema = z.enum(['axisView', 'chat', 'clock', 'members', 'minimap', 'record'])
const GamePanelStretchSchema = z.enum(['bottom', 'never', 'top', 'top-bottom'])
const GamePanelGroupSchema = z.object({
  activePanelId: GamePanelIdSchema,
  height: z.number().refine(Number.isFinite).catch(1),
  id: z.string(),
  panelIds: z.array(GamePanelIdSchema),
  savedFreeAfter: z.number().refine(Number.isFinite).optional().catch(undefined),
  savedFreeBefore: z.number().refine(Number.isFinite).optional().catch(undefined),
  stretch: GamePanelStretchSchema.optional(),
  top: z.number().refine(Number.isFinite).catch(Number.NaN),
  width: z.number().refine(Number.isFinite).optional().catch(undefined),
})
const GamePanelColumnSchema = z.object({
  groups: z.array(GamePanelGroupSchema),
  size: z.number().refine(Number.isFinite).optional().catch(undefined),
})
const StoredPanelLayoutSchema = z.object({
  version: z.union([z.literal(3), z.literal(PANEL_LAYOUT_STORAGE_VERSION)]),
  columns: z.object({
    left: GamePanelColumnSchema,
    right: GamePanelColumnSchema,
  }),
  nextGroupId: z.number().int().positive().catch(1),
})

type StoredPanelLayout = z.infer<typeof StoredPanelLayoutSchema>

const ALL_SIDE_PANEL_IDS: GamePanelId[] = ['record', 'axisView', 'minimap', 'members', 'chat', 'clock']
const PANEL_SIDES: GamePanelSide[] = ['left', 'right']
const DEFAULT_LAYOUT: StoredPanelLayout = {
  version: PANEL_LAYOUT_STORAGE_VERSION,
  columns: {
    left: {
      groups: [{
        activePanelId: 'minimap',
        height: 0.2,
        id: `${DEFAULT_GROUP_PREFIX}-left-1`,
        panelIds: ['minimap'],
        stretch: 'never',
        top: 0,
        width: 260,
      }],
    },
    right: {
      groups: [{
        activePanelId: 'record',
        height: 1,
        id: `${DEFAULT_GROUP_PREFIX}-right-2`,
        panelIds: ['record'],
        stretch: 'top-bottom',
        top: 0,
        width: Sizes.RecordPanelWidth,
      }],
    },
  },
  nextGroupId: 3,
}

export function usePanelLayout({
  clockAvailable,
  onlineStudyActive,
  viewportHeight,
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

  function createGroup(
    side: GamePanelSide,
    panelIds: GamePanelId[],
    top = 0,
    height = getDefaultGroupHeight(panelIds),
    width = getDefaultGroupWidth(side, panelIds),
  ): GamePanelGroup {
    const id = `${DEFAULT_GROUP_PREFIX}-${side}-${layout.value.nextGroupId++}`
    const stretch = getDefaultGroupStretch(panelIds)
    return {
      activePanelId: panelIds[0],
      height,
      id,
      panelIds: [...panelIds],
      stretch,
      top,
      width,
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
      groups.push(createGroup(side, [id]))
      normalizeSideGroupLayout(side)
      return
    }

    appendPanelGroup(groups, createGroup(side, [id]), getPanelGroupGapRatio())
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

  function movePanelToGroup(id: GamePanelId, groupId: string, panelIndex: number) {
    if (! isPanelAvailable(id)) return
    const targetBefore = findGroupLocation(groupId)
    if (! targetBefore) return

    const sourceBefore = findPanelLocation(id)
    if (sourceBefore?.group.id === groupId) {
      const nextIndex = clampPanelIndex(panelIndex, sourceBefore.group.panelIds.length)
      if (nextIndex === sourceBefore.panelIndex || nextIndex === sourceBefore.panelIndex + 1) {
        sourceBefore.group.activePanelId = id
        return
      }
    }

    const detached = detachPanel(id)
    if (! detached) return

    const target = findGroupLocation(groupId)
    if (! target) {
      insertPanelAsNewGroup(id, targetBefore.side, targetBefore.groupIndex, detached)
      normalizeChangedSideLayouts(detached.side, targetBefore.side, true)
      return
    }

    const insertionIndex = detached.groupId === groupId && detached.panelIndex < panelIndex
      ? panelIndex - 1
      : panelIndex
    target.group.panelIds.splice(
      clampPanelIndex(insertionIndex, target.group.panelIds.length),
      0,
      id,
    )
    target.group.activePanelId = id
    normalizeChangedSideLayouts(detached.side, target.side, detached.removedGroup)
  }

  function movePanelToNewGroup(
    id: GamePanelId,
    side: GamePanelSide,
    groupIndex: number,
    options: { anchor?: 'bottom' | 'top', place?: 'after-previous' | 'before-next' } = {},
  ) {
    if (! isPanelAvailable(id)) return
    const detached = detachPanel(id)
    if (! detached) return

    const targetIndex = detached.removedGroup && detached.side === side && detached.groupIndex < groupIndex
      ? groupIndex - 1
      : groupIndex
    insertPanelAsNewGroup(id, side, targetIndex, detached, options)
    normalizeChangedSideLayouts(detached.side, side, true)
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

  function detachPanel(id: GamePanelId): DetachedPanel | null {
    const location = findPanelLocation(id)
    if (! location) return null

    const { group, groupIndex, panelIndex, side } = location
    const groupId = group.id
    const groupHeight = group.height
    const groupStretch = group.stretch
    const groupTop = group.top
    const groupWidth = group.width
    group.panelIds.splice(panelIndex, 1)
    const removedGroup = group.panelIds.length === 0
    if (removedGroup) {
      layout.value.columns[side].groups.splice(groupIndex, 1)
    }
    else if (group.activePanelId === id) {
      group.activePanelId = group.panelIds[Math.min(panelIndex, group.panelIds.length - 1)]
    }

    return {
      groupId,
      groupHeight,
      groupIndex,
      groupStretch,
      groupTop,
      groupWidth,
      panelIndex,
      removedGroup,
      side,
    }
  }

  function insertPanelAsNewGroup(
    id: GamePanelId,
    side: GamePanelSide,
    groupIndex: number,
    detached: Pick<DetachedPanel, 'groupHeight' | 'groupStretch' | 'groupTop' | 'groupWidth'> | undefined,
    options: { anchor?: 'bottom' | 'top', place?: 'after-previous' | 'before-next' } = {},
  ) {
    const groups = layout.value.columns[side].groups
    const group = createGroup(side, [id])
    if (detached) {
      group.height = detached.groupHeight
      group.stretch = detached.groupStretch
      group.top = detached.groupTop
      if (detached.groupWidth !== undefined) group.width = detached.groupWidth
    }
    if (options.anchor === 'top') {
      group.top = 0
    }
    else if (options.anchor === 'bottom') {
      group.top = Math.max(0, 1 - group.height)
    }
    else if (options.place === 'after-previous') {
      const previous = groups[groupIndex - 1]
      if (previous) group.top = clampRatio(previous.top + previous.height + getPanelGroupGapRatio())
    }
    else if (options.place === 'before-next') {
      const next = groups[groupIndex]
      if (next) group.top = clampRatio(next.top - group.height - getPanelGroupGapRatio())
    }
    groups.splice(clampGroupIndex(groupIndex, groups.length), 0, group)
  }

  function setGroupActivePanel(groupId: string, panelId: GamePanelId) {
    const group = findGroup(groupId)
    if (! group || ! group.panelIds.includes(panelId)) return
    group.activePanelId = panelId
  }

  function getSideGroups(side: GamePanelSide): GamePanelGroup[] {
    return getRenderableSideGroups(side)
  }

  function getGroupPanels(group: GamePanelGroup): GamePanelId[] {
    return group.panelIds.filter(id => isPanelAvailable(id))
  }

  function setPanelSize(id: GamePanelId, size: number) {
    const location = findPanelLocation(id)
    if (location) setGroupWidth(location.side, location.group.id, size)
  }

  function setGroupWidth(
    side: GamePanelSide,
    groupId: string,
    size: number,
    options: { snap?: boolean } = {},
  ): { snapped: boolean, width: number } | null {
    const group = findGroupInSide(side, groupId)
    if (! group) return null

    const width = clampGroupWidth(group, size, viewportWidth.value)
    const snapWidth = options.snap === false ? null : getGroupWidthSnapCandidate(side, groupId, width)
    if (snapWidth !== null) {
      group.width = snapWidth
      return { snapped: true, width: snapWidth }
    }
    group.width = width
    return { snapped: false, width }
  }

  function getGroupWidthSnapCandidate(side: GamePanelSide, groupId: string, width: number): number | null {
    let best: { distance: number, width: number } | null = null
    for (const group of getSideGroups(side)) {
      if (group.id === groupId) continue
      const candidateWidth = getGroupWidth(side, group)
      const distance = Math.abs(width - candidateWidth)
      if (distance > GROUP_WIDTH_SNAP_PX) continue
      if (best === null || distance < best.distance) {
        best = { distance, width: candidateWidth }
      }
    }
    return best?.width ?? null
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
    const location = findPanelLocation(id)
    return location ? getGroupWidth(location.side, location.group) : getDefaultGroupWidth(getDefaultPanelSide(id), [id])
  }

  function getSideSize(side: GamePanelSide): number {
    const groups = getSideGroups(side)
    if (groups.length === 0) return getDefaultSideWidth(side)
    return groups.reduce((width, group) => Math.max(width, getGroupWidth(side, group)), 0)
  }

  function getGroupWidth(side: GamePanelSide, group: GamePanelGroup): number {
    return clampGroupWidth(group, group.width ?? getDefaultGroupWidth(side, group.panelIds), viewportWidth.value)
  }

  function getGroupHeight(group: GamePanelGroup): number {
    return group.height
  }

  function getGroupStretch(group: GamePanelGroup): GamePanelStretch {
    return getEffectiveGroupStretch(group)
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

    const gapPx = getPanelGroupGapPx(snapshot.totalHeightPx)
    const totalGapPx = gapPx * Math.max(0, items.length - 1)
    const minHeightPx = Math.max(1, Math.min(MIN_GROUP_HEIGHT, (snapshot.totalHeightPx - totalGapPx) / items.length))
    if (snapshot.edge === 'after') {
      resizeGroupAfterEdge(items, index, deltaPx, snapshot.totalHeightPx, minHeightPx, gapPx)
    } else {
      resizeGroupBeforeEdge(items, index, deltaPx, minHeightPx, gapPx)
    }

    for (const item of items) {
      const group = findGroupInSide(side, item.id)
      if (! group) continue
      if (group.id === snapshot.groupId) {
        group.stretch = removeGroupStretchEdge(getEffectiveGroupStretch(group), snapshot.edge)
        clearSavedFreeEdge(group, snapshot.edge)
      }
      group.top = clampRatio(item.topPx / snapshot.totalHeightPx)
      group.height = clampRatio((item.bottomPx - item.topPx) / snapshot.totalHeightPx)
    }
  }

  function toggleGroupStretchEdge(side: GamePanelSide, groupId: string, edge: GamePanelGroupResizeEdge) {
    const group = findGroupInSide(side, groupId)
    if (! group) return
    const stretch = getEffectiveGroupStretch(group)
    if (hasStretchEdge(stretch, edge)) {
      group.stretch = removeGroupStretchEdge(stretch, edge)
      restoreSavedFreeEdge(group, edge)
    } else {
      saveFreeEdge(group, edge)
      group.stretch = addStretchEdge(stretch, edge)
    }
    normalizeSideGroupLayout(side)
  }

  function getSideInset(side: GamePanelSide): number {
    const groups = getSideGroups(side).filter(group => (
      getGroupPanels(group).some(id => isPanelOpen(id))
    ))
    if (groups.length === 0) return 0

    const width = groups.reduce((max, group) => Math.max(max, getGroupWidth(side, group)), 0)
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

  function findGroupLocation(groupId: string): {
    group: GamePanelGroup
    groupIndex: number
    side: GamePanelSide
  } | null {
    for (const side of PANEL_SIDES) {
      const groupIndex = layout.value.columns[side].groups.findIndex(group => group.id === groupId)
      if (groupIndex >= 0) return {
        group: layout.value.columns[side].groups[groupIndex]!,
        groupIndex,
        side,
      }
    }
    return null
  }

  function findGroupInSide(side: GamePanelSide, groupId: string): GamePanelGroup | null {
    return layout.value.columns[side].groups.find(group => group.id === groupId) ?? null
  }

  function getRenderableSideGroups(side: GamePanelSide): GamePanelGroup[] {
    const groups: GamePanelGroup[] = []
    let skippedUnavailableLayout = false
    for (const group of layout.value.columns[side].groups) {
      const panels = getGroupPanels(group)
      if (panels.length === 0) {
        skippedUnavailableLayout = true
        continue
      }
      const activePanelId = panels.includes(group.activePanelId) ? group.activePanelId : panels[0]
      if (panels.length !== group.panelIds.length || activePanelId !== group.activePanelId) {
        skippedUnavailableLayout = true
      }
      groups.push({
        ...group,
        activePanelId,
        panelIds: panels,
      })
    }

    if (skippedUnavailableLayout) packGroupLayoutByStretch(groups, getPanelGroupGapRatio())
    else normalizeGroupLayout(groups, getPanelGroupGapRatio())
    return groups
  }

  function normalizeSideGroupLayout(side: GamePanelSide) {
    packGroupLayoutByStretch(layout.value.columns[side].groups, getPanelGroupGapRatio())
  }

  function normalizeChangedSideLayouts(sourceSide: GamePanelSide, targetSide: GamePanelSide, structureChanged: boolean) {
    if (! structureChanged) return
    normalizeSideGroupLayout(sourceSide)
    if (targetSide !== sourceSide) normalizeSideGroupLayout(targetSide)
  }

  function getPanelGroupGapRatio(): number {
    return getPanelGroupGapPx(getPanelStackHeightPx()) / Math.max(1, getPanelStackHeightPx())
  }

  function getPanelStackHeightPx(): number {
    const bottomInset = Sizes.ButtonTop + Sizes.ButtonHeight + Sizes.ButtonShadowOffset + Sizes.ButtonContentGap * 2
    return Math.max(1, viewportHeight.value - Sizes.ButtonTop - bottomInset)
  }

  for (const side of PANEL_SIDES) normalizeSideGroupLayout(side)

  return {
    addPanelToGroup,
    addPanelToSide,
    closeAll,
    closeStudyPanels,
    getGroupHeight,
    getGroupPanels,
    getGroupResizeSnapshot,
    getGroupStretch,
    getGroupTop,
    getGroupWidth,
    getPanelSize,
    getSideGroups,
    getSideSize,
    hiddenPanelIds,
    isPanelAvailable,
    isPanelOpen,
    isPanelVisible,
    layout,
    movePanelToGroup,
    movePanelToNewGroup,
    setGroupActivePanel,
    toggleGroupStretchEdge,
    setOnlineStudyDefaultPanels,
    setPanelOpen,
    setPanelSize,
    setGroupWidth,
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

function getDefaultGroupStretch(panelIds: GamePanelId[]): GamePanelStretch {
  return panelIds.some(id => FILL_PANEL_IDS.has(id)) ? 'top-bottom' : 'never'
}

function getEffectiveGroupStretch(group: Pick<GamePanelGroup, 'panelIds' | 'stretch'>): GamePanelStretch {
  return group.stretch ?? getDefaultGroupStretch(group.panelIds)
}

function getGroupDefaultWidth(group: Pick<GamePanelGroup, 'panelIds'>): number | undefined {
  if (group.panelIds.length !== 1) return undefined
  return COMPACT_PANEL_DEFAULT_WIDTHS.get(group.panelIds[0])
}

function getDefaultSideWidth(side: GamePanelSide): number {
  return side === 'right' ? Sizes.RecordPanelWidth : LEFT_PANEL_DEFAULT_SIZE
}

function getDefaultGroupWidth(side: GamePanelSide, panelIds: GamePanelId[]): number {
  return getGroupDefaultWidth({ panelIds }) ?? getDefaultSideWidth(side)
}

function getDefaultGroupHeight(panelIds: GamePanelId[]): number {
  return getDefaultGroupStretch(panelIds) === 'top-bottom' ? 1 : COMPACT_PANEL_DEFAULT_HEIGHT
}

function getGroupMinWidth(group: Pick<GamePanelGroup, 'panelIds'>): number {
  return group.panelIds.reduce((max, id) => Math.max(max, getMinPanelSize(id)), 0)
}

function clampGroupWidth(group: Pick<GamePanelGroup, 'panelIds'>, size: number, viewportWidth: number): number {
  const minSize = getGroupMinWidth(group)
  const maxWidth = Math.max(minSize, viewportWidth - Sizes.ButtonTop * 2)
  return Math.min(Math.max(size, minSize), maxWidth)
}

function normalizeStoredPanelLayout(layout: StoredPanelLayout): StoredPanelLayout {
  const normalized = StoredPanelLayoutSchema.parse(layout)
  normalized.version = PANEL_LAYOUT_STORAGE_VERSION
  const groupIds = new Set<string>()
  for (const side of PANEL_SIDES) {
    const column = normalized.columns[side]
    const legacyColumnSize = column.size
    column.groups = column.groups
      .map(group => normalizeGroup(group, side, legacyColumnSize))
      .filter((group): group is GamePanelGroup => group !== null)
      .filter(group => {
        if (groupIds.has(group.id)) return false
        groupIds.add(group.id)
        return true
      })
    delete column.size
    normalizeGroupLayout(column.groups)
  }
  normalized.nextGroupId = Math.max(
    normalized.nextGroupId,
    ...Array.from(groupIds, getGroupIdSequence).map(value => value + 1),
    1,
  )
  return normalized
}

function normalizeGroup(
  group: Omit<GamePanelGroup, 'width'> & { width?: number },
  side: GamePanelSide,
  legacyColumnSize: number | undefined,
): GamePanelGroup | null {
  const panelIds = uniquePanelIds(group.panelIds)
  if (panelIds.length === 0) return null
  const stretch = normalizeStoredGroupStretch(panelIds, group)
  const rawWidth = group.width
  const width = typeof rawWidth === 'number' && Number.isFinite(rawWidth)
    ? rawWidth
    : legacyColumnSize ?? getDefaultGroupWidth(side, panelIds)
  return {
    ...group,
    activePanelId: panelIds.includes(group.activePanelId) ? group.activePanelId : panelIds[0],
    height: Math.max(0.001, group.height),
    panelIds,
    stretch,
    top: Number.isFinite(group.top) ? group.top : Number.NaN,
    width: clampGroupWidth({ panelIds }, width, Number.POSITIVE_INFINITY),
  }
}

function normalizeStoredGroupStretch(
  panelIds: GamePanelId[],
  group: Pick<GamePanelGroup, 'savedFreeAfter' | 'savedFreeBefore' | 'stretch'>,
): GamePanelStretch {
  const defaultStretch = getDefaultGroupStretch(panelIds)
  let stretch = group.stretch ?? defaultStretch
  if (
    hasStretchEdge(stretch, 'before')
    && ! hasStretchEdge(defaultStretch, 'before')
    && group.savedFreeBefore === undefined
  ) {
    stretch = removeGroupStretchEdge(stretch, 'before')
  }
  if (
    hasStretchEdge(stretch, 'after')
    && ! hasStretchEdge(defaultStretch, 'after')
    && group.savedFreeAfter === undefined
  ) {
    stretch = removeGroupStretchEdge(stretch, 'after')
  }
  return stretch
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

function normalizeGroupLayout(groups: GamePanelGroup[], gapRatio = 0) {
  packGroupLayoutByStretch(groups, gapRatio)
}

function hasValidGroupGeometry(groups: GamePanelGroup[], gapRatio = 0): boolean {
  let previousBottom = 0
  for (const group of groups) {
    if (! Number.isFinite(group.top) || ! Number.isFinite(group.height)) return false
    if (group.height <= 0) return false
    if (group.top < -0.000001) return false
    if (group.top + group.height > 1.000001) return false
    if (group.top < previousBottom - 0.000001) return false
    if (previousBottom > 0 && group.top < previousBottom + gapRatio - 0.000001) return false
    previousBottom = group.top + group.height
  }
  return true
}

function appendPanelGroup(groups: GamePanelGroup[], group: GamePanelGroup, gapRatio = 0) {
  groups.push(group)
  packGroupLayoutByStretch(groups, gapRatio)
}

function packGroupLayoutByStretch(groups: GamePanelGroup[], gapRatio = 0) {
  const minHeight = 0.001
  const gap = Math.max(0, Math.min(0.05, gapRatio))
  if (groups.length === 0) return
  if (hasValidGroupGeometry(groups, gap)) {
    for (const group of groups) {
      group.top = clampRatio(group.top)
      group.height = clampRatio(group.height)
    }
    applyGroupStretchEdges(groups, gap, minHeight)
    return
  }

  if (groups.length === 1) {
    const group = groups[0]!
    group.top = clampRatio(group.top)
    group.height = Math.min(1 - group.top, getPackGroupHeight(group, minHeight))
    applyGroupStretchEdges(groups, gap, minHeight)
    return
  }

  const totalGap = gap * Math.max(0, groups.length - 1)
  const availableHeight = Math.max(minHeight * groups.length, 1 - totalGap)
  const fillGroups = groups.filter(group => getEffectiveGroupStretch(group) === 'top-bottom')
  const fixedGroups = groups.filter(group => getEffectiveGroupStretch(group) !== 'top-bottom')
  let fixedHeight = fixedGroups.reduce((sum, group) => sum + getPackGroupHeight(group, minHeight), 0)

  if (fillGroups.length > 0 && fixedHeight + minHeight * fillGroups.length > availableHeight) {
    const maxFixedHeight = Math.max(0, availableHeight - minHeight * fillGroups.length)
    const scale = fixedHeight > 0 ? maxFixedHeight / fixedHeight : 1
    for (const group of fixedGroups) {
      group.height = Math.max(minHeight, getPackGroupHeight(group, minHeight) * scale)
    }
    fixedHeight = fixedGroups.reduce((sum, group) => sum + getPackGroupHeight(group, minHeight), 0)
  }

  if (fillGroups.length > 0) {
    const fillSpace = Math.max(minHeight * fillGroups.length, availableHeight - fixedHeight)
    const fillHeight = fillGroups.reduce((sum, group) => sum + getPackGroupHeight(group, minHeight), 0)
    for (const group of fillGroups) {
      group.height = fillHeight > 0
        ? fillSpace * getPackGroupHeight(group, minHeight) / fillHeight
        : fillSpace / fillGroups.length
    }
  } else {
    const totalHeight = groups.reduce((sum, group) => sum + getPackGroupHeight(group, minHeight), 0)
    if (totalHeight > availableHeight) {
      for (const group of groups) {
        group.height = Math.max(minHeight, availableHeight * getPackGroupHeight(group, minHeight) / totalHeight)
      }
    }
  }

  let cursor = 0
  for (const [index, group] of groups.entries()) {
    const remainingGroups = groups.length - index - 1
    const maxHeight = Math.max(minHeight, 1 - cursor - gap * remainingGroups)
    group.top = clampRatio(cursor)
    group.height = Math.max(minHeight, Math.min(getPackGroupHeight(group, minHeight), maxHeight))
    cursor += group.height + gap
  }
  applyGroupStretchEdges(groups, gap, minHeight)
}

function applyGroupStretchEdges(groups: GamePanelGroup[], gapRatio: number, minHeight: number) {
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]!
    const stretch = getEffectiveGroupStretch(group)
    if (stretch === 'never') continue

    const previous = groups[index - 1]
    const next = groups[index + 1]
    let top = group.top
    let bottom = group.top + group.height

    if (hasStretchEdge(stretch, 'before')) {
      top = previous ? previous.top + previous.height + gapRatio : 0
    }
    if (hasStretchEdge(stretch, 'after')) {
      bottom = next ? next.top - gapRatio : 1
    }

    if (bottom - top < minHeight) {
      if (hasStretchEdge(stretch, 'before') && ! hasStretchEdge(stretch, 'after')) {
        top = bottom - minHeight
      } else {
        bottom = top + minHeight
      }
    }

    group.top = clampRatio(top)
    group.height = Math.max(minHeight, Math.min(1 - group.top, bottom - group.top))
  }
}

function getPackGroupHeight(group: GamePanelGroup, minHeight: number): number {
  return Number.isFinite(group.height) ? Math.max(minHeight, group.height) : minHeight
}

function addStretchEdge(stretch: GamePanelStretch, edge: GamePanelGroupResizeEdge): GamePanelStretch {
  if (edge === 'before') {
    if (stretch === 'bottom') return 'top-bottom'
    if (stretch === 'never') return 'top'
    return stretch
  }
  if (stretch === 'top') return 'top-bottom'
  if (stretch === 'never') return 'bottom'
  return stretch
}

function hasStretchEdge(stretch: GamePanelStretch, edge: GamePanelGroupResizeEdge): boolean {
  if (edge === 'before') return stretch === 'top' || stretch === 'top-bottom'
  return stretch === 'bottom' || stretch === 'top-bottom'
}

function saveFreeEdge(group: GamePanelGroup, edge: GamePanelGroupResizeEdge) {
  if (edge === 'before') {
    group.savedFreeBefore = clampRatio(group.top)
  } else {
    group.savedFreeAfter = clampRatio(group.top + group.height)
  }
}

function restoreSavedFreeEdge(group: GamePanelGroup, edge: GamePanelGroupResizeEdge) {
  const minHeight = 0.001
  if (edge === 'before') {
    const savedTop = group.savedFreeBefore
    clearSavedFreeEdge(group, edge)
    if (savedTop === undefined) return

    const bottom = clampRatio(group.top + group.height)
    const top = Math.min(Math.max(0, savedTop), Math.max(0, bottom - minHeight))
    group.top = top
    group.height = bottom - top
    return
  }

  const savedBottom = group.savedFreeAfter
  clearSavedFreeEdge(group, edge)
  if (savedBottom === undefined) return

  const top = clampRatio(group.top)
  const bottom = Math.max(top + minHeight, Math.min(1, savedBottom))
  group.top = top
  group.height = bottom - top
}

function clearSavedFreeEdge(group: GamePanelGroup, edge: GamePanelGroupResizeEdge) {
  if (edge === 'before') {
    delete group.savedFreeBefore
  } else {
    delete group.savedFreeAfter
  }
}

function removeGroupStretchEdge(stretch: GamePanelStretch, edge: GamePanelGroupResizeEdge): GamePanelStretch {
  if (edge === 'before') {
    if (stretch === 'top-bottom') return 'bottom'
    if (stretch === 'top') return 'never'
    return stretch
  }
  if (stretch === 'top-bottom') return 'top'
  if (stretch === 'bottom') return 'never'
  return stretch
}

function resizeGroupAfterEdge(
  items: Array<{ bottomPx: number; id: string; topPx: number }>,
  index: number,
  deltaPx: number,
  totalHeightPx: number,
  minHeightPx: number,
  gapPx: number,
) {
  const item = items[index]
  const startBottom = item.bottomPx
  const minBottom = item.topPx + minHeightPx
  const desiredBottom = startBottom + deltaPx

  if (desiredBottom <= startBottom) {
    item.bottomPx = Math.max(minBottom, desiredBottom)
    return
  }

  const trailingItemCount = items.length - index - 1
  const maxBottom = totalHeightPx - minHeightPx * trailingItemCount - gapPx * trailingItemCount
  item.bottomPx = Math.min(Math.max(minBottom, desiredBottom), maxBottom)
  let requiredTop = item.bottomPx + gapPx
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
    requiredTop = next.bottomPx + gapPx
  }
}

function resizeGroupBeforeEdge(
  items: Array<{ bottomPx: number; id: string; topPx: number }>,
  index: number,
  deltaPx: number,
  minHeightPx: number,
  gapPx: number,
) {
  const item = items[index]
  const startTop = item.topPx
  const maxTop = item.bottomPx - minHeightPx
  const desiredTop = startTop + deltaPx

  if (desiredTop >= startTop) {
    item.topPx = Math.min(maxTop, desiredTop)
    return
  }

  const minTop = minHeightPx * index + gapPx * index
  item.topPx = Math.max(minTop, Math.min(maxTop, desiredTop))
  let requiredBottom = item.topPx - gapPx
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
    requiredBottom = previous.topPx - gapPx
  }
}

function getPanelGroupGapPx(totalHeightPx: number): number {
  if (! Number.isFinite(totalHeightPx) || totalHeightPx <= 0) return 0
  return Math.min(totalHeightPx * 0.05, Sizes.ButtonContentGap * 0.6)
}

function clampRatio(value: number): number {
  if (! Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clampGroupIndex(value: number, length: number): number {
  if (! Number.isFinite(value)) return length
  return Math.min(length, Math.max(0, Math.round(value)))
}

function clampPanelIndex(value: number, length: number): number {
  if (! Number.isFinite(value)) return length
  return Math.min(length, Math.max(0, Math.round(value)))
}

function getGroupIdSequence(groupId: string): number {
  const match = /-(\d+)$/.exec(groupId)
  return match ? Number(match[1]) : 0
}
