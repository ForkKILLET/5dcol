<script setup lang="ts">
import { ref } from 'vue'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

export type GameDockItem = {
  disabled?: boolean
  icon: 'chat' | 'clock' | 'members' | 'record'
  id: string
  label: string
  pressed?: boolean
}

defineProps<{
  collapseLabel: string
  items: GameDockItem[]
  label: string
}>()

const emit = defineEmits<{
  select: [id: string]
  toggleCollapsed: []
}>()

const collapsed = ref(false)

function toggleCollapsed() {
  collapsed.value = ! collapsed.value
  emit('toggleCollapsed')
}
</script>

<template>
  <nav
    v-if="items.length > 0"
    class="game-dock"
    :class="{ 'game-dock--collapsed': collapsed }"
    :aria-label="label"
  >
    <template v-if="!collapsed">
      <GameButton
        v-for="item in items"
        :key="item.id"
        size="icon"
        shape="circle"
        :aria-label="item.label"
        :title="item.label"
        :disabled="item.disabled"
        :pressed="item.pressed"
        @click="emit('select', item.id)"
      >
        <GameIcon :name="item.icon" />
      </GameButton>
    </template>
    <GameButton
      size="icon"
      shape="circle"
      :aria-label="collapsed ? label : collapseLabel"
      :title="collapsed ? label : collapseLabel"
      @click="toggleCollapsed"
    >
      <GameIcon :name="collapsed ? 'chevron-up' : 'chevron-down'" />
    </GameButton>
  </nav>
</template>

<style scoped>
.game-dock {
  position: absolute;
  left: 50%;
  bottom: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: calc(var(--button-content-gap) * 1.25);
  padding: calc(var(--button-content-gap) * 1.2)
    calc(var(--button-content-gap) * 1.8)
    calc(var(--button-content-gap) * 1.1);
  border: var(--button-border) solid var(--button-border-color);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  background: var(--button-fill-color);
  box-shadow: var(--button-shadow-offset) 0 0 var(--button-shadow-color);
  pointer-events: auto;
  transform: translateX(-50%);
  transition:
    padding 160ms ease,
    transform 160ms ease;
}

.game-dock--collapsed {
  padding-inline: calc(var(--button-content-gap) * 1.1);
}
</style>
