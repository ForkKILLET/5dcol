<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { StudyDocumentSchema, type MatchServerStats, type StudyDocument, type StudyRoom } from '@5dcol/shared/protocol'
import { MatchClient, type MatchServerConnectionStatus } from '@engine/matchClient'
import {
  DEFAULT_ONLINE_SERVER_IDS,
  getOnlineServerEntries,
  onlineCustomServerAddresses,
  onlineServerOrder,
  setCachedOnlineServerInfo,
  useOnlineIdentity,
  type OnlineServerEntry,
} from '@/composables/online'
import { useLocalStudies } from '@/composables/study'
import GameButton from './GameButton.vue'
import GameListItem from './GameListItem.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import OnlinePanelToolbar from './OnlinePanelToolbar.vue'
import OnlineServerItem from './OnlineServerItem.vue'
import RoomManagePanel from './RoomManagePanel.vue'
import StudyCreatePanel from './StudyCreatePanel.vue'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  close: []
  deleteLocalStudy: [id: string]
  openStudy: [study: StudyDocument, source?: StudyOpenSource]
  openOnlineSettings: []
  uiSound: []
}>()

type StudyOpenSource =
  | { kind: 'local' }
  | { kind: 'online', private?: boolean, serverAddress: string, roomId: string, version: number }

type StudySourceKind = 'empty' | 'import'

type StudyCreateTarget =
  | { kind: 'local' }
  | { kind: 'online', serverId: string }

interface OnlineStudyManageTarget {
  serverId: string
  studyId: string
}

interface StudyServerState {
  id: string
  address: string
  status: MatchServerConnectionStatus
  name: string
  version: string
  commitHash: string
  buildDate: string
  pingMs: number | null
  stats: MatchServerStats | null
  studies: StudyRoom[]
  error: string
}

const STUDY_REFRESH_INTERVAL_MS = 5000

const { t } = useI18n({ useScope: 'global' })
const {
  createStudy,
  createStudyFromDocument,
  deleteStudy,
  getStudy,
  renameStudy,
  summaries,
} = useLocalStudies()
const {
  onlineNickname: studyNickname,
  onlineUserId,
} = useOnlineIdentity()

const sortedSummaries = computed(() => summaries.value)
const activeTab = ref<'local' | 'online'>('local')
const managingStudyId = ref<string | null>(null)
const managingStudyTitle = ref('')
const managingOnlineStudy = ref<OnlineStudyManageTarget | null>(null)
const managingOnlineStudyTitle = ref('')
const managingOnlineStudyPrivate = ref(true)
const studyCreateTarget = ref<StudyCreateTarget | null>(null)
const studyCreateName = ref('')
const studyCreatePrivate = ref(true)
const studyCreateSource = ref<StudySourceKind>('empty')
const studyCreateImportText = ref('')
const studyCreateImportDocument = ref<StudyDocument | null>(null)
const studyCreateImportError = ref('')
const expandedStudyServerIds = reactive(new Set(DEFAULT_ONLINE_SERVER_IDS))
const studyServers = reactive<StudyServerState[]>(getOnlineServerEntries()
  .map(entry => createStudyServerState(entry)))
let studyRefreshTimer: number | null = null

const onlineStudyCreateServer = computed(() => {
  const target = studyCreateTarget.value
  return target?.kind === 'online'
    ? studyServers.find(server => server.id === target.serverId) ?? null
    : null
})
const managedStudy = computed(() => (
  managingStudyId.value === null
    ? null
    : sortedSummaries.value.find(study => study.id === managingStudyId.value) ?? null
))
const managedOnlineStudyServer = computed(() => {
  const target = managingOnlineStudy.value
  return target
    ? studyServers.find(server => server.id === target.serverId) ?? null
    : null
})
const managedOnlineStudyRoom = computed(() => {
  const target = managingOnlineStudy.value
  const server = managedOnlineStudyServer.value
  return target && server
    ? server.studies.find(study => study.id === target.studyId) ?? null
    : null
})
const isManagingStudy = computed(() => managingStudyId.value !== null || managingOnlineStudy.value !== null)
const pageTitle = computed(() => {
  if (activeTab.value === 'local') return t('study.localTitle')
  return t('study.onlineTitle')
})

