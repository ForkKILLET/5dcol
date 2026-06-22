<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MatchRoom, MatchRoomSettings } from '@5dcol/shared/protocol'
import type { MatchServerState } from '@engine/matchClient'
import MatchRoomSettingsPanel from './MatchRoomSettingsPanel.vue'
import MatchServerItem from './MatchServerItem.vue'
import OnlineRoomCreatePanel from './OnlineRoomCreatePanel.vue'

type MatchPanelMode = 'servers' | 'create-room'

const props = defineProps<{
  mode: MatchPanelMode
  servers: MatchServerState[]
  customRoomServer: MatchServerState | null
  expandedServerIds: ReadonlySet<string>
  roomSettings: MatchRoomSettings
  embedded?: boolean
  showTitle?: boolean
}>()

const emit = defineEmits<{
  createBack: []
  createRoom: []
  toggleServer: [server: MatchServerState]
  connectServer: [server: MatchServerState]
  openCustomRoom: [server: MatchServerState]
  returnRoom: [server: MatchServerState, room: MatchRoom]
  joinRoom: [server: MatchServerState, roomId: string]
  viewRoom: [server: MatchServerState, room: MatchRoom]
}>()

const roomName = defineModel<string>('roomName', { required: true })

const { t } = useI18n({ useScope: 'global' })

function isExpanded(server: MatchServerState) {
  return props.expandedServerIds.has(server.id)
}

function getTitle() {
  switch (props.mode) {
    case 'create-room':
      return t('match.createRoom')
    case 'servers':
      return t('match.title')
  }
}

function forwardReturnRoom(server: MatchServerState, room: MatchRoom) {
  emit('returnRoom', server, room)
}

function forwardJoinRoom(server: MatchServerState, roomId: string) {
  emit('joinRoom', server, roomId)
}

function forwardViewRoom(server: MatchServerState, room: MatchRoom) {
  emit('viewRoom', server, room)
}
</script>

<template>
  <div
    class="match-card"
    :class="{ 'is-embedded': embedded }"
  >
    <div
      v-if="showTitle !== false"
      class="match-card-header"
    >
      <h2
        class="dialog-title"
      >
        {{ getTitle() }}
      </h2>
    </div>
    <div
      v-if="mode === 'servers'"
      class="match-server-list"
    >
      <MatchServerItem
        v-for="server in servers"
        :key="server.id"
        :server="server"
        :expanded="isExpanded(server)"
        :manual="false"
        @toggle="emit('toggleServer', $event)"
        @create-room="emit('openCustomRoom', $event)"
        @connect="emit('connectServer', $event)"
        @return-room="forwardReturnRoom"
        @join-room="forwardJoinRoom"
        @view-room="forwardViewRoom"
      />
    </div>
    <OnlineRoomCreatePanel
      v-else-if="mode === 'create-room' && customRoomServer"
      v-model:name="roomName"
      :title="t('match.createRoom')"
      :server-name="customRoomServer.name"
      :server-address="customRoomServer.address"
      :name-label="t('match.roomName')"
      :name-placeholder="t('match.roomNamePlaceholder')"
      :create-label="t('match.create')"
      @back="emit('createBack')"
      @create="emit('createRoom')"
    >
      <template #settings>
        <MatchRoomSettingsPanel :settings="roomSettings" />
      </template>
    </OnlineRoomCreatePanel>
  </div>
</template>

<style scoped>
.match-card {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  width: min(760px, calc(100vw - var(--button-top) * 2));
  height: min(620px, calc(100vh - var(--button-top) * 2));
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.match-card.is-embedded {
  position: static;
  left: auto;
  top: auto;
  width: auto;
  height: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.match-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.match-server-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  padding-right: calc(var(--button-content-gap) * 0.5);
  overflow: auto;
}

.match-card-actions {
  flex: 1 1 auto;
  min-width: 0;
}

</style>
