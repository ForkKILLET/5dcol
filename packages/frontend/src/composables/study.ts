import { computed, type Ref } from 'vue'
import { z } from 'zod'
import { FiveDPGN, Multiverse } from '@5dcol/core'
import {
  RecordCursorSchema,
  StudyDocumentSchema,
  type StudyDocument,
} from '@5dcol/shared/protocol'
import type { GameWorkspaceState } from '@engine/gameState'
import { RecordDocument } from '@engine/recordTree'
import { useStorageRef } from './storage'

export const LOCAL_STUDIES_STORAGE_KEY = '5dcol.localStudies'
export const LOCAL_STUDIES_STORAGE_VERSION = 1
export const STUDY_WORKSPACES_STORAGE_KEY = '5dcol.studyWorkspaces'
export const STUDY_WORKSPACES_STORAGE_VERSION = 1

const StoredLocalStudiesSchema = z.object({
  version: z.literal(LOCAL_STUDIES_STORAGE_VERSION),
  studies: z.array(StudyDocumentSchema),
})

const StudyWorkspaceSchema = z.object({
  recordCursor: RecordCursorSchema.nullable().optional(),
  focusedBoard: z.object({
    l: z.number().int(),
    m: z.number().int().nonnegative(),
  }).nullable().optional(),
})

const StoredStudyWorkspacesSchema = z.object({
  version: z.literal(STUDY_WORKSPACES_STORAGE_VERSION),
  workspaces: z.record(z.string(), StudyWorkspaceSchema),
})

export type StoredLocalStudies = z.infer<typeof StoredLocalStudiesSchema>
export type StoredStudyWorkspaces = z.infer<typeof StoredStudyWorkspacesSchema>

export interface LocalStudySummary {
  id: string
  title: string
  actionCount: number
  annotationCount: number
  createdAt: number
  updatedAt: number
}

export interface CreateLocalStudyOptions {
  id?: string
  title?: string
  recordDocument?: RecordDocument
  initialMultiverse?: Multiverse
  now?: number
}

export interface CreateLocalStudyFromTextOptions {
  id?: string
  title?: string
  now?: number
}

export interface CreateLocalStudyFromTextResult {
  study: StudyDocument | null
  error: string | null
}

const DEFAULT_LOCAL_STUDIES: StoredLocalStudies = {
  version: LOCAL_STUDIES_STORAGE_VERSION,
  studies: [],
}

const DEFAULT_STUDY_WORKSPACES: StoredStudyWorkspaces = {
  version: STUDY_WORKSPACES_STORAGE_VERSION,
  workspaces: {},
}

let storedStudyWorkspaces: Ref<StoredStudyWorkspaces> | null = null

