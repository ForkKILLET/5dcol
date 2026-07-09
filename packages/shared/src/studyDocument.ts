import { Action, type Action as CoreAction } from '@5dcol/core'
import type {
  StudyActionNode,
  StudyBranch,
  StudyCommand,
  StudyDocument,
  StudyPatch,
  StudyPosition,
  StudyRoom,
} from './protocol.js'

export type StudyCommandRejectedReason = 'permission-denied' | 'target-not-found' | 'conflict' | 'unsupported'

export type StudyCommandPatchResult =
  | { patch: StudyPatch }
  | { reason: StudyCommandRejectedReason }

export interface StudyDocumentMutationOptions {
  createEntityId?: (prefix: 'action' | 'branch') => string
  now?: () => number
}

export interface StudyResolvedPosition {
  branch: StudyBranch
  actionIndex: number
}

export function requiresExistingStudyEditPermission(command: StudyCommand): boolean {
  return command.type === 'update-private'
}

export function isStudyDocumentPatch(patch: StudyPatch): boolean {
  return patch.type !== 'update-private'
}

export function createStudyPatchFromCommand(
  room: Pick<StudyRoom, 'document' | 'name' | 'private'>,
  authorId: string,
  command: StudyCommand,
  options: StudyDocumentMutationOptions = {},
): StudyCommandPatchResult {
  switch (command.type) {
    case 'submit-action':
      return createSubmitStudyActionPatch(room.document, authorId, command.position, command.action, options)
    case 'remove-future':
      return createRemoveStudyFuturePatch(room.document, command.position)
    case 'upsert-annotation':
      return {
        patch: {
          type: 'upsert-annotation',
          annotation: command.annotation,
        },
      }
    case 'delete-annotation':
      if (! room.document.annotations.some(annotation => annotation.id === command.annotationId)) {
        return { reason: 'conflict' }
      }
      return {
        patch: {
          type: 'delete-annotation',
          annotationId: command.annotationId,
        },
      }
    case 'update-title': {
      const title = command.title.trim()
      if (! title || title === room.name) return { reason: 'conflict' }
      return {
        patch: {
          type: 'update-title',
          title,
        },
      }
    }
    case 'update-private':
      if (command.private === room.private) return { reason: 'conflict' }
      return {
        patch: {
          type: 'update-private',
          private: command.private,
        },
      }
  }
}

export function applyStudyPatchToStudyRoom(
  room: StudyRoom,
  patch: StudyPatch,
  options: StudyDocumentMutationOptions = {},
) {
  const now = getNow(options)
  switch (patch.type) {
    case 'append-action': {
      const branch = room.document.branches.find(branch => branch.id === patch.branchId)
      if (! branch) break
      branch.actionIds.push(patch.action.id)
      room.document.actions.push(patch.action)
      room.document.updatedAt = now
      break
    }
    case 'create-branch':
      room.document.branches.push(patch.branch)
      room.document.actions.push(...patch.actions)
      room.document.updatedAt = now
      break
    case 'remove-future': {
      const removedActionIds = new Set(patch.removedActionIds)
      const removedBranchIds = new Set(patch.removedBranchIds)
      room.document.branches = room.document.branches
        .filter(branch => ! removedBranchIds.has(branch.id))
        .map(branch => ({
          ...branch,
          actionIds: branch.actionIds.filter(actionId => ! removedActionIds.has(actionId)),
        }))
      room.document.actions = room.document.actions
        .filter(action => ! removedActionIds.has(action.id))
      room.document.annotations = room.document.annotations
        .filter(annotation => ! isStudyAnnotationRemovedByFuture(annotation, removedActionIds, removedBranchIds))
      room.document.updatedAt = now
      break
    }
    case 'upsert-annotation': {
      const index = room.document.annotations.findIndex(annotation => annotation.id === patch.annotation.id)
      if (index >= 0) room.document.annotations[index] = patch.annotation
      else room.document.annotations.push(patch.annotation)
      room.document.updatedAt = now
      break
    }
    case 'delete-annotation':
      room.document.annotations = room.document.annotations
        .filter(annotation => annotation.id !== patch.annotationId)
      room.document.updatedAt = now
      break
    case 'update-title':
      room.name = patch.title
      room.document.title = patch.title
      room.document.updatedAt = now
      break
    case 'update-private':
      room.private = patch.private
      break
  }
  room.version += 1
  room.updatedAt = now
}

