<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchServerStats } from '@5dcol/shared/protocol'
import { MatchClient, type MatchServerConnectionStatus } from '@engine/matchClient'
import {
  getOnlineServerEntries,
  setCachedOnlineServerInfo,
  useOnlineServers,
  type OnlineServerEntry,
} from '@/composables/online'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GameTextInput from './GameTextInput.vue'
import OnlineServerItem from './OnlineServerItem.vue'

interface SettingsServerState {
  id: string
  address: string
  builtIn: boolean
  status: MatchServerConnectionStatus
  name: string
  version: string
  commitHash: string
  buildDate: string
  pingMs: number | null
  stats: MatchServerStats | null
  error: string
}

const emit = defineEmits<{
  uiSound: []
}>()

const { t } = useI18n({ useScope: 'global' })
const {
  addOnlineCustomServer,
  moveOnlineServer,
  removeOnlineCustomServer,
} = useOnlineServers()
const serverAddress = ref('')
const serverEntries = computed(() => getOnlineServerEntries())
const serverStates = reactive<SettingsServerState[]>([])

watch(serverEntries, () => {
  syncServerStates()
  void loadServerStates()
}, { deep: true, immediate: true })

function addServer() {
  const added = addOnlineCustomServer(serverAddress.value)
  if (! added) return
  emit('uiSound')
  serverAddress.value = ''
}

function removeServer(address: string) {
  emit('uiSound')
  removeOnlineCustomServer(address)
}

function moveServer(address: string, direction: -1 | 1) {
  if (! moveOnlineServer(address, direction)) return
  emit('uiSound')
}

async function loadServerStates() {
  await Promise.all(serverStates
    .filter(server => server.status === 'idle')
    .map(server => connectSettingsServer(server)))
}

async function connectSettingsServer(server: SettingsServerState) {
  if (server.status === 'connecting') return

  server.status = 'connecting'
  server.error = ''
  try {
    const client = new MatchClient(server.address)
    const [{ info, pingMs }, stats] = await Promise.all([
      client.getInfoWithPing(),
      getOptionalServerStats(client),
    ])
    server.name = info.name
    server.version = info.version
    server.commitHash = info.commitHash
    server.buildDate = info.buildDate
    server.pingMs = pingMs
    server.stats = stats
    server.status = 'connected'
    setCachedOnlineServerInfo(server.address, info)
  }
  catch (err) {
    server.pingMs = null
    server.stats = null
    server.status = 'failed'
    server.error = err instanceof Error ? err.message : String(err)
  }
}

async function getOptionalServerStats(client: MatchClient) {
  try {
    return await client.getStats()
  }
  catch {
    return null
  }
}

function createServerState(entry: OnlineServerEntry): SettingsServerState {
  return {
    id: entry.address,
    address: entry.address,
    builtIn: entry.builtIn,
    status: 'idle',
    name: entry.name,
    version: entry.version,
    commitHash: entry.commitHash,
    buildDate: entry.buildDate,
    pingMs: null,
    stats: null,
    error: '',
  }
}

function syncServerStates() {
  const entries = serverEntries.value
  const entryAddressSet = new Set(entries.map(entry => entry.address))
  for (const server of serverStates) {
    if (entryAddressSet.has(server.address)) continue
    server.status = 'idle'
  }

  const nextServers = entries.map((entry) => {
    const server = serverStates.find(item => item.address === entry.address)
    if (! server) return createServerState(entry)
    server.builtIn = entry.builtIn
    if (server.status === 'idle' || ! server.name) {
      server.name = entry.name
      server.version = entry.version
      server.commitHash = entry.commitHash
      server.buildDate = entry.buildDate
    }
    return server
  })
  serverStates.splice(0, serverStates.length, ...nextServers)
}

function getServerDynamicMeta(server: SettingsServerState) {
  return [
    server.pingMs === null ? '' : t('match.ping', { ms: String(server.pingMs) }),
    server.stats ? t('match.connections', { count: String(server.stats.connectionCount) }) : '',
  ].filter(Boolean)
}
</script>

<template>
  <div class="online-server-settings-panel">
    <div class="online-server-settings-panel__add-row">
      <GameTextInput
        v-model="serverAddress"
        :placeholder="t('match.serverAddressPlaceholder')"
        spellcheck="false"
        @keydown.enter.prevent="addServer"
      />
      <GameButton
        size="small"
        :disabled="serverAddress.trim().length === 0"
        @click="addServer"
      >
        <span>{{ t('match.addServer') }}</span>
      </GameButton>
    </div>
    <div class="online-server-settings-panel__list">
      <OnlineServerItem
        v-for="(server, index) in serverStates"
        :key="server.address"
        :server="server"
        :collapsible="false"
        :dynamic-meta="getServerDynamicMeta(server)"
        :panel="false"
      >
        <template #actions>
          <GameButton
            v-if="! server.builtIn"
            size="small"
            class="online-server-settings-panel__delete"
            @click="removeServer(server.address)"
          >
            <span>{{ t('match.removeServer') }}</span>
          </GameButton>
          <span
            v-else
            class="online-server-settings-panel__delete-placeholder"
            aria-hidden="true"
          ></span>
          <GameButton
            size="small"
            shape="circle"
            :aria-label="t('match.moveServerUp')"
            :disabled="index === 0"
            @click="moveServer(server.address, -1)"
          >
            <GameIcon name="chevron-up" />
          </GameButton>
          <GameButton
            size="small"
            shape="circle"
            :aria-label="t('match.moveServerDown')"
            :disabled="index === serverStates.length - 1"
            @click="moveServer(server.address, 1)"
          >
            <GameIcon name="chevron-down" />
          </GameButton>
        </template>
      </OnlineServerItem>
    </div>
  </div>
</template>

<style scoped>
.online-server-settings-panel {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.online-server-settings-panel__add-row {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
}

.online-server-settings-panel__add-row :deep(.game-text-input) {
  flex: 1 1 auto;
  min-width: 0;
}

.online-server-settings-panel__list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.5);
  min-height: 0;
  overflow: auto;
}

.online-server-settings-panel__list :deep(.game-icon) {
  width: calc(var(--button-small-icon-size) * 0.82);
  height: calc(var(--button-small-icon-size) * 0.82);
}

.online-server-settings-panel__delete,
.online-server-settings-panel__delete-placeholder {
  width: 96px;
  min-width: 96px;
}
</style>
