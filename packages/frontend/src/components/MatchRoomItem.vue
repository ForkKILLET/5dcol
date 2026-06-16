<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchRoom, MatchRoomStatus } from '@5dcol/shared/protocol'
import type { MatchServerState } from '@engine/matchClient'
import GameButton from './GameButton.vue'

const props = defineProps<{
  server: MatchServerState
  room: MatchRoom
}>()

const emit = defineEmits<{
  returnRoom: [server: MatchServerState, room: MatchRoom]
  joinRoom: [server: MatchServerState, roomId: string]
  viewRoom: [server: MatchServerState, room: MatchRoom]
}>()

const { t } = useI18n({ useScope: 'global' })

const canView = computed(() => {
  if (! props.room.settings.canReplay) return false
  if (props.room.status === 'playing') return true
  return props.room.status === 'finished'
    && props.room.settings.saveRecordToServer
    && props.room.actionCount > 0
})

const viewLabel = computed(() => (
  props.room.status === 'finished'
    ? t('match.replay')
    : t('match.spectate')
))

const statusSuffix = computed(() => t('match.roomStatusSuffix', {
  date: getRoomDate(props.room),
  actions: String(props.room.actionCount),
  status: getRoomStatusText(props.room.status),
}))

const settingsMeta = computed(() => t('match.roomSettingsMeta', {
  settings: getRoomSettingsLabel(props.room),
}))

function getRoomStatusText(status: MatchRoomStatus) {
  switch (status) {
    case 'waiting':
      return t('match.roomStatus.waiting')
    case 'playing':
      return t('match.roomStatus.playing')
    case 'finished':
      return t('match.roomStatus.finished')
  }
}

function getRoomSettingsLabel(room: MatchRoom) {
  const enabled = [
    room.private ? t('match.setting.private') : '',
    room.settings.showOpponentMoves ? t('match.setting.liveMoves') : '',
    room.settings.canReplay ? t('match.setting.replay') : '',
  ].filter(Boolean)

  return enabled.length > 0 ? enabled.join(', ') : t('match.setting.default')
}

function getRoomDate(room: MatchRoom) {
  return new Date(room.startedAt ?? room.createdAt).toLocaleDateString()
}

function getSeatLabel(seat: MatchRoom['seats'][number]) {
  return seat?.nickname || t('match.anonymous')
}
</script>

<template>
  <div class="match-room">
    <div class="match-room-main">
      <div class="match-room-name">
        {{ room.name }}
        <span
          v-if="room.private"
          class="match-room-private"
        >
          {{ t('match.privateRoom') }}
        </span>
      </div>
      <div class="match-room-meta-stack">
        <div class="match-room-meta">
          <span
            class="match-room-player"
            :class="{ 'match-room-player--online': room.seats[0]?.online }"
          >{{ getSeatLabel(room.seats[0]) }}</span>
          <span>{{ t('match.playersVersusSeparator') }}</span>
          <span
            class="match-room-player"
            :class="{ 'match-room-player--online': room.seats[1]?.online }"
          >{{ room.seats[1] ? getSeatLabel(room.seats[1]) : '?' }}</span>
          <span>{{ statusSuffix }}</span>
        </div>
        <div class="match-room-meta">{{ settingsMeta }}</div>
      </div>
    </div>
    <div class="match-room-side">
      <GameButton
        v-if="room.ownSession && room.status !== 'finished'"
        size="small"
        badge="!"
        @click="emit('returnRoom', server, room)"
      >
        <span>{{ t('match.returnToGame') }}</span>
      </GameButton>
      <GameButton
        v-else-if="room.status === 'waiting'"
        size="small"
        @click="emit('joinRoom', server, room.id)"
      >
        <span>{{ t('match.join') }}</span>
      </GameButton>
      <GameButton
        v-else-if="canView"
        size="small"
        @click="emit('viewRoom', server, room)"
      >
        <span>{{ viewLabel }}</span>
      </GameButton>
    </div>
  </div>
</template>

<style scoped>
.match-room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
  padding: calc(var(--button-content-gap) * 0.75) 0 0;
}

.match-room:not(:first-child) {
  border-top: 1px solid color-mix(in srgb, var(--button-border-color) 55%, transparent);
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

.match-room-private {
  margin-left: calc(var(--button-content-gap) * 0.75);
  font-size: 12px;
  opacity: 0.72;
}

.match-room-meta-stack {
  min-width: 0;
  text-align: left;
}

.match-room-meta {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-room-player--online {
  color: rgb(92 135 95);
  opacity: 1;
}

.match-room-side {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
