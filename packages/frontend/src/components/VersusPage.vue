<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchGameState } from '@5dcol/shared/protocol'
import { useMatch } from '@/composables/match'
import { useLocalVersus, type LocalVersusSummary, type VersusImportedSource } from '@/composables/localVersus'
import GameButton from './GameButton.vue'
import GameListItem from './GameListItem.vue'
import GameListItemMenu from './GameListItemMenu.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import GameTextInput from './GameTextInput.vue'
import MatchPanel from './MatchPanel.vue'
import OnlinePanelToolbar from './OnlinePanelToolbar.vue'
import VersusCreatePanel from './VersusCreatePanel.vue'
import type { VersusSourceKind } from './VersusSourcePicker.vue'

const props = defineProps<{
  active: boolean
  gameStarted: boolean
  mainMenuMode: 'home' | 'versus' | 'study'
  canStartOnlineGame: boolean
}>()

const emit = defineEmits<{
  close: []
  openOnlineSettings: []
  startLocalGame: [game: LocalVersusSummary]
  startOnlineGame: [serverAddress: string, state: MatchGameState]
  uiSound: []
}>()

const {
  clickConnectMatchServer,
  clickRefreshMatchServers,
  closeMatchCreateRoomPanel,
  connectMatchServers,
  createMatchRoom,
  customRoomServer,
  expandedMatchServerIds,
  joinMatchRoom,
  matchNickname,
  matchPanelMode,
  matchRoomName,
  matchRoomSettings,
  matchServers,
  openCustomRoomForm,
  returnToMatchRoom,
  startMatchServerRefresh,
  stopMatchServerRefresh,
  toggleMatchServerExpanded,
  viewMatchRoom,
} = useMatch({
  gameStarted: toRef(props, 'gameStarted'),
  mainMenuMode: toRef(props, 'mainMenuMode'),
  playUISound: () => emit('uiSound'),
  canStartOnlineGame: () => props.canStartOnlineGame,
  startOnlineGame: (serverAddress, state) => emit('startOnlineGame', serverAddress, state),
})
const {
  createGame: createLocalGame,
  createGameFromSource: createLocalGameFromSource,
  deleteGame: deleteLocalGame,
  getGame: getLocalGame,
  renameGame: renameLocalGame,
  summaries: localGameSummaries,
} = useLocalVersus()

const sortedLocalGames = computed(() => localGameSummaries.value)
const activeTab = ref<'local' | 'online'>('local')
const editingLocalGameId = ref<string | null>(null)
const editingLocalGameTitle = ref('')
const openLocalGameActionMenuId = ref<string | null>(null)
const localCreateOpen = ref(false)
const localCreateName = ref('')
const localCreateSource = ref<VersusSourceKind>('empty')
const localCreateImportText = ref('')
const localCreateImportSource = ref<VersusImportedSource | null>(null)
const localCreateImportError = ref('')
const onlineCreateSource = ref<VersusSourceKind>('empty')
const onlineCreateImportText = ref('')
const onlineCreateImportSource = ref<VersusImportedSource | null>(null)
const onlineCreateImportError = ref('')
const { t } = useI18n({ useScope: 'global' })
const pageTitle = computed(() => {
  if (activeTab.value === 'local') return t('versus.localTitle')
  return t('versus.onlineTitle')
})

watch([
  () => props.active,
  activeTab,
], ([active, tab]) => {
  if (! active) {
    stopMatchServerRefresh()
    matchPanelMode.value = 'servers'
    closeLocalCreatePanel({ sound: false })
    closeOnlineCreatePanel({ sound: false })
    cancelRenameLocalGame()
    return
  }

  if (tab === 'online') {
    void connectMatchServers()
    startMatchServerRefresh()
  }
  else {
    stopMatchServerRefresh()
    matchPanelMode.value = 'servers'
    closeOnlineCreatePanel({ sound: false })
  }
}, { immediate: true })

onUnmounted(() => {
  stopMatchServerRefresh()
})

function selectTab(tab: 'local' | 'online') {
  if (activeTab.value === tab) return
  emit('uiSound')
  openLocalGameActionMenuId.value = null
  closeLocalCreatePanel({ sound: false })
  closeOnlineCreatePanel({ sound: false })
  activeTab.value = tab
}

function close() {
  stopMatchServerRefresh()
  matchPanelMode.value = 'servers'
  closeLocalCreatePanel({ sound: false })
  closeOnlineCreatePanel({ sound: false })
  cancelRenameLocalGame()
  openLocalGameActionMenuId.value = null
  emit('close')
}

function createAndOpenLocalGame() {
  openLocalCreatePanel()
}

