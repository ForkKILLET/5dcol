<script setup lang="ts">
import type { GamePanelGroup, GamePanelId } from '@/composables/panelLayout'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'
import GameTab from './GameTab.vue'

export type GameSidePanelTab = {
  icon: 'chat' | 'members' | 'record'
  id: GamePanelId
  label: string
}

defineProps<{
  addLabel: string
  closeLabel: string
  group: GamePanelGroup
  tabs: GameSidePanelTab[]
}>()

const emit = defineEmits<{
  addPanel: [groupId: string]
  closePanel: [panelId: GamePanelId]
  selectPanel: [groupId: string, panelId: GamePanelId]
}>()
</script>

<template>
  <section class="game-side-panel-group">
    <div class="game-side-panel-tabs">
      <GameTab
        v-for="tab in tabs"
        :key="tab.id"
        class="game-side-panel-tab"
        :pressed="group.activePanelId === tab.id"
        @click="emit('selectPanel', group.id, tab.id)"
      >
        <GameIcon :name="tab.icon" />
        <span>{{ tab.label }}</span>
      </GameTab>
      <div class="game-side-panel-tab-actions">
        <GameButton
          size="tiny"
          shape="circle"
          :aria-label="addLabel"
          :title="addLabel"
          @click="emit('addPanel', group.id)"
        >
          <GameIcon name="plus" />
        </GameButton>
        <GameButton
          size="tiny"
          shape="circle"
          :aria-label="closeLabel"
          :title="closeLabel"
          @click="emit('closePanel', group.activePanelId)"
        >
          <GameIcon name="x" />
        </GameButton>
      </div>
    </div>
    <div class="game-side-panel-group-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.game-side-panel-group {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  pointer-events: auto;
}

.game-side-panel-tabs {
  position: relative;
  z-index: var(--z-ui-handle);
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.75);
  min-width: 0;
  padding: 0 0 calc(var(--button-content-gap) * 0.6);
}

.game-side-panel-tab {
  min-width: 0;
}

.game-side-panel-tab :deep(.game-icon) {
  width: var(--button-small-icon-size);
  height: var(--button-small-icon-size);
}

.game-side-panel-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-side-panel-tab-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 0.5);
  margin-left: auto;
  padding-bottom: var(--button-tiny-border);
}

.game-side-panel-tab-actions :deep(.game-button) {
  width: var(--button-tiny-height);
  min-width: var(--button-tiny-height);
}

.game-side-panel-group-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.game-side-panel-group-content > :deep(*) {
  flex: 1 1 auto;
}
</style>