export function resolveStudyPosition(
  document: StudyDocument,
  position: StudyPosition,
): StudyResolvedPosition | null {
  if (position.type === 'head') {
    const branch = document.branches.find(branch => branch.id === position.branchId)
    return branch
      ? {
          branch,
          actionIndex: 0,
        }
      : null
  }

  const action = document.actions.find(action => action.id === position.actionId)
  if (! action) return null
  const branch = document.branches.find(branch => branch.id === action.branchId)
  const actionIndex = branch?.actionIds.indexOf(action.id) ?? -1
  if (! branch || actionIndex < 0) return null
  return {
    branch,
    actionIndex: actionIndex + 1,
  }
}

export function getStudyActionAt(
  document: StudyDocument,
  branch: StudyBranch,
  actionIndex: number,
): StudyActionNode | null {
  const actionId = branch.actionIds[actionIndex]
  if (! actionId) return null
  return document.actions.find(action => action.id === actionId && action.branchId === branch.id) ?? null
}

export function isSameStudyPosition(a: StudyPosition, b: StudyPosition): boolean {
  if (a.type !== b.type) return false
  return a.type === 'head'
    ? b.type === 'head' && a.branchId === b.branchId
    : b.type === 'after' && a.actionId === b.actionId
}

function createSubmitStudyActionPatch(
  document: StudyDocument,
  authorId: string,
  position: StudyPosition,
  action: CoreAction,
  options: StudyDocumentMutationOptions,
): StudyCommandPatchResult {
  const target = resolveStudyPosition(document, position)
  if (! target) return { reason: 'target-not-found' }

  const nextAction = getStudyActionAt(document, target.branch, target.actionIndex)
  if (nextAction) {
    if (Action.isSame(nextAction.action, action)) return { reason: 'conflict' }

    const matchingBranch = findMatchingStudyBranchAtPosition(document, position, action)
    if (matchingBranch) return { reason: 'conflict' }

    const branchId = createStudyEntityId('branch', options)
    const actionNode = createStudyActionNode(branchId, authorId, action, options)
    return {
      patch: {
        type: 'create-branch',
        branch: {
          id: branchId,
          parent: position,
          actionIds: [actionNode.id],
          createdAt: getNow(options),
        },
        actions: [actionNode],
      },
    }
  }

  const matchingBranch = findMatchingStudyBranchAtPosition(document, position, action)
  if (matchingBranch) return { reason: 'conflict' }

  const actionNode = createStudyActionNode(target.branch.id, authorId, action, options)
  return {
    patch: {
      type: 'append-action',
      branchId: target.branch.id,
      position,
      action: actionNode,
    },
  }
}

function createRemoveStudyFuturePatch(
  document: StudyDocument,
  position: StudyPosition,
): StudyCommandPatchResult {
  const target = resolveStudyPosition(document, position)
  if (! target) return { reason: 'target-not-found' }

  const removedActionIds = new Set<string>()
  const removedBranchIds = new Set<string>()
  collectStudyFutureIds(document, target.branch, target.actionIndex, removedActionIds, removedBranchIds)
  if (removedActionIds.size === 0 && removedBranchIds.size === 0) return { reason: 'conflict' }

  return {
    patch: {
      type: 'remove-future',
      position,
      removedActionIds: [...removedActionIds],
      removedBranchIds: [...removedBranchIds],
    },
  }
}

