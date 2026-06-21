<script setup lang="ts" generic="TServer extends OnlineServerItemServer">
import { useI18n } from 'vue-i18n'
import type { MatchServerConnectionStatus } from '@engine/matchClient'
import type { MatchServerStats } from '@5dcol/shared/protocol'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GamePanel from './GamePanel.vue'

export interface OnlineServerItemServer {
  id: string
  address: string
  status: MatchServerConnectionStatus
  name: string
  version: string
  commitHash: string
  buildDate: string
  pingMs: number | null
  stats: MatchServerStats | null
  error: string
}

const props = defineProps<{
  server: TServer
  expanded: boolean
  manual: boolean
  dynamicMeta: string[]
  createLabel?: string
}>()

const emit = defineEmits<{
  toggle: [server: TServer]
  createRoom: [server: TServer]
  connect: [server: TServer]
  remove: [server: TServer]
}>()

const { t } = useI18n({ useScope: 'global' })

function getStatusText(status: MatchServerConnectionStatus) {
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

function getDisplayAddress(server: OnlineServerItemServer) {
  return server.address.replace(/^https?:\/\//, '')
}

function hasServerStaticMeta(server: OnlineServerItemServer) {
  return Boolean(server.name || server.version || server.commitHash || server.buildDate)
}

function formatBuildDate(buildDate: string) {
  const date = new Date(buildDate)
  if (Number.isNaN(date.getTime())) return buildDate
  return date.toLocaleDateString()
}
</script>

<template>
  <GamePanel tag="section">
    <div class="online-server-item__header">
      <GameButton
        size="small"
        shape="circle"
        :aria-label="expanded ? t('match.collapseServer') : t('match.expandServer')"
        :aria-expanded="expanded"
        @click="emit('toggle', server)"
      >
        <GameIcon :name="expanded ? 'chevron-down' : 'chevron-right'" />
      </GameButton>
      <div class="online-server-item__main">
        <div class="online-server-item__address">{{ getDisplayAddress(server) }}</div>
        <div class="online-server-item__meta">
          <div class="online-server-item__meta-line">
            <span
              class="online-server-item__status"
              :class="`online-server-item__status--${server.status}`"
            >
              {{ getStatusText(server.status) }}
            </span>
            <span
              v-for="item in dynamicMeta"
              :key="item"
            >{{ item }}</span>
          </div>
          <div
            v-if="hasServerStaticMeta(server)"
            class="online-server-item__meta-line"
          >
            <span v-if="server.name">{{ server.name }}</span>
            <span v-if="server.version">v{{ server.version }}</span>
            <span v-if="server.commitHash">{{ server.commitHash }}</span>
            <span v-if="server.buildDate">{{ formatBuildDate(server.buildDate) }}</span>
          </div>
        </div>
      </div>
      <div class="online-server-item__actions">
        <GameButton
          v-if="server.status === 'connected'"
          size="small"
          @click="emit('createRoom', server)"
        >
          <span>{{ createLabel ?? t('match.createRoom') }}</span>
        </GameButton>
        <GameButton
          v-if="server.status !== 'connected' && server.status !== 'connecting'"
          size="small"
          @click="emit('connect', server)"
        >
          <span>{{ t('match.connect') }}</span>
        </GameButton>
        <GameButton
          v-if="manual"
          size="small"
          @click="emit('remove', server)"
        >
          <span>{{ t('match.removeServer') }}</span>
        </GameButton>
      </div>
    </div>
    <slot
      v-if="server.status === 'connected' && expanded"
      name="rooms"
    />
    <div
      v-else-if="server.status === 'failed' && expanded"
      class="online-server-item__error"
    >
      {{ server.error || t('match.failedMessage') }}
    </div>
  </GamePanel>
</template>

<style scoped>
.online-server-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.online-server-item__main {
  flex: 1 1 auto;
  min-width: 0;
}

.online-server-item__address {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-server-item__meta,
.online-server-item__error {
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
}

.online-server-item__meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.online-server-item__meta-line {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
}

.online-server-item__meta-line > span {
  white-space: nowrap;
}

.online-server-item__meta-line > span + span::before {
  content: "-";
  margin: 0 calc(var(--button-content-gap) * 0.75);
}

.online-server-item__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.online-server-item__status--connected {
  color: rgb(92, 135, 95);
}

.online-server-item__status--connecting {
  color: rgb(200, 182, 61);
}

.online-server-item__status--failed {
  color: rgb(184, 84, 61);
}

.online-server-item__error {
  color: rgb(184, 84, 61);
}
</style>