function openLocalCreatePanel(source: VersusSourceKind = 'empty') {
  emit('uiSound')
  cancelRenameLocalGame()
  openLocalGameActionMenuId.value = null
  localCreateOpen.value = true
  localCreateName.value = source === 'import' ? t('versus.imported') : t('versus.untitled')
  localCreateSource.value = source
  localCreateImportText.value = ''
  localCreateImportSource.value = null
  localCreateImportError.value = ''
}

function closeLocalCreatePanel({ sound = true }: { sound?: boolean } = {}) {
  if (! localCreateOpen.value) return
  if (sound) emit('uiSound')
  localCreateOpen.value = false
  localCreateImportText.value = ''
  localCreateImportSource.value = null
  localCreateImportError.value = ''
}

function createLocalGameFromPanel(source: VersusImportedSource | null) {
  emit('uiSound')
  const title = localCreateName.value.trim() || t('versus.untitled')
  const result = source
    ? createLocalGameFromSource(source, title)
    : { game: createLocalGame(title), error: null }
  if (! result.game) {
    localCreateImportError.value = result.error ?? 'Failed to create game'
    return
  }
  closeLocalCreatePanel({ sound: false })
  emit('startLocalGame', result.game)
}

function openOnlineCreatePanel(server: Parameters<typeof openCustomRoomForm>[0]) {
  onlineCreateSource.value = 'empty'
  onlineCreateImportText.value = ''
  onlineCreateImportSource.value = null
  onlineCreateImportError.value = ''
  openCustomRoomForm(server)
}

function closeOnlineCreatePanel({ sound = true }: { sound?: boolean } = {}) {
  const wasOpen = matchPanelMode.value === 'create-room'
  if (sound && wasOpen) emit('uiSound')
  closeMatchCreateRoomPanel()
  onlineCreateImportText.value = ''
  onlineCreateImportSource.value = null
  onlineCreateImportError.value = ''
}

function createOnlineRoomFromPanel(source: VersusImportedSource | null) {
  void createMatchRoom(source ? {
    initialMultiverse: source.initialMultiverse,
    actions: source.actions,
  } : null)
}

function openLocalGame(id: string) {
  if (editingLocalGameId.value) return
  const game = getLocalGame(id)
  if (! game) return
  emit('uiSound')
  openLocalGameActionMenuId.value = null
  emit('startLocalGame', game)
}

function removeLocalGame(id: string) {
  emit('uiSound')
  if (editingLocalGameId.value === id) cancelRenameLocalGame()
  openLocalGameActionMenuId.value = null
  deleteLocalGame(id)
}

function beginRenameLocalGame(id: string, title: string) {
  emit('uiSound')
  openLocalGameActionMenuId.value = null
  editingLocalGameId.value = id
  editingLocalGameTitle.value = title
}

function saveRenameLocalGame() {
  const id = editingLocalGameId.value
  if (! id) return

  emit('uiSound')
  renameLocalGame(id, editingLocalGameTitle.value)
  cancelRenameLocalGame()
}

function cancelRenameLocalGame() {
  editingLocalGameId.value = null
  editingLocalGameTitle.value = ''
}

function clickCancelRenameLocalGame() {
  emit('uiSound')
  cancelRenameLocalGame()
}

function isLocalGameActionMenuOpen(id: string) {
  return openLocalGameActionMenuId.value === id
}

function setLocalGameActionMenuOpen(id: string, open: boolean) {
  openLocalGameActionMenuId.value = open ? id : null
}
</script>

