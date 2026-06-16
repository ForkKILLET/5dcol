<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchRoom } from '@5dcol/shared/protocol'
import type { MatchServerState } from '@engine/matchClient'
import MatchRoomItem from './MatchRoomItem.vue'
import OnlineServerItem from './OnlineServerItem.vue'

const props = defineProps<{
  server: MatchServerState
  expanded: boolean
  manual: boolean
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

function getServerPingText(server: MatchServerState) {
  return server.pingMs === null ? '' : t('match.ping', { ms: server.pingMs })
}

function getServerStatsText(server: MatchServerState) {
  const stats = server.stats
  if (! stats) return ''
  return t('match.serverStats', {
    rooms: stats.roomCount,
    playing: stats.playingRoomCount,
    finished: stats.finishedRoomCount,
  })
}

function getServerConnectionText(server: MatchServerState) {
  const stats = server.stats
  if (! stats) return ''
  return t('match.connections', { count: stats.connectionCount })
}

const dynamicMeta = computed(() => [
  getServerPingText(props.server),
  getServerStatsText(props.server),
  getServerConnectionText(props.server),
].filter(Boolean))

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
  <OnlineServerItem
    :server="server"
    :expanded="expanded"
    :manual="manual"
    :dynamic-meta="dynamicMeta"
    @toggle="emit('toggle', $event)"
    @create-room="emit('createRoom', $event)"
    @connect="emit('connect', $event)"
    @remove="emit('remove', $event)"
  >
    <template #rooms>
      <div class="match-room-list">
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
          @return-room="forwardReturnRoom"
          @join-room="forwardJoinRoom"
          @view-room="forwardViewRoom"
        />
      </div>
    </template>
  </OnlineServerItem>
</template>

<style scoped>
.match-empty {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.match-room-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
}
</style>
