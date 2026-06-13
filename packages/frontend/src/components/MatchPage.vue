<script setup lang="ts">
import { computed, onUnmounted, toRef, watch, type StyleValue } from 'vue'
import type { MatchGameState } from '@5dcol/shared/protocol'
import { useMatch } from '@/composables/match'
import MatchPanel from './MatchPanel.vue'

const props = defineProps<{
  active: boolean
  gameStarted: boolean
  mainMenuMode: 'home' | 'match'
  buttonStyle: StyleValue
  canStartOnlineGame: boolean
}>()

const emit = defineEmits<{
  close: []
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

const panelStyle = computed(() => props.buttonStyle)

watch(
  () => props.active,
  (active) => {
    if (active) {
      matchPanelMode.value = 'servers'
      void connectMatchServers()
      startMatchServerRefresh()
    }
    else {
      stopMatchServerRefresh()
      matchPanelMode.value = 'servers'
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  stopMatchServerRefresh()
})

function close() {
  stopMatchServerRefresh()
  matchPanelMode.value = 'servers'
  emit('close')
}

function closeSettingsPanel() {
  closeMatchRoomSettingsPanel()
}
</script>

<template>
  <MatchPanel
    v-if="active"
    v-model:manual-address="manualMatchServerAddress"
    v-model:nickname="matchNickname"
    v-model:room-name="matchRoomName"
    :room-settings="matchRoomSettings"
    :style="panelStyle"
    :mode="matchPanelMode"
    :servers="matchServers"
    :custom-room-server="customRoomServer"
    :expanded-server-ids="expandedMatchServerIds"
    :default-server-ids="DEFAULT_MATCH_SERVER_IDS"
    :button-style="panelStyle"
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
</template>