<template>
  <div
    v-if="active"
    class="versus-page"
  >
    <div
      class="versus-tabs"
      role="tablist"
      :aria-label="t('versus.tabsLabel')"
    >
      <GameTab
        :pressed="activeTab === 'local'"
        @click="selectTab('local')"
      >
        <span>{{ t('versus.local') }}</span>
      </GameTab>
      <GameTab
        :pressed="activeTab === 'online'"
        @click="selectTab('online')"
      >
        <span>{{ t('versus.online') }}</span>
      </GameTab>
    </div>

    <div class="versus-card">
      <div class="versus-card-header">
        <h2 class="dialog-title">
          {{ pageTitle }}
        </h2>
        <div class="versus-card-actions">
          <GameButton
            size="small"
            @click="close"
          >
            <span>{{ t('button.back') }}</span>
          </GameButton>
        </div>
      </div>

      <OnlinePanelToolbar
        v-if="activeTab === 'online' && matchPanelMode === 'servers'"
        v-model:nickname="matchNickname"
        class="versus-online-toolbar"
        :show-back="false"
        @refresh="clickRefreshMatchServers"
        @server-settings="emit('openOnlineSettings')"
      />

      <div
        v-if="activeTab === 'local' && !localCreateOpen"
        class="versus-local-toolbar"
      >
        <p>{{ t('versus.localDescription') }}</p>
        <GameButton
          size="small"
          @click="createAndOpenLocalGame"
        >
          <span>{{ t('versus.create') }}</span>
        </GameButton>
      </div>

    <div
      v-if="activeTab === 'local' && !localCreateOpen"
      class="versus-local-list"
    >
      <GamePanel
        v-if="sortedLocalGames.length === 0"
        tag="section"
        class="versus-empty"
      >
        {{ t('versus.empty') }}
      </GamePanel>
      <template v-else>
        <GamePanel
          v-for="localGame in sortedLocalGames"
          :key="localGame.id"
          tag="section"
          class="versus-item-panel"
        >
          <GameListItem>
            <template #title>
              <span v-if="editingLocalGameId !== localGame.id">{{ localGame.title }}</span>
              <GameTextInput
                v-else
                v-model="editingLocalGameTitle"
                :placeholder="t('versus.namePlaceholder')"
                spellcheck="false"
                @keydown.enter.prevent="saveRenameLocalGame"
                @keydown.esc.prevent="cancelRenameLocalGame"
              />
            </template>
            <template #meta>
              <span>
                {{ t('versus.meta', {
                  actions: localGame.actionCount,
                  annotations: localGame.annotationCount,
                  date: new Date(localGame.updatedAt).toLocaleDateString(),
                }) }}
              </span>
            </template>
            <template #actions>
              <template v-if="editingLocalGameId === localGame.id">
                <GameButton
                  size="small"
                  @click="saveRenameLocalGame"
                >
                  <span>{{ t('button.save') }}</span>
                </GameButton>
                <GameButton
                  size="small"
                  @click="clickCancelRenameLocalGame"
                >
                  <span>{{ t('button.cancel') }}</span>
                </GameButton>
              </template>
              <template v-else>
                <GameListItemMenu
                  :open="isLocalGameActionMenuOpen(localGame.id)"
                  @update:open="setLocalGameActionMenuOpen(localGame.id, $event)"
                  @ui-sound="emit('uiSound')"
                  @rename="beginRenameLocalGame(localGame.id, localGame.title)"
                  @delete="removeLocalGame(localGame.id)"
                />
                <GameButton
                  size="small"
                  @click="openLocalGame(localGame.id)"
                >
                  <span>{{ t('button.open') }}</span>
                </GameButton>
              </template>
            </template>
          </GameListItem>
        </GamePanel>
      </template>
    </div>

    <VersusCreatePanel
      v-else-if="activeTab === 'local'"
      v-model:name="localCreateName"
      v-model:source="localCreateSource"
      v-model:import-text="localCreateImportText"
      v-model:import-source="localCreateImportSource"
      v-model:import-error="localCreateImportError"
      :title="t('versus.createLocalTitle')"
      :name-label="t('versus.gameName')"
      :name-placeholder="t('versus.namePlaceholder')"
      :create-label="t('versus.create')"
      @back="closeLocalCreatePanel"
      @create="createLocalGameFromPanel"
    />

    <MatchPanel
      v-else
      v-model:room-name="matchRoomName"
      v-model:create-source="onlineCreateSource"
      v-model:create-import-text="onlineCreateImportText"
      v-model:create-import-source="onlineCreateImportSource"
      v-model:create-import-error="onlineCreateImportError"
      embedded
      class="versus-online-panel"
      :show-title="false"
      :room-settings="matchRoomSettings"
      :mode="matchPanelMode"
      :servers="matchServers"
      :custom-room-server="customRoomServer"
      :expanded-server-ids="expandedMatchServerIds"
      @create-back="closeOnlineCreatePanel"
      @create-room="createOnlineRoomFromPanel"
      @toggle-server="toggleMatchServerExpanded"
      @connect-server="clickConnectMatchServer"
      @open-custom-room="openOnlineCreatePanel"
      @return-room="returnToMatchRoom"
      @join-room="joinMatchRoom"
      @view-room="viewMatchRoom"
    />
    </div>
  </div>
</template>

<style scoped>
.versus-page {
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

.versus-card {
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

.versus-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.versus-card-actions {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
  min-width: 0;
}

.versus-online-toolbar {
  justify-content: flex-end;
}

.versus-tabs {
  display: flex;
  gap: var(--button-content-gap);
  align-items: baseline;
}

.versus-online-panel {
  flex: 1 1 auto;
  min-height: 0;
}

.versus-local-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.versus-local-toolbar p {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 560px;
  margin: 0;
  font-size: calc(var(--button-font-size) * 0.52);
  line-height: 1.35;
  opacity: 0.78;
}

.versus-empty {
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.72);
}

.versus-local-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  padding-right: calc(var(--button-content-gap) * 0.5);
  overflow: auto;
}

</style>