export function useLocalStudies() {
  const stored = useStorageRef<StoredLocalStudies>(
    LOCAL_STUDIES_STORAGE_KEY,
    DEFAULT_LOCAL_STUDIES,
    {
      deep: true,
      parse: raw => StoredLocalStudiesSchema.parse(JSON.parse(raw) as unknown),
      serialize: value => JSON.stringify(StoredLocalStudiesSchema.parse(value)),
    },
  )

  const studies = computed(() => stored.value.studies)
  const summaries = computed(() => (
    [...stored.value.studies]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toLocalStudySummary)
  ))

  function getStudy(id: string): StudyDocument | null {
    const study = stored.value.studies.find(item => item.id === id)
    return study ? cloneStudyDocument(study) : null
  }

  function createStudy({
    id = createLocalStudyId(),
    title = 'Untitled Study',
    recordDocument = RecordDocument.create([]),
    initialMultiverse = Multiverse.createInitial(),
    now = Date.now(),
  }: CreateLocalStudyOptions = {}): StudyDocument {
    const study = recordDocument.toStudyDocument({
      id,
      title,
      initialMultiverse,
      createdAt: now,
      updatedAt: now,
    })
    upsertStudy(study, { touch: false })
    return cloneStudyDocument(study)
  }

  function createStudyFromText(
    input: string,
    {
      id = createLocalStudyId(),
      title = 'Imported Study',
      now = Date.now(),
    }: CreateLocalStudyFromTextOptions = {},
  ): CreateLocalStudyFromTextResult {
    try {
      const gameState = FiveDPGN.importGameState(input)
      const recordDocument = RecordDocument.fromFiveDPGN(input)
      const study = recordDocument.toStudyDocument({
        id,
        title,
        initialMultiverse: gameState.initialMultiverse,
        createdAt: now,
        updatedAt: now,
      })
      upsertStudy(study, { touch: false })
      return {
        study: cloneStudyDocument(study),
        error: null,
      }
    }
    catch (err) {
      return {
        study: null,
        error: err instanceof Error ? err.message : 'Failed to import study',
      }
    }
  }

  function upsertStudy(
    document: StudyDocument,
    { touch = true }: { touch?: boolean } = {},
  ): StudyDocument {
    const parsed = StudyDocumentSchema.parse({
      ...document,
      updatedAt: touch ? Date.now() : document.updatedAt,
    })
    const index = stored.value.studies.findIndex(study => study.id === parsed.id)
    if (index >= 0) stored.value.studies[index] = parsed
    else stored.value.studies.push(parsed)
    return cloneStudyDocument(parsed)
  }

  function renameStudy(id: string, title: string): boolean {
    const study = stored.value.studies.find(item => item.id === id)
    if (! study) return false
    study.title = title.trim() || study.title
    study.updatedAt = Date.now()
    return true
  }

  function deleteStudy(id: string): boolean {
    const before = stored.value.studies.length
    stored.value.studies = stored.value.studies.filter(study => study.id !== id)
    deleteStoredStudyWorkspace(id)
    return stored.value.studies.length !== before
  }

  return {
    studies,
    summaries,
    getStudy,
    createStudy,
    createStudyFromText,
    upsertStudy,
    renameStudy,
    deleteStudy,
  }
}

export function useStudyWorkspaces() {
  const stored = getStoredStudyWorkspaces()

  function getStudyWorkspace(id: string): GameWorkspaceState | null {
    return cloneStudyWorkspace(stored.value.workspaces[id] ?? null)
  }

  function upsertStudyWorkspace(id: string, workspace: GameWorkspaceState) {
    stored.value.workspaces[id] = cloneStudyWorkspace(StudyWorkspaceSchema.parse(workspace)) ?? {}
  }

  function deleteStudyWorkspace(id: string): boolean {
    const exists = id in stored.value.workspaces
    delete stored.value.workspaces[id]
    return exists
  }

  return {
    getStudyWorkspace,
    upsertStudyWorkspace,
    deleteStudyWorkspace,
  }
}

function getStoredStudyWorkspaces(): Ref<StoredStudyWorkspaces> {
  storedStudyWorkspaces ??= useStorageRef<StoredStudyWorkspaces>(
    STUDY_WORKSPACES_STORAGE_KEY,
    DEFAULT_STUDY_WORKSPACES,
    {
      deep: true,
      parse: raw => StoredStudyWorkspacesSchema.parse(JSON.parse(raw) as unknown),
      serialize: value => JSON.stringify(StoredStudyWorkspacesSchema.parse(value)),
    },
  )
  return storedStudyWorkspaces
}

function deleteStoredStudyWorkspace(id: string): boolean {
  const stored = getStoredStudyWorkspaces()
  const exists = id in stored.value.workspaces
  delete stored.value.workspaces[id]
  return exists
}

function toLocalStudySummary(study: StudyDocument): LocalStudySummary {
  return {
    id: study.id,
    title: study.title,
    actionCount: study.actions.length,
    annotationCount: study.annotations.length,
    createdAt: study.createdAt,
    updatedAt: study.updatedAt,
  }
}

function cloneStudyDocument(study: StudyDocument): StudyDocument {
  return StudyDocumentSchema.parse(JSON.parse(JSON.stringify(study)) as unknown)
}

function cloneStudyWorkspace(workspace: GameWorkspaceState | null): GameWorkspaceState | null {
  if (! workspace) return null
  return StudyWorkspaceSchema.parse(JSON.parse(JSON.stringify(workspace)) as unknown)
}

function createLocalStudyId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-study-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
