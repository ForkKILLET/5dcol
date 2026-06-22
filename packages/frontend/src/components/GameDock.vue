<script setup lang="ts">
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
  items: GameDockItem[]
  label: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <nav
    v-if="items.length > 0"
    class="game-dock"
    :aria-label="label"
  >
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
  </nav>
</template>

<style scoped>
.game-dock {
  position: absolute;
  right: var(--button-top);
  top: 50%;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 1.4);
  pointer-events: auto;
  transform: translateY(-50%);
}
</style>
