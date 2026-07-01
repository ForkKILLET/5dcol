<script setup lang="ts">
import type { Player } from '@5dcol/core'
import GamePanel from './GamePanel.vue'

export interface ClockPanelRow {
  active: boolean
  label: string
  player: Player
  step: string
  total: string
}

defineProps<{
  rows: ClockPanelRow[]
}>()
</script>

<template>
  <GamePanel
    class="clock-panel"
    shadow
  >
    <div
      v-for="row in rows"
      :key="row.player"
      class="clock-row"
      :class="{ 'clock-row--active': row.active }"
    >
      <span class="clock-player">{{ row.label }}</span>
      <span class="clock-time">{{ row.step }}</span>
      <span class="clock-separator">/</span>
      <span class="clock-time">{{ row.total }}</span>
    </div>
  </GamePanel>
</template>

<style scoped>
.clock-panel {
  justify-content: flex-start;
  min-height: 0;
  font-size: 20px;
  line-height: 1;
}

.clock-row {
  display: grid;
  grid-template-columns: minmax(64px, 1fr) 64px auto 64px;
  gap: calc(var(--button-content-gap) * 0.75);
  align-items: baseline;
  opacity: 0.72;
  white-space: nowrap;
}

.clock-row--active {
  opacity: 1;
}

.clock-player {
  transform: translateY(var(--ui-text-y));
}

.clock-time {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.clock-separator {
  opacity: 0.65;
}
</style>
