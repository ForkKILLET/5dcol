<script setup lang="ts">
import type { GamePanelId, GamePanelSide } from '@/composables/panelLayout'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GamePanel from './GamePanel.vue'

export type GamePanelPickerItem = {
  icon: 'chat' | 'members' | 'record'
  id: GamePanelId
  label: string
}

defineProps<{
  addHereLabel?: string
  addLeftLabel: string
  addRightLabel: string
  closeLabel: string
  emptyText: string
  groupId?: string
  items: GamePanelPickerItem[]
  title: string
}>()

const emit = defineEmits<{
  addToGroup: [panelId: GamePanelId, groupId: string]
  addToSide: [panelId: GamePanelId, side: GamePanelSide]
  close: []
}>()
</script>

<template>
  <GamePanel class="game-panel-picker" shadow>
    <div class="game-panel-picker-title-row">
      <h2 class="game-panel-picker-title">{{ title }}</h2>
      <GameButton
        size="tiny"
        shape="circle"
        :aria-label="closeLabel"
        :title="closeLabel"
        @click="emit('close')"
      >
        <GameIcon name="x" />
      </GameButton>
    </div>
    <div
      v-if="items.length === 0"
      class="game-panel-picker-empty"
    >
      {{ emptyText }}
    </div>
    <div
      v-else
      class="game-panel-picker-list"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="game-panel-picker-item"
      >
        <div class="game-panel-picker-item-label">
          <GameIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </div>
        <div class="game-panel-picker-actions">
          <GameButton
            v-if="groupId && addHereLabel"
            size="tiny"
            @click="emit('addToGroup', item.id, groupId)"
          >
            {{ addHereLabel }}
          </GameButton>
          <GameButton
            size="tiny"
            @click="emit('addToSide', item.id, 'left')"
          >
            {{ addLeftLabel }}
          </GameButton>
          <GameButton
            size="tiny"
            @click="emit('addToSide', item.id, 'right')"
          >
            {{ addRightLabel }}
          </GameButton>
        </div>
      </div>
    </div>
  </GamePanel>
</template>

<style scoped>
.game-panel-picker {
  position: absolute;
  left: 50%;
  bottom: calc(var(--button-top) + var(--button-small-height) + var(--button-shadow-offset) * 2);
  z-index: var(--z-ui-floating);
  width: min(620px, calc(100vw - var(--button-top) * 2));
  max-height: min(520px, calc(var(--app-height) - var(--button-top) * 4));
  overflow: auto;
  pointer-events: auto;
  transform: translateX(-50%);
}

.game-panel-picker-title-row {
  display: flex;
  align-items: center;
  gap: var(--button-content-gap);
}

.game-panel-picker-title {
  flex: 1 1 auto;
  margin: 0;
  font-size: 28px;
  font-weight: 400;
  line-height: 1;
}

.game-panel-picker-empty {
  color: var(--button-text-color);
  font-size: 22px;
  opacity: 0.72;
}

.game-panel-picker-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.8);
}

.game-panel-picker-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--button-content-gap);
}

.game-panel-picker-item-label {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
  font-size: 22px;
}

.game-panel-picker-item-label :deep(.game-icon) {
  width: var(--button-small-icon-size);
  height: var(--button-small-icon-size);
}

.game-panel-picker-item-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-panel-picker-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.75);
}
</style>
