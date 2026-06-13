<script setup lang="ts">
import { type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchRoom, MatchRoomSettings } from '@5dcol/shared/protocol'
import type { MatchServerState } from '@engine/matchClient'
import GameButton from './GameButton.vue'
import GameTextInput from './GameTextInput.vue'
import MatchRoomSettingsPanel from './MatchRoomSettingsPanel.vue'
import MatchServerItem from './MatchServerItem.vue'

type MatchPanelMode = 'servers' | 'room-settings'

const props = defineProps<{
  mode: MatchPanelMode
  servers: MatchServerState[]
  customRoomServer: MatchServerState | null
  expandedServerIds: ReadonlySet<string>
  defaultServerIds: ReadonlySet<string>
  roomSettings: MatchRoomSettings
  buttonStyle: StyleValue
}>()

const emit = defineEmits<{
  refresh: []
  back: []
  settingsBack: []
  addServer: []
  openRoomSettings: []
  createRoom: []
  toggleServer: [server: MatchServerState]
  connectServer: [server: MatchServerState]
  removeServer: [server: MatchServerState]
  openCustomRoom: [server: MatchServerState]
  returnRoom: [server: MatchServerState, room: MatchRoom]
  joinRoom: [server: MatchServerState, roomId: string]
  viewRoom: [server: MatchServerState, room: MatchRoom]
}>()

const manualAddress = defineModel<string>('manualAddress', { required: true })
const nickname = defineModel<string>('nickname', { required: true })
const roomName = defineModel<string>('roomName', { required: true })

const { t } = useI18n({ useScope: 'global' })

function getDisplayAddress(server: MatchServerState) {
  return server.address.replace(/^https?:\/\//, '')
}

function isManualServer(server: MatchServerState) {
  return ! props.defaultServerIds.has(server.id)
}

function isExpanded(server: MatchServerState) {
  return props.expandedServerIds.has(server.id)
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
  <div class="match-card">
    <div class="match-card-header">
      <h2 class="dialog-title">
        {{ mode === 'room-settings' ? t('dialog.matchRoomSettingsTitle') : t('match.title') }}
      </h2>
      <div
        v-if="mode === 'servers'"
        class="match-card-actions"
      >
        <div class="match-control-slot match-control-slot--input match-nickname-slot">
          <GameTextInput
            v-model="nickname"
            :placeholder="t('match.nicknamePlaceholder')"
            spellcheck="false"
          />
        </div>
        <GameButton
          size="small"
          :style="buttonStyle"
          @click="emit('refresh')"
        >
          <span>{{ t('match.refresh') }}</span>
        </GameButton>
        <GameButton
          size="small"
          :style="buttonStyle"
          @click="emit('back')"
        >
          <span>{{ t('button.back') }}</span>
        </GameButton>
      </div>
      <div
        v-else
        class="match-card-actions"
      >
        <GameButton
          size="small"
          :style="buttonStyle"
          @click="emit('settingsBack')"
        >
          <span>{{ t('button.back') }}</span>
        </GameButton>
      </div>
    </div>
    <div
      v-if="mode === 'servers'"
      class="match-server-list"
    >
      <section class="match-server match-server--manual">
        <div class="match-manual-row">
          <div class="match-control-slot match-control-slot--input">
            <GameTextInput
              v-model="manualAddress"
              :placeholder="t('match.serverAddressPlaceholder')"
              spellcheck="false"
              @keydown.enter.prevent="emit('addServer')"
            />
          </div>
          <GameButton
            size="small"
            :style="buttonStyle"
            :disabled="manualAddress.trim().length === 0"
            @click="emit('addServer')"
          >
            <span>{{ t('match.addServer') }}</span>
          </GameButton>
        </div>
      </section>
      <section
        v-if="customRoomServer"
        class="match-server match-server--custom-room"
      >
        <div class="match-room">
          <div class="match-room-main">
            <div class="match-room-name">
              {{ t('match.customRoom') }}
            </div>
            <div class="match-room-meta">
              {{ getDisplayAddress(customRoomServer) }}
            </div>
          </div>
          <div class="match-room-fields">
            <div class="match-control-slot match-control-slot--input">
              <GameTextInput
                v-model="roomName"
                :placeholder="t('match.roomNamePlaceholder')"
                spellcheck="false"
                @keydown.enter.prevent="emit('createRoom')"
              />
            </div>
            <GameButton
              size="small"
              :style="buttonStyle"
              @click="emit('openRoomSettings')"
            >
              <span>{{ t('main.settings') }}</span>
            </GameButton>
            <GameButton
              size="small"
              :style="buttonStyle"
              @click="emit('createRoom')"
            >
              <span>{{ t('match.create') }}</span>
            </GameButton>
          </div>
        </div>
      </section>
      <MatchServerItem
        v-for="server in servers"
        :key="server.id"
        :server="server"
        :expanded="isExpanded(server)"
        :manual="isManualServer(server)"
        :button-style="buttonStyle"
        @toggle="emit('toggleServer', $event)"
        @create-room="emit('openCustomRoom', $event)"
        @connect="emit('connectServer', $event)"
        @remove="emit('removeServer', $event)"
        @return-room="forwardReturnRoom"
        @join-room="forwardJoinRoom"
        @view-room="forwardViewRoom"
      />
    </div>
    <MatchRoomSettingsPanel
      v-else
      :settings="roomSettings"
      :button-style="buttonStyle"
    />
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

.match-card-header,
.match-room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.match-card-actions {
  flex: 1 1 auto;
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
  justify-content: flex-end;
  min-width: 0;
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

.match-server {
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  padding: var(--button-content-gap);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
}

.match-manual-row {
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
}

.match-control-slot {
  height: calc(32px + var(--small-button-shadow-offset));
}

.match-control-slot--input {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  min-width: 0;
}

.match-nickname-slot {
  flex: 0 1 190px;
}

.match-room-main {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(max-content, 100px) minmax(0, 1fr);
  column-gap: calc(var(--button-content-gap) * 0.75);
  align-items: center;
  min-width: 0;
}

.match-room-name {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-room-meta {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-room-fields {
  display: flex;
  align-items: baseline;
  gap: var(--button-content-gap);
}

.match-server--custom-room .match-room {
  padding-top: 0;
}

.match-server--custom-room .match-room-fields {
  flex: 0 1 440px;
  min-width: 0;
}
</style>
