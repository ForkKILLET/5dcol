<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchServerStats, StudyDocument, StudyRoom } from '@5dcol/shared/protocol'
import { MatchClient, type MatchServerConnectionStatus } from '@engine/matchClient'
import {
  DEFAULT_ONLINE_SERVERS,
  DEFAULT_ONLINE_SERVER_IDS,
  normalizeOnlineServerAddress,
  useOnlineIdentity,
} from '@/composables/online'
import { useLocalStudies } from '@/composables/study'
import GameButton from './GameButton.vue'
import GameListItem from './GameListItem.vue'
import GameListItemMenu from './GameListItemMenu.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import GameTextInput from './GameTextInput.vue'
import ManualServerPanel from './ManualServerPanel.vue'
import OnlinePanelToolbar from './OnlinePanelToolbar.vue'
import OnlineServerItem from './OnlineServerItem.vue'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  close: []
  openStudy: [study: StudyDocument, source?: StudyOpenSource]
  importRecord: []
  uiSound: []
}>()

type StudyOpenSource =
  | { kind: 'local' }
  | { kind: 'online', serverAddress: string, roomId: string, version: number }

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
const editingStudyId = ref<string | null>(null)
const editingStudyTitle = ref('')
const openStudyActionMenuId = ref<string | null>(null)
const manualStudyServerAddress = ref('')
const expandedStudyServerIds = reactive(new Set(DEFAULT_ONLINE_SERVER_IDS))
const studyServers = reactive<StudyServerState[]>(Object
  .entries(DEFAULT_ONLINE_SERVERS)
  .map(([address, { name }]) => ({
    id: address,
    address,
    name,
    version: '',
    commitHash: '',
    buildDate: '',
    pingMs: null,
    stats: null,
    status: 'idle',
    studies: [],
    error: '',
  })))
let studyRefreshTimer: number | null = null

const pageTitle = computed(() => (
  activeTab.value === 'local' ? t('study.localTitle') : t('study.onlineTitle')
))

watch([
  () => props.active,
  activeTab,
], ([isActive, tab]) => {
  if (! isActive) {
    cancelRenameStudy()
    openStudyActionMenuId.value = null
    stopStudyServerRefresh()
    return
  }

  if (tab === 'online') {
    void connectStudyServers()
    startStudyServerRefresh()
  }
  else {
    stopStudyServerRefresh()
  }
}, { immediate: true })

onUnmounted(() => {
  stopStudyServerRefresh()
})

