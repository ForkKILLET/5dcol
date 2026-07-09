import { describe, expect, it } from 'vitest'
import type { Action } from '@5dcol/core'
import type { StudyDocument, StudyRoom } from './protocol'
import {
  applyStudyPatchToStudyRoom,
  createStudyPatchFromCommand,
  resolveStudyPosition,
} from './studyDocument'

const action = (file: number): Action => ({
  moves: [{
    from: { l: 0, t: 1, x: file, y: 1 },
    to: { l: 0, t: 1, x: file, y: 2 },
  }],
})

const createId = (() => {
  let next = 1
  return (prefix: 'action' | 'branch') => `${prefix}:${next++}`
})()

function createDocument(): StudyDocument {
  return {
    id: 'study:1',
    title: 'Study',
    initialMultiverse: {
      lines: [],
      lOffset: 0,
      lFurthestB: 0,
      lFurthestW: 0,
      lastMove: null,
    },
    rootBranchId: 'branch:root',
    branches: [{
      id: 'branch:root',
      parent: null,
      actionIds: ['action:root-1'],
      createdAt: 1,
    }],
    actions: [{
      id: 'action:root-1',
      branchId: 'branch:root',
      action: action(0),
      authorId: 'owner',
      createdAt: 1,
    }],
    annotations: [{
      id: 'comment:root-1',
      type: 'comment',
      target: {
        type: 'action',
        actionId: 'action:root-1',
        position: 'after',
      },
      authorId: 'owner',
      text: 'root',
      createdAt: 1,
      updatedAt: 1,
    }],
    createdAt: 1,
    updatedAt: 1,
  }
}

function createRoom(): StudyRoom {
  return {
    id: 'room:1',
    name: 'Study',
    ownerUserId: 'owner',
    private: true,
    document: createDocument(),
    members: [],
    version: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('study document patches', () => {
  it('creates append-action patches at the end of a branch', () => {
    const room = createRoom()
    const result = createStudyPatchFromCommand(room, 'user:1', {
      type: 'submit-action',
      position: { type: 'after', actionId: 'action:root-1' },
      action: action(1),
    }, {
      createEntityId: createId,
      now: () => 10,
    })

    expect(result).toMatchObject({
      patch: {
        type: 'append-action',
        branchId: 'branch:root',
        action: {
          branchId: 'branch:root',
          authorId: 'user:1',
          createdAt: 10,
        },
      },
    })

    if ('patch' in result) applyStudyPatchToStudyRoom(room, result.patch, { now: () => 11 })

    expect(room.document.branches[0]?.actionIds).toHaveLength(2)
    expect(room.document.actions).toHaveLength(2)
    expect(room.version).toBe(1)
    expect(room.document.updatedAt).toBe(11)
  })

  it('creates branch patches when submitting a different action before existing history', () => {
    const room = createRoom()
    const result = createStudyPatchFromCommand(room, 'user:1', {
      type: 'submit-action',
      position: { type: 'head', branchId: 'branch:root' },
      action: action(2),
    }, {
      createEntityId: createId,
      now: () => 20,
    })

    expect(result).toMatchObject({
      patch: {
        type: 'create-branch',
        branch: {
          parent: { type: 'head', branchId: 'branch:root' },
          createdAt: 20,
        },
      },
    })

    if ('patch' in result) applyStudyPatchToStudyRoom(room, result.patch, { now: () => 21 })

    expect(room.document.branches).toHaveLength(2)
    expect(room.document.actions).toHaveLength(2)
    expect(resolveStudyPosition(room.document, { type: 'head', branchId: room.document.branches[1]!.id }))
      .toMatchObject({ actionIndex: 0 })
  })

  it('removes future actions, child branches, and removed annotations together', () => {
    const room = createRoom()
    room.document.branches.push({
      id: 'branch:child',
      parent: { type: 'after', actionId: 'action:root-1' },
      actionIds: ['action:child-1'],
      createdAt: 2,
    })
    room.document.actions.push({
      id: 'action:child-1',
      branchId: 'branch:child',
      action: action(3),
      authorId: 'user:1',
      createdAt: 2,
    })
    room.document.annotations.push({
      id: 'marker:child',
      type: 'marker',
      target: {
        type: 'square',
        branchId: 'branch:child',
        m: 2,
        coord: { l: 0, t: 1, x: 0, y: 0 },
      },
      authorId: 'user:1',
    })

    const result = createStudyPatchFromCommand(room, 'user:1', {
      type: 'remove-future',
      position: { type: 'head', branchId: 'branch:root' },
    })

    expect(result).toMatchObject({
      patch: {
        type: 'remove-future',
        removedActionIds: ['action:root-1', 'action:child-1'],
        removedBranchIds: ['branch:child'],
      },
    })

    if ('patch' in result) applyStudyPatchToStudyRoom(room, result.patch, { now: () => 30 })

    expect(room.document.branches.map(branch => branch.id)).toEqual(['branch:root'])
    expect(room.document.actions).toHaveLength(0)
    expect(room.document.annotations).toHaveLength(0)
  })
})
