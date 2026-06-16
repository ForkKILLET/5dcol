<script setup lang="ts">
import { computed, onUnmounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchGameState } from '@5dcol/shared/protocol'
import { useMatch } from '@/composables/match'
import { useLocalVersus, type LocalVersusSummary } from '@/composables/localVersus'
import GameButton from './GameButton.vue'
import GameListItem from './GameListItem.vue'
import GameListItemMenu from './GameListItemMenu.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import GameTextInput from './GameTextInput.vue'
import MatchPanel from './MatchPanel.vue'

const props = defineProps<{
  active: boolean
  gameStarted: boolean
  mainMenuMode: 'home' | 'versus' | 'study'
  canStartOnlineGame: boolean
}>()

const emit = defineEmits<{
  close: []
  importRecord: []
  startLocalGame: [game: LocalVersusSummary]
  startOnlineGame: [serverAddress: string, state: MatchGameState]
  uiSound: []
}>()

const {
  DEFAULT_MATCH_SERVER_IDS,
  addManualMatchServer,
  clickConnectMatchServer,
  clickRefreshMatchServers,
  closeMatchRoomSettingsPanel,
  connectMatchServers,
  createMatchRoom,
  customRoomServer,
  expandedMatchServerIds,
  joinMatchRoom,
  manualMatchServerAddress,
  matchNickname,
  matchPanelMode,
  matchRoomName,
  matchRoomSettings,
  matchServers,
  openCustomRoomForm,
  openMatchRoomSettingsDialog,
  removeManualMatchServer,
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
const { t } = useI18n({ useScope: 'global' })
const pageTitle = computed(() => {
  if (activeTab.value === 'local') return t('versus.localTitle')
  return matchPanelMode.value === 'room-settings'
    ? t('dialog.matchRoomSettingsTitle')
    : t('versus.onlineTitle')
})

watch([
  () => props.active,
  activeTab,
], ([active, tab]) => {
  if (! active) {
    stopMatchServerRefresh()
    matchPanelMode.value = 'servers'
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
  }
}, { immediate: true })

onUnmounted(() => {
  stopMatchServerRefresh()
})

function selectTab(tab: 'local' | 'online') {
  if (activeTab.value === tab) return
  emit('uiSound')
  openLocalGameActionMenuId.value = null
  activeTab.value = tab
}

function close() {
  stopMatchServerRefresh()
  matchPanelMode.value = 'servers'
  cancelRenameLocalGame()
  openLocalGameActionMenuId.value = null
  emit('close')
}

function closeSettingsPanel() {
  closeMatchRoomSettingsPanel()
}

function createAndOpenLocalGame() {
  emit('uiSound')
  cancelRenameLocalGame()
  const game = createLocalGame(t('versus.untitled'))
  emit('startLocalGame', game)
}

function openImportDialog() {
  cancelRenameLocalGame()
  openLocalGameActionMenuId.value = null
  emit('importRecord')
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
        <GameButton
          size="small"
          @click="close"
        >
          <span>{{ t('button.back') }}</span>
        </GameButton>
      </div>

      <div
        v-if="activeTab === 'local'"
        class="versus-local-toolbar"
      >
        <p>{{ t('versus.localDescription') }}</p>
        <GameButton
          size="small"
          @click="createAndOpenLocalGame"
        >
          <span>{{ t('versus.create') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="openImportDialog"
        >
          <span>{{ t('button.import') }}</span>
        </GameButton>
      </div>

    <GamePanel
      v-if="activeTab === 'local'"
      tag="section"
      class="versus-local-panel"
    >
      <div
        v-if="sortedLocalGames.length === 0"
        class="versus-empty"
      >
        {{ t('versus.empty') }}
      </div>
      <div class="versus-local-list">
        <GameListItem
          v-for="localGame in sortedLocalGames"
          :key="localGame.id"
        >
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
      </div>
    </GamePanel>

    <MatchPanel
      v-else
      v-model:manual-address="manualMatchServerAddress"
      v-model:nickname="matchNickname"
      v-model:room-name="matchRoomName"
      embedded
      class="versus-online-panel"
      :show-back="false"
      :show-title="false"
      :room-settings="matchRoomSettings"
      :mode="matchPanelMode"
      :servers="matchServers"
      :custom-room-server="customRoomServer"
      :expanded-server-ids="expandedMatchServerIds"
      :default-server-ids="DEFAULT_MATCH_SERVER_IDS"
      @refresh="clickRefreshMatchServers"
      @back="close"
      @settings-back="closeSettingsPanel"
      @add-server="addManualMatchServer"
      @open-room-settings="openMatchRoomSettingsDialog"
      @create-room="createMatchRoom()"
      @toggle-server="toggleMatchServerExpanded"
      @connect-server="clickConnectMatchServer"
      @remove-server="removeManualMatchServer"
      @open-custom-room="openCustomRoomForm"
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
  z-index: 1;
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

.versus-tabs {
  display: flex;
  gap: var(--button-content-gap);
  align-items: baseline;
}

.versus-local-panel {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
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
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  overflow: auto;
}

</style>