function selectTab(tab: 'local' | 'online') {
  if (activeTab.value === tab) return
  emit('uiSound')
  cancelRenameStudy()
  openStudyActionMenuId.value = null
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

function addManualStudyServer() {
  const address = normalizeOnlineServerAddress(manualStudyServerAddress.value)
  if (! address) return

  emit('uiSound')
  manualStudyServerAddress.value = ''
  const existing = studyServers.find(server => server.address === address)
  if (existing) {
    expandedStudyServerIds.add(existing.id)
    void connectStudyServer(existing)
    return
  }

  const server: StudyServerState = {
    id: address,
    address,
    status: 'idle',
    name: '',
    version: '',
    commitHash: '',
    buildDate: '',
    pingMs: null,
    stats: null,
    studies: [],
    error: '',
  }
  studyServers.push(server)
  expandedStudyServerIds.add(server.id)
  void connectStudyServer(server)
}

function removeManualStudyServer(server: StudyServerState) {
  if (! isManualStudyServer(server)) return

  emit('uiSound')
  const index = studyServers.findIndex(item => item.id === server.id)
  if (index >= 0) studyServers.splice(index, 1)
  expandedStudyServerIds.delete(server.id)
}

async function createOnlineStudy(server: StudyServerState) {
  emit('uiSound')
  if (server.status !== 'connected') return

  try {
    const client = new MatchClient(server.address)
    const response = await client.createStudy({
      userId: onlineUserId.value ?? undefined,
      nickname: studyNickname.value,
      name: t('study.untitled'),
    })
    onlineUserId.value = response.user.id
    upsertServerStudy(server, response.room)
    emit('openStudy', response.room.document, {
      kind: 'online',
      serverAddress: server.address,
      roomId: response.room.id,
      version: response.room.version,
    })
  }
  catch (err) {
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
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

function isManualStudyServer(server: StudyServerState) {
  return ! DEFAULT_ONLINE_SERVER_IDS.has(server.id)
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
  return study.visibility === 'private'
    ? t('study.private')
    : t('study.public')
}

function createAndOpenStudy() {
  emit('uiSound')
  openStudyActionMenuId.value = null
  const study = createStudy({
    title: t('study.untitled'),
  })
  emit('openStudy', study, { kind: 'local' })
}

function openStudy(id: string) {
  if (editingStudyId.value) return
  const study = getStudy(id)
  if (! study) return
  emit('uiSound')
  openStudyActionMenuId.value = null
  emit('openStudy', study, { kind: 'local' })
}

function removeStudy(id: string) {
  emit('uiSound')
  if (editingStudyId.value === id) cancelRenameStudy()
  openStudyActionMenuId.value = null
  deleteStudy(id)
}

function openImportDialog() {
  cancelRenameStudy()
  openStudyActionMenuId.value = null
  emit('importRecord')
}

function beginRenameStudy(id: string, title: string) {
  emit('uiSound')
  openStudyActionMenuId.value = null
  editingStudyId.value = id
  editingStudyTitle.value = title
}

function saveRenameStudy() {
  const id = editingStudyId.value
  if (! id) return

  emit('uiSound')
  renameStudy(id, editingStudyTitle.value)
  cancelRenameStudy()
}

function cancelRenameStudy() {
  editingStudyId.value = null
  editingStudyTitle.value = ''
}

function clickCancelRenameStudy() {
  emit('uiSound')
  cancelRenameStudy()
}

function close() {
  emit('uiSound')
  openStudyActionMenuId.value = null
  stopStudyServerRefresh()
  emit('close')
}

function isStudyActionMenuOpen(id: string) {
  return openStudyActionMenuId.value === id
}

function setStudyActionMenuOpen(id: string, open: boolean) {
  openStudyActionMenuId.value = open ? id : null
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

      <div
        v-if="activeTab === 'local'"
        class="study-local-toolbar"
      >
        <GameButton
          size="small"
          @click="createAndOpenStudy"
        >
          <span>{{ t('study.create') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="openImportDialog"
        >
          <span>{{ t('button.import') }}</span>
        </GameButton>
      </div>
      <OnlinePanelToolbar
        v-else
        v-model:nickname="studyNickname"
        :show-back="false"
        @refresh="clickRefreshStudyServers"
      />

      <div
        v-if="activeTab === 'local'"
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
              <span v-if="editingStudyId !== study.id">{{ study.title }}</span>
              <GameTextInput
                v-else
                v-model="editingStudyTitle"
                :placeholder="t('study.namePlaceholder')"
                spellcheck="false"
                @keydown.enter.prevent="saveRenameStudy"
                @keydown.esc.prevent="cancelRenameStudy"
              />
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
              <template v-if="editingStudyId === study.id">
                <GameButton
                  size="small"
                  @click="saveRenameStudy"
                >
                  <span>{{ t('button.save') }}</span>
                </GameButton>
                <GameButton
                  size="small"
                  @click="clickCancelRenameStudy"
                >
                  <span>{{ t('button.cancel') }}</span>
                </GameButton>
              </template>
              <template v-else>
                <GameListItemMenu
                  :open="isStudyActionMenuOpen(study.id)"
                  @update:open="setStudyActionMenuOpen(study.id, $event)"
                  @ui-sound="emit('uiSound')"
                  @rename="beginRenameStudy(study.id, study.title)"
                  @delete="removeStudy(study.id)"
                />
                <GameButton
                  size="small"
                  @click="openStudy(study.id)"
                >
                  <span>{{ t('button.open') }}</span>
                </GameButton>
              </template>
            </template>
          </GameListItem>
        </GamePanel>
      </div>
      <div
        v-else
        class="study-list"
      >
        <ManualServerPanel
          v-model:address="manualStudyServerAddress"
          :placeholder="t('match.serverAddressPlaceholder')"
          @add="addManualStudyServer"
        />
        <OnlineServerItem
          v-for="server in studyServers"
          :key="server.id"
          :server="server"
          :expanded="isStudyServerExpanded(server)"
          :manual="isManualStudyServer(server)"
          :dynamic-meta="getStudyServerDynamicMeta(server)"
          :create-label="t('study.create')"
          @toggle="toggleStudyServerExpanded"
          @create-room="createOnlineStudy"
          @connect="clickConnectStudyServer"
          @remove="removeManualStudyServer"
        >
          <template #rooms>
            <div
              v-if="server.studies.length === 0"
              class="study-empty"
            >
              {{ t('study.noOnlineRooms') }}
            </div>
            <template v-else>
              <GameListItem
                v-for="study in server.studies"
                :key="study.id"
                border
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
                    size="small"
                    @click="openOnlineStudy(server, study)"
                  >
                    <span>{{ t('button.open') }}</span>
                  </GameButton>
                </template>
              </GameListItem>
            </template>
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
  z-index: 1;
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

.study-list :deep(.game-list-item__meta > span + span::before) {
  content: "-";
  margin: 0 calc(var(--button-content-gap) * 0.75);
}
</style>