watch([
  () => props.active,
  activeTab,
], ([isActive, tab]) => {
  if (! isActive) {
    closeStudyManagePanel({ sound: false })
    closeStudyCreatePanel({ sound: false })
    stopStudyServerRefresh()
    return
  }

  if (tab === 'online') {
    void connectStudyServers()
    startStudyServerRefresh()
  }
  else {
    closeStudyManagePanel({ sound: false })
    closeStudyCreatePanel({ sound: false })
    stopStudyServerRefresh()
  }
}, { immediate: true })

watch([onlineCustomServerAddresses, onlineServerOrder], () => {
  syncStudyServerRegistry()
}, { deep: true })

onUnmounted(() => {
  stopStudyServerRefresh()
})

function selectTab(tab: 'local' | 'online') {
  if (activeTab.value === tab) return
  emit('uiSound')
  closeStudyManagePanel({ sound: false })
  closeStudyCreatePanel({ sound: false })
  activeTab.value = tab
}

async function connectStudyServers() {
  await Promise.all(studyServers.map(server => connectStudyServer(server)))
}

async function connectStudyServer(server: StudyServerState) {
  if (server.status === 'connecting') return

  server.status = 'connecting'
  server.error = ''
  try {
    const client = new MatchClient(server.address)
    const [{ info, pingMs }, studies, stats] = await Promise.all([
      client.getInfoWithPing(),
      client.getStudies({
        userId: onlineUserId.value,
      }),
      getOptionalStudyServerStats(client),
    ])
    server.name = info.name
    server.version = info.version
    server.commitHash = info.commitHash
    server.buildDate = info.buildDate
    setCachedOnlineServerInfo(server.address, info)
    server.pingMs = pingMs
    server.stats = stats
    server.studies = studies
    server.status = 'connected'
  }
  catch (err) {
    server.studies = []
    server.pingMs = null
    server.stats = null
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function refreshConnectedStudyServers() {
  await Promise.all(
    studyServers
      .filter(server => server.status === 'connected')
      .map(server => refreshStudyServerRooms(server)),
  )
}

async function refreshStudyServerRooms(server: StudyServerState) {
  try {
    const client = new MatchClient(server.address)
    const [{ info, pingMs }, studies, stats] = await Promise.all([
      client.getInfoWithPing(),
      client.getStudies({
        userId: onlineUserId.value,
      }),
      getOptionalStudyServerStats(client),
    ])
    server.name = info.name
    server.version = info.version
    server.commitHash = info.commitHash
    server.buildDate = info.buildDate
    setCachedOnlineServerInfo(server.address, info)
    server.pingMs = pingMs
    server.stats = stats
    server.studies = studies
    server.error = ''
  }
  catch (err) {
    server.studies = []
    server.pingMs = null
    server.stats = null
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function getOptionalStudyServerStats(client: MatchClient) {
  try {
    return await client.getStats()
  }
  catch {
    return null
  }
}

function startStudyServerRefresh() {
  stopStudyServerRefresh()
  studyRefreshTimer = window.setInterval(() => {
    if (! props.active || activeTab.value !== 'online') return
    void refreshConnectedStudyServers()
  }, STUDY_REFRESH_INTERVAL_MS)
}

function stopStudyServerRefresh() {
  if (studyRefreshTimer === null) return
  window.clearInterval(studyRefreshTimer)
  studyRefreshTimer = null
}

function clickRefreshStudyServers() {
  emit('uiSound')
  void connectStudyServers()
}

function clickConnectStudyServer(server: StudyServerState) {
  emit('uiSound')
  void connectStudyServer(server)
}

function toggleStudyServerExpanded(server: StudyServerState) {
  emit('uiSound')
  if (expandedStudyServerIds.has(server.id)) {
    expandedStudyServerIds.delete(server.id)
  }
  else {
    expandedStudyServerIds.add(server.id)
  }
}

function openOnlineStudyCreatePanel(server: StudyServerState) {
  if (server.status !== 'connected') return
  expandedStudyServerIds.add(server.id)
  openStudyCreatePanel({ kind: 'online', serverId: server.id })
}

function openLocalStudyCreatePanel(source: StudySourceKind = 'empty') {
  openStudyCreatePanel({ kind: 'local' }, source)
}

function openStudyCreatePanel(target: StudyCreateTarget, source: StudySourceKind = 'empty') {
  emit('uiSound')
  closeStudyManagePanel({ sound: false })
  studyCreateTarget.value = target
  studyCreateName.value = ''
  studyCreatePrivate.value = true
  studyCreateSource.value = source
  studyCreateImportText.value = ''
  studyCreateImportDocument.value = null
  studyCreateImportError.value = ''
}

function openStudyManagePanel(id: string, title: string) {
  emit('uiSound')
  setLocalStudyManagePanel(id, title)
}

function setLocalStudyManagePanel(id: string, title: string) {
  closeStudyCreatePanel({ sound: false })
  managingOnlineStudy.value = null
  managingOnlineStudyTitle.value = ''
  managingStudyId.value = id
  managingStudyTitle.value = title
}

function openOnlineStudyManagePanel(server: StudyServerState, study: StudyRoom) {
  if (! canManageOnlineStudy(study)) return
  emit('uiSound')
  setOnlineStudyManagePanel(server, study)
}

function setOnlineStudyManagePanel(server: StudyServerState, study: StudyRoom) {
  closeStudyCreatePanel({ sound: false })
  managingStudyId.value = null
  managingStudyTitle.value = ''
  managingOnlineStudy.value = {
    serverId: server.id,
    studyId: study.id,
  }
  managingOnlineStudyTitle.value = study.name
  managingOnlineStudyPrivate.value = study.private
}

function closeStudyManagePanel(options: { sound?: boolean } = {}) {
  if (! isManagingStudy.value) return
  if (options.sound !== false) emit('uiSound')
  managingStudyId.value = null
  managingStudyTitle.value = ''
  managingOnlineStudy.value = null
  managingOnlineStudyTitle.value = ''
  managingOnlineStudyPrivate.value = true
}

function closeStudyCreatePanel(options: { sound?: boolean } = {}) {
  if (! studyCreateTarget.value) return
  if (options.sound !== false) emit('uiSound')
  studyCreateTarget.value = null
  studyCreateName.value = ''
  studyCreateSource.value = 'empty'
  studyCreateImportText.value = ''
  studyCreateImportDocument.value = null
  studyCreateImportError.value = ''
}

function createStudyFromCreatePanel(document: StudyDocument | null) {
  const target = studyCreateTarget.value
  if (! target) return
  if (target.kind === 'local') {
    createLocalStudyFromCreatePanel(document)
    return
  }
  void createOnlineStudy(document, onlineStudyCreateServer.value)
}

function createLocalStudyFromCreatePanel(document: StudyDocument | null) {
  emit('uiSound')
  const title = getStudyCreateTitle(document)
  const study = document
    ? createStudyFromDocument(prepareStudyCreateDocument(document, title))
    : createStudy({ title })
  closeStudyCreatePanel({ sound: false })
  emit('openStudy', study, { kind: 'local' })
}

async function createOnlineStudy(
  document: StudyDocument | null,
  server: StudyServerState | null = onlineStudyCreateServer.value,
) {
  emit('uiSound')
  if (! server || server.status !== 'connected') return

  const title = getStudyCreateTitle(document)
  try {
    const client = new MatchClient(server.address)
    const response = await client.createStudy({
      userId: onlineUserId.value ?? undefined,
      nickname: studyNickname.value,
      name: title,
      private: studyCreatePrivate.value,
      document: document ? prepareStudyCreateDocument(document, title) : undefined,
    })
    onlineUserId.value = response.user.id
    upsertServerStudy(server, response.room)
    emit('openStudy', response.room.document, {
      kind: 'online',
      serverAddress: server.address,
      roomId: response.room.id,
      version: response.room.version,
      private: response.room.private,
    })
    closeStudyCreatePanel({ sound: false })
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

function getStudyCreateTitle(document: StudyDocument | null): string {
  return studyCreateName.value.trim() || document?.title.trim() || t('study.untitled')
}

function prepareStudyCreateDocument(document: StudyDocument, title: string): StudyDocument {
  return StudyDocumentSchema.parse({
    ...document,
    title,
    updatedAt: Date.now(),
  })
}

async function openOnlineStudy(server: StudyServerState, study: StudyRoom) {
  emit('uiSound')
  if (server.status !== 'connected') return

  try {
    const client = new MatchClient(server.address)
    const response = await client.joinStudy(study.id, {
      userId: onlineUserId.value ?? undefined,
      nickname: studyNickname.value,
    })
    onlineUserId.value = response.user.id
    upsertServerStudy(server, response.room)
    emit('openStudy', response.room.document, {
      kind: 'online',
      serverAddress: server.address,
      roomId: response.room.id,
      version: response.room.version,
      private: response.room.private,
    })
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

function upsertServerStudy(server: StudyServerState, study: StudyRoom) {
  const index = server.studies.findIndex(item => item.id === study.id)
  if (index >= 0) server.studies[index] = study
  else server.studies.unshift(study)
}

function isStudyServerExpanded(server: StudyServerState) {
  return expandedStudyServerIds.has(server.id)
}

function getStudyServerDynamicMeta(server: StudyServerState) {
  return [
    server.pingMs === null ? '' : t('match.ping', { ms: String(server.pingMs) }),
    server.stats ? t('match.connections', { count: String(server.stats.connectionCount) }) : '',
    server.status === 'connected' ? t('study.serverStats', { studies: String(server.studies.length) }) : '',
  ].filter(Boolean)
}

function getStudyMeta(study: StudyRoom) {
  return t('study.meta', {
    actions: study.document.actions.length,
    annotations: study.document.annotations.length,
    date: new Date(study.updatedAt).toLocaleDateString(),
  })
}

function getStudyMemberMeta(study: StudyRoom) {
  return t('study.members', {
    count: String(study.members.length),
  })
}

function getStudyVisibilityMeta(study: StudyRoom) {
  return study.private
    ? t('study.private')
    : t('study.public')
}

function canManageOnlineStudy(study: StudyRoom) {
  return study.ownerUserId === onlineUserId.value
}

function openStudy(id: string) {
  if (isManagingStudy.value) return
  const study = getStudy(id)
  if (! study) return
  emit('uiSound')
  emit('openStudy', study, { kind: 'local' })
}

function removeManagedStudy() {
  const id = managingStudyId.value
  if (! id) return

  emit('uiSound')
  deleteStudy(id)
  emit('deleteLocalStudy', id)
  closeStudyManagePanel({ sound: false })
}

function saveManagedStudy() {
  const id = managingStudyId.value
  if (! id) return

  emit('uiSound')
  renameStudy(id, managingStudyTitle.value)
  closeStudyManagePanel({ sound: false })
}

async function saveManagedOnlineStudy() {
  const target = managingOnlineStudy.value
  const server = managedOnlineStudyServer.value
  if (! target || ! server || ! onlineUserId.value) return

  emit('uiSound')
  try {
    const client = new MatchClient(server.address)
    const response = await client.updateStudy(target.studyId, {
      userId: onlineUserId.value,
      name: managingOnlineStudyTitle.value,
      private: managingOnlineStudyPrivate.value,
    })
    upsertServerStudy(server, response.room)
    closeStudyManagePanel({ sound: false })
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function removeManagedOnlineStudy() {
  const target = managingOnlineStudy.value
  const server = managedOnlineStudyServer.value
  if (! target || ! server || ! onlineUserId.value) return

  emit('uiSound')
  try {
    const client = new MatchClient(server.address)
    await client.deleteStudy(target.studyId, {
      userId: onlineUserId.value,
    })
    server.studies = server.studies.filter(study => study.id !== target.studyId)
    closeStudyManagePanel({ sound: false })
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

function close() {
  emit('uiSound')
  closeStudyManagePanel({ sound: false })
  closeStudyCreatePanel({ sound: false })
  stopStudyServerRefresh()
  emit('close')
}

function createStudyServerState(entry: OnlineServerEntry): StudyServerState {
  return {
    id: entry.address,
    address: entry.address,
    status: 'idle',
    name: entry.name,
    version: entry.version,
    commitHash: entry.commitHash,
    buildDate: entry.buildDate,
    pingMs: null,
    stats: null,
    studies: [],
    error: '',
  }
}

function syncStudyServerRegistry() {
  const entries = getOnlineServerEntries()
  const entryAddressSet = new Set(entries.map(entry => entry.address))
  for (const server of studyServers) {
    if (entryAddressSet.has(server.address)) continue
    expandedStudyServerIds.delete(server.id)
    if (studyCreateTarget.value?.kind === 'online' && studyCreateTarget.value.serverId === server.id) {
      closeStudyCreatePanel({ sound: false })
    }
    if (managingOnlineStudy.value?.serverId === server.id) {
      closeStudyManagePanel({ sound: false })
    }
  }

  const nextServers = entries.map(entry => {
    const server = studyServers.find(item => item.address === entry.address)
    if (! server) return createStudyServerState(entry)
    if (server.status === 'idle' || ! server.name) {
      server.name = entry.name
      server.version = entry.version
      server.commitHash = entry.commitHash
      server.buildDate = entry.buildDate
    }
    return server
  })
  studyServers.splice(0, studyServers.length, ...nextServers)
}
</script>

<template>
  <div
    v-if="active"
    class="study-page"
  >
    <div
      class="study-tabs"
      role="tablist"
      :aria-label="t('study.tabsLabel')"
    >
      <GameTab
        :pressed="activeTab === 'local'"
        @click="selectTab('local')"
      >
        <span>{{ t('study.local') }}</span>
      </GameTab>
      <GameTab
        :pressed="activeTab === 'online'"
        @click="selectTab('online')"
      >
        <span>{{ t('study.online') }}</span>
      </GameTab>
    </div>

    <div class="study-card">
      <div class="study-card-header">
        <h2 class="dialog-title">
          {{ pageTitle }}
        </h2>
        <div class="study-card-actions">
          <GameButton
            size="small"
            @click="close"
          >
            <span>{{ t('button.back') }}</span>
          </GameButton>
        </div>
      </div>

      <OnlinePanelToolbar
        v-if="activeTab === 'online' && !studyCreateTarget && !isManagingStudy"
        v-model:nickname="studyNickname"
        class="study-online-toolbar"
        :show-back="false"
        @refresh="clickRefreshStudyServers"
        @server-settings="emit('openOnlineSettings')"
      />

      <div
        v-if="activeTab === 'local' && !studyCreateTarget && !isManagingStudy"
        class="study-local-toolbar"
      >
        <GameButton
          size="small"
          @click="openLocalStudyCreatePanel('empty')"
        >
          <span>{{ t('study.create') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="openLocalStudyCreatePanel('import')"
        >
          <span>{{ t('button.import') }}</span>
        </GameButton>
      </div>
      <StudyCreatePanel
        v-if="studyCreateTarget"
        v-model:name="studyCreateName"
        v-model:visibility-private="studyCreatePrivate"
        v-model:source="studyCreateSource"
        v-model:import-text="studyCreateImportText"
        v-model:import-document="studyCreateImportDocument"
        v-model:import-error="studyCreateImportError"
        :title="studyCreateTarget.kind === 'online' ? t('study.createOnlineTitle') : t('study.createLocalTitle')"
        :server-name="onlineStudyCreateServer?.name"
        :server-address="onlineStudyCreateServer?.address"
        :name-label="t('study.studyName')"
        :name-placeholder="t('study.namePlaceholder')"
        :create-label="t('study.create')"
        :imported-title="t('study.imported')"
        :show-private="studyCreateTarget.kind === 'online'"
        @back="closeStudyCreatePanel"
        @create="createStudyFromCreatePanel"
      />
      <RoomManagePanel
        v-else-if="activeTab === 'local' && managedStudy"
        v-model:name="managingStudyTitle"
        :title="t('study.manageLocalTitle')"
        :meta="t('study.meta', {
          actions: managedStudy.actionCount,
          annotations: managedStudy.annotationCount,
          date: new Date(managedStudy.updatedAt).toLocaleDateString(),
        })"
        :name-label="t('study.studyName')"
        :name-placeholder="t('study.namePlaceholder')"
        :danger-title="t('room.dangerZone')"
        :delete-label="t('button.delete')"
        :delete-confirm-label="t('room.confirmDelete')"
        :back-label="t('button.back')"
        :save-label="t('button.save')"
        @back="closeStudyManagePanel"
        @save="saveManagedStudy"
        @delete="removeManagedStudy"
      />
      <RoomManagePanel
        v-else-if="activeTab === 'online' && managedOnlineStudyRoom"
        v-model:name="managingOnlineStudyTitle"
        v-model:visibility-private="managingOnlineStudyPrivate"
        :title="t('study.manageOnlineTitle')"
        :meta="[
          managedOnlineStudyServer?.name || managedOnlineStudyServer?.address || '',
          getStudyMeta(managedOnlineStudyRoom),
          getStudyMemberMeta(managedOnlineStudyRoom),
        ].filter(Boolean).join(' - ')"
        :name-label="t('study.studyName')"
        :name-placeholder="t('study.namePlaceholder')"
        :show-visibility="true"
        :visibility-label="t('room.visibility')"
        :visibility-private-label="t('study.private')"
        :danger-title="t('room.dangerZone')"
        :delete-label="t('button.delete')"
        :delete-confirm-label="t('room.confirmDelete')"
        :back-label="t('button.back')"
        :save-label="t('button.save')"
        @back="closeStudyManagePanel"
        @save="saveManagedOnlineStudy"
        @delete="removeManagedOnlineStudy"
      />
      <div
        v-else-if="activeTab === 'local'"
        class="study-list"
      >
        <GamePanel
          v-if="sortedSummaries.length === 0"
          tag="section"
          class="study-empty"
        >
          {{ t('study.empty') }}
        </GamePanel>
        <GamePanel
          v-for="study in sortedSummaries"
          :key="study.id"
          tag="section"
          class="study-item-panel"
        >
          <GameListItem>
            <template #title>
              <span>{{ study.title }}</span>
            </template>
            <template #meta>
              <span>
                {{ t('study.meta', {
                  actions: study.actionCount,
                  annotations: study.annotationCount,
                  date: new Date(study.updatedAt).toLocaleDateString(),
                }) }}
              </span>
            </template>
            <template #actions>
              <GameButton
                size="small"
                @click="openStudyManagePanel(study.id, study.title)"
              >
                <span>{{ t('button.manage') }}</span>
              </GameButton>
              <GameButton
                size="small"
                @click="openStudy(study.id)"
              >
                <span>{{ t('button.open') }}</span>
              </GameButton>
            </template>
          </GameListItem>
        </GamePanel>
      </div>
      <div
        v-else
        class="study-list"
      >
        <OnlineServerItem
          v-for="server in studyServers"
          :key="server.id"
          :server="server"
          :expanded="isStudyServerExpanded(server)"
          :manual="false"
          :dynamic-meta="getStudyServerDynamicMeta(server)"
          @toggle="toggleStudyServerExpanded"
          @create-room="openOnlineStudyCreatePanel"
          @connect="clickConnectStudyServer"
        >
          <template #rooms>
            <div class="study-online-room-list">
              <div
                v-if="server.studies.length === 0"
                class="study-online-empty"
              >
                {{ t('study.noOnlineRooms') }}
              </div>
              <template v-else>
                <GameListItem
                  v-for="(study, studyIndex) in server.studies"
                  :key="study.id"
                  :border="studyIndex > 0"
                >
                  <template #title>
                    <span>{{ study.name }}</span>
                  </template>
                  <template #meta>
                    <span>{{ getStudyMeta(study) }}</span>
                    <span>{{ getStudyMemberMeta(study) }}</span>
                    <span>{{ getStudyVisibilityMeta(study) }}</span>
                  </template>
                  <template #actions>
                    <GameButton
                      v-if="canManageOnlineStudy(study)"
                      size="small"
                      @click="openOnlineStudyManagePanel(server, study)"
                    >
                      <span>{{ t('button.manage') }}</span>
                    </GameButton>
                    <GameButton
                      size="small"
                      @click="openOnlineStudy(server, study)"
                    >
                      <span>{{ t('button.open') }}</span>
                    </GameButton>
                  </template>
                </GameListItem>
              </template>
            </div>
          </template>
        </OnlineServerItem>
      </div>
    </div>
  </div>
</template>

<style scoped>
.study-page {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: var(--z-ui-page);
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  width: min(760px, calc(100vw - var(--button-top) * 2));
  height: min(620px, calc(100vh - var(--button-top) * 2));
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.study-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  min-height: 0;
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
}

.study-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.study-card-actions,
.study-local-toolbar,
.study-tabs {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.study-online-toolbar {
  justify-content: flex-end;
}

.study-online-create-settings {
  width: 100%;
}

.study-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  padding-right: calc(var(--button-content-gap) * 0.5);
  overflow: auto;
}

.study-empty {
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.72);
}

.study-online-empty {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.study-online-room-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
}

.study-list :deep(.game-list-item__meta > span + span::before) {
  content: "-";
  margin: 0 calc(var(--button-content-gap) * 0.75);
}
</style>
