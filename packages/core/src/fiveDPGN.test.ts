import { describe, expect, it } from 'vitest'
import { type Action, Multiverse, Player } from './index'
import * as FiveDPGN from './fiveDPGN'

const e3: Action = {
  moves: [{
    from: { l: 0, t: 1, x: 4, y: 6 },
    to: { l: 0, t: 1, x: 4, y: 5 },
  }],
}

describe('5DPGN action trees', () => {
  it('keeps side variations before the mainline and supports nested branches', () => {
    const tree = FiveDPGN.parseActionTree(`
[Mode "5D"]
[Board "Standard"]

1w. e3
(1b. e6 {side line}
2w. Nf3
(2b. Nc6 {nested line})
2b. d5)
1b. c6
2w. Nf3
*
`)

    const afterE3 = tree.variations[0]?.subtree
    const sideLine = afterE3?.variations[0]
    const mainline = afterE3?.variations[1]
    const afterSideNf3 = sideLine?.subtree?.variations[0]?.subtree

    expect(afterE3?.variations).toHaveLength(2)
    expect(sideLine?.action.moves[0]?.to).toMatchObject({ x: 4, y: 2 })
    expect(sideLine?.commentsAfter).toEqual(['side line'])
    expect(mainline?.action.moves[0]?.to).toMatchObject({ x: 2, y: 2 })
    expect(afterSideNf3?.variations).toHaveLength(2)
    expect(afterSideNf3?.variations[0]?.commentsAfter).toEqual(['nested line'])
    expect(afterSideNf3?.variations[1]?.action.moves[0]?.to).toMatchObject({ x: 3, y: 3 })
  })

  it('imports the last variation at each position as the game-state mainline', () => {
    const state = FiveDPGN.importGameState(`
[Mode "5D"]
[Board "Standard"]

1w. e3
(1b. e6)
1b. c6
*
`)

    expect(state.actions).toHaveLength(2)
    expect(state.actions[1]?.moves[0]?.to).toMatchObject({ x: 2, y: 2 })
  })
})

describe('5DPGN study metadata', () => {
  it('round-trips comment, glyph, and marker authors through study headers', () => {
    const tree: FiveDPGN.ActionTree = {
      variations: [{
        action: e3,
        commentsAfter: ['A useful waiting move.'],
        moveGlyphs: [['9']],
      }],
    }
    const annotations: FiveDPGN.StudyAnnotation[] = [
      {
        id: 'comment-1',
        type: 'comment',
        target: { type: 'action', lineId: 0, actionIndex: 0, position: 'after' },
        authorId: 'alice',
        text: 'A useful waiting move.',
        createdAt: 10,
        updatedAt: 20,
      },
      {
        id: 'glyph-1',
        type: 'glyph',
        target: { type: 'move', lineId: 0, actionIndex: 0, moveIndex: 0 },
        authorId: 'bob',
        glyph: '9',
      },
      {
        id: 'square-1',
        type: 'marker',
        target: {
          type: 'square',
          branchId: 'root',
          m: 2,
          coord: { l: 0, t: 1, x: 4, y: 5 },
        },
        authorId: 'alice',
        label: 'plan',
      },
      {
        id: 'arrow-1',
        type: 'marker',
        target: {
          type: 'arrow',
          branchId: 'root',
          from: { l: 0, t: 1, x: 4, y: 5 },
          fromPlayer: Player.B,
          to: { l: 0, t: 1, x: 4, y: 3 },
          toPlayer: Player.W,
        },
        authorId: 'bob',
      },
    ]

    const exported = FiveDPGN.exportActionTree(tree, {
      studyAnnotations: annotations,
      studyGlyphTemplates: [{ nag: 140, glyph: '9', color: '#1c71d8' }],
    })
    const parsedAnnotations = FiveDPGN.parseStudyAnnotations(exported)

    expect(exported.match(/\[5DStudy_Member /g)).toHaveLength(2)
    expect(exported).toContain('[5DStudy_CommentMeta ')
    expect(exported).toContain('[5DStudy_GlyphMeta ')
    expect(exported).toContain('[5DStudy_Square ')
    expect(exported).toContain('[5DStudy_Arrow ')
    expect(FiveDPGN.parseStudyGlyphTemplates(exported)).toEqual([
      { nag: 140, glyph: '9', color: '#1c71d8' },
    ])
    expect(parsedAnnotations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'comment',
        authorId: 'alice',
        text: 'A useful waiting move.',
        target: { type: 'action', lineId: 0, actionIndex: 0, position: 'after' },
      }),
      expect.objectContaining({
        type: 'glyph',
        authorId: 'bob',
        glyph: '9',
        target: { type: 'move', lineId: 0, actionIndex: 0, moveIndex: 0 },
      }),
      expect.objectContaining({
        type: 'marker',
        authorId: 'alice',
        label: 'plan',
        target: expect.objectContaining({
          type: 'square',
          branchId: 'root',
          m: 2,
          coord: { l: 0, t: 1, x: 4, y: 5 },
        }),
      }),
      expect.objectContaining({
        type: 'marker',
        authorId: 'bob',
        target: expect.objectContaining({
          type: 'arrow',
          branchId: 'root',
          from: { l: 0, t: 1, x: 4, y: 5 },
          fromPlayer: Player.B,
          to: { l: 0, t: 1, x: 4, y: 3 },
          toPlayer: Player.W,
        }),
      }),
    ]))
  })

  it('ignores study headers without the supported version marker', () => {
    const annotations = FiveDPGN.parseStudyAnnotations(`
[5DStudy_Member "{id: 'alice'}"]
[5DStudy_Square "{author: 0, branch: 'root', at: '(0M2)e3'}"]

*
`)

    expect(annotations).toEqual([])
  })
})
