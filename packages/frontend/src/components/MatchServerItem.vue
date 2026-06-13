<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchRoom } from '@5dcol/shared/protocol'
import type { MatchServerState } from '@engine/matchClient'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import MatchRoomItem from './MatchRoomItem.vue'

const props = defineProps<{
  server: MatchServerState
  expanded: boolean
  manual: boolean
  buttonStyle: StyleValue
}>()

const emit = defineEmits<{
  toggle: [server: MatchServerState]
  createRoom: [server: MatchServerState]
  connect: [server: MatchServerState]
  remove: [server: MatchServerState]
  returnRoom: [server: MatchServerState, room: MatchRoom]
  joinRoom: [server: MatchServerState, roomId: string]
  viewRoom: [server: MatchServerState, room: MatchRoom]
}>()

const { t } = useI18n({ useScope: 'global' })

const sortedRooms = computed(() => [...props.server.rooms].sort((a, b) => (
  getRoomSortRank(a.status) - getRoomSortRank(b.status)
    || b.updatedAt - a.updatedAt
)))

function getStatusText(status: MatchServerState['status']) {
  switch (status) {
    case 'idle':
      return t('match.status.idle')
    case 'connecting':
      return t('match.status.connecting')
    case 'connected':
      return t('match.status.connected')
    case 'failed':
      return t('match.status.failed')
  }
}

function getRoomSortRank(status: MatchRoom['status']) {
  switch (status) {
    case 'waiting':
      return 0
    case 'playing':
      return 1
    case 'finished':
      return 2
  }
}

function getDisplayAddress(server: MatchServerState) {
  return server.address.replace(/^https?:\/\//, '')
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
  <section class="match-server">
    <div class="match-server-header">
      <GameButton
        size="small"
        shape="circle"
        :style="buttonStyle"
        :aria-label="expanded ? t('match.collapseServer') : t('match.expandServer')"
        :aria-expanded="expanded"
        @click="emit('toggle', server)"
      >
        <GameIcon :name="expanded ? 'chevron-down' : 'chevron-right'" />
      </GameButton>
      <div class="match-server-main">
        <div class="match-server-address">{{ getDisplayAddress(server) }}</div>
        <div class="match-server-meta">
          <span
            class="match-status"
            :class="`match-status--${server.status}`"
          >
            {{ getStatusText(server.status) }}
          </span>
          <span v-if="server.name">{{ server.name }}</span>
        </div>
      </div>
      <div class="match-server-actions">
        <GameButton
          v-if="server.status === 'connected'"
          size="small"
          :style="buttonStyle"
          @click="emit('createRoom', server)"
        >
          <span>{{ t('match.createRoom') }}</span>
        </GameButton>
        <GameButton
          v-if="server.status !== 'connected' && server.status !== 'connecting'"
          size="small"
          :style="buttonStyle"
          @click="emit('connect', server)"
        >
          <span>{{ t('match.connect') }}</span>
        </GameButton>
        <GameButton
          v-if="manual"
          size="small"
          :style="buttonStyle"
          @click="emit('remove', server)"
        >
          <span>{{ t('match.removeServer') }}</span>
        </GameButton>
      </div>
    </div>
    <div
      v-if="server.status === 'connected' && expanded"
      class="match-room-list"
    >
      <div
        v-if="server.rooms.length === 0"
        class="match-empty"
      >
        {{ t('match.noRooms') }}
      </div>
      <MatchRoomItem
        v-for="room in sortedRooms"
        :key="room.id"
        :server="server"
        :room="room"
        :button-style="buttonStyle"
        @return-room="forwardReturnRoom"
        @join-room="forwardJoinRoom"
        @view-room="forwardViewRoom"
      />
    </div>
    <div
      v-else-if="server.status === 'failed' && expanded"
      class="match-error"
    >
      {{ server.error || t('match.failedMessage') }}
    </div>
  </section>
</template>

<style scoped>
.match-server {
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  padding: var(--button-content-gap);
  border: var(--button-border) solid var(--button-border-color);
  border-radius: 8px;
  background: var(--button-fill-color);
}

.match-server-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.match-server-main {
  flex: 1 1 auto;
  min-width: 0;
}

.match-server-address {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-server-meta,
.match-error,
.match-empty {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.match-server-meta {
  display: flex;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
}

.match-server-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.match-status--connected {
  color: rgb(92, 135, 95);
}

.match-status--failed {
  color: rgb(184, 84, 61);
}

.match-room-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
}
</style>