function findMatchingStudyBranchAtPosition(
  document: StudyDocument,
  position: StudyPosition,
  action: CoreAction,
): StudyBranch | null {
  return document.branches.find((branch) => {
    if (! branch.parent || ! isSameStudyPosition(branch.parent, position)) return false
    const firstAction = getStudyActionAt(document, branch, 0)
    return firstAction ? Action.isSame(firstAction.action, action) : false
  }) ?? null
}

function collectStudyFutureIds(
  document: StudyDocument,
  branch: StudyBranch,
  actionIndex: number,
  removedActionIds: Set<string>,
  removedBranchIds: Set<string>,
) {
  const shouldRemoveWholeBranch = branch.id !== document.rootBranchId && actionIndex === 0
  if (shouldRemoveWholeBranch) {
    collectStudyBranchTreeIds(document, branch.id, removedActionIds, removedBranchIds)
    return
  }

  for (const actionId of branch.actionIds.slice(actionIndex)) {
    removedActionIds.add(actionId)
  }

  for (const child of document.branches) {
    if (! child.parent || ! isStudyBranchChildInRemovedRange(branch, actionIndex, child, document)) continue
    collectStudyBranchTreeIds(document, child.id, removedActionIds, removedBranchIds)
  }
}

function collectStudyBranchTreeIds(
  document: StudyDocument,
  branchId: string,
  removedActionIds: Set<string>,
  removedBranchIds: Set<string>,
) {
  if (removedBranchIds.has(branchId)) return
  const branch = document.branches.find(branch => branch.id === branchId)
  if (! branch) return

  removedBranchIds.add(branch.id)
  for (const actionId of branch.actionIds) {
    removedActionIds.add(actionId)
  }

  for (const child of document.branches) {
    if (! child.parent) continue
    const childParentBranchId = getStudyPositionBranchId(document, child.parent)
    if (childParentBranchId === branch.id) {
      collectStudyBranchTreeIds(document, child.id, removedActionIds, removedBranchIds)
    }
  }
}

function isStudyBranchChildInRemovedRange(
  branch: StudyBranch,
  actionIndex: number,
  child: StudyBranch,
  document: StudyDocument,
): boolean {
  const parent = child.parent
  if (! parent) return false
  if (parent.type === 'head') return parent.branchId === branch.id && actionIndex <= 0

  const parentActionIndex = branch.actionIds.indexOf(parent.actionId)
  if (parentActionIndex >= 0) return parentActionIndex >= actionIndex

  return getStudyPositionBranchId(document, parent) === branch.id && actionIndex <= 0
}

function getStudyPositionBranchId(document: StudyDocument, position: StudyPosition): string | null {
  if (position.type === 'head') return position.branchId
  return document.actions.find(action => action.id === position.actionId)?.branchId ?? null
}

function isStudyAnnotationRemovedByFuture(
  annotation: StudyDocument['annotations'][number],
  removedActionIds: ReadonlySet<string>,
  removedBranchIds: ReadonlySet<string>,
): boolean {
  switch (annotation.target.type) {
    case 'action':
    case 'move':
      return removedActionIds.has(annotation.target.actionId)
    case 'square':
    case 'arrow':
      return removedBranchIds.has(annotation.target.branchId)
    case 'cursor':
    case 'line':
      return false
  }
}

function createStudyActionNode(
  branchId: string,
  authorId: string,
  action: CoreAction,
  options: StudyDocumentMutationOptions,
): StudyActionNode {
  return {
    id: createStudyEntityId('action', options),
    branchId,
    action,
    authorId,
    createdAt: getNow(options),
  }
}

function createStudyEntityId(prefix: 'action' | 'branch', options: StudyDocumentMutationOptions): string {
  return options.createEntityId?.(prefix) ?? `${prefix}:${Math.random().toString(36).slice(2)}`
}

function getNow(options: StudyDocumentMutationOptions): number {
  return options.now?.() ?? Date.now()
}
