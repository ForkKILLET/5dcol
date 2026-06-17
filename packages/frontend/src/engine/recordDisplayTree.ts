import type { GameRecordAction, GameRecordRow } from '@engine/game'

export type RecordBlockKind = 'branch' | 'deduction' | 'pending'

export interface RecordDisplayRowNode {
  kind: 'row'
  key: string
  row: GameRecordRow
}

export interface RecordDisplayBlockNode {
  kind: 'block'
  key: string
  blockKind: RecordBlockKind
  sectionKey: string
  children: RecordDisplayNode[]
}

export type RecordDisplayNode = RecordDisplayRowNode | RecordDisplayBlockNode

export interface BuildRecordDisplayTreeOptions {
  rows: GameRecordRow[]
  onlineSpectator: boolean
  deductionStartActionIndex: number | null
  getRecordRowKey: (row: GameRecordRow) => string
  pendingBlockKey?: string | null
  branchBlockKeyAliases?: Readonly<Record<number, string>>
}

export function buildRecordDisplayTree({
  rows,
  onlineSpectator,
  deductionStartActionIndex,
  getRecordRowKey,
  pendingBlockKey = null,
  branchBlockKeyAliases = {},
}: BuildRecordDisplayTreeOptions): RecordDisplayNode[] {
  const root: RecordDisplayNode[] = []
  const stack: RecordDisplayBlockNode[] = []

  for (const row of rows) {
    const blockKind = getRecordBlockKind(row, onlineSpectator, deductionStartActionIndex)
    if (blockKind === null) {
      stack.length = 0
      root.push({
        kind: 'row',
        key: getRecordRowKey(row),
        row,
      })
      continue
    }

    const blockDepth = getRecordBlockDepth(row, blockKind)
    if (stack.length > blockDepth + 1) {
      stack.length = blockDepth + 1
    }

    const sectionKey = getRecordBlockSectionKey(row, blockKind)
    let block = stack[blockDepth]
    if (! block || block.blockKind !== blockKind || block.sectionKey !== sectionKey) {
      stack.length = blockDepth
      block = {
        kind: 'block',
        key: getRecordBlockKey(row, blockKind, sectionKey, getRecordRowKey, {
          pendingBlockKey,
          branchBlockKeyAliases,
        }),
        blockKind,
        sectionKey,
        children: [],
      }

      const parent = blockDepth === 0
        ? null
        : stack[blockDepth - 1] ?? null
      const children = parent?.children ?? root
      children.push(block)
      stack[blockDepth] = block
      stack.length = blockDepth + 1
    }

    block.children.push({
      kind: 'row',
      key: getRecordRowKey(row),
      row,
    })
  }

  return root
}

function getRecordBlockKey(
  row: GameRecordRow,
  blockKind: RecordBlockKind,
  sectionKey: string,
  getRecordRowKey: (row: GameRecordRow) => string,
  {
    pendingBlockKey,
    branchBlockKeyAliases,
  }: {
    pendingBlockKey: string | null
    branchBlockKeyAliases: Readonly<Record<number, string>>
  },
) {
  if (blockKind === 'branch' && row.recordLineId !== undefined) {
    return branchBlockKeyAliases[row.recordLineId] ?? `${blockKind}:${sectionKey}`
  }

  if (blockKind === 'pending') return pendingBlockKey ?? getRecordRowKey(row)
  return `${blockKind}:${sectionKey}`
}

function getRecordBlockKind(
  row: GameRecordRow,
  onlineSpectator: boolean,
  deductionStartActionIndex: number | null,
): RecordBlockKind | null {
  if (isRecordAction(row) && row.pending) return 'pending'
  if ((row.branchDepth ?? 0) > 0) return 'branch'
  if (isRecordAction(row) && isRecordDeductionAction(row, onlineSpectator, deductionStartActionIndex)) {
    return 'deduction'
  }
  return null
}

function getRecordBlockDepth(row: GameRecordRow, blockKind: RecordBlockKind) {
  const branchDepth = row.branchDepth ?? 0
  if (blockKind === 'pending') return branchDepth
  return Math.max(0, branchDepth - 1)
}

function getRecordBlockSectionKey(row: GameRecordRow, blockKind: RecordBlockKind) {
  if (blockKind === 'pending') return `${row.recordLineId ?? 'root'}:${row.recordActionIndex ?? 'tail'}`
  if (blockKind === 'branch') return `${row.recordLineId ?? row.recordKey ?? 'branch'}`
  return 'deduction'
}

function isRecordAction(row: GameRecordRow): row is GameRecordAction {
  return row.kind === 'action'
}

function isRecordDeductionAction(
  action: GameRecordAction,
  onlineSpectator: boolean,
  deductionStartActionIndex: number | null,
) {
  return (
    ! action.pending
    && onlineSpectator
    && deductionStartActionIndex !== null
    && action.index >= deductionStartActionIndex
  )
}
