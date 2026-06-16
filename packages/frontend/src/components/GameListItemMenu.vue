<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameButton from './GameButton.vue'
import GameIcon from './GameIcon.vue'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  uiSound: []
  rename: []
  delete: []
}>()

const { t } = useI18n({ useScope: 'global' })

function toggle() {
  emit('uiSound')
  open.value = ! open.value
}

function clickRename() {
  open.value = false
  emit('rename')
}

function clickDelete() {
  open.value = false
  emit('delete')
}
</script>

<template>
  <div class="game-list-item-menu">
    <div
      v-if="open"
      class="game-list-item-menu__popup"
    >
      <GameButton
        size="small"
        @click="clickRename"
      >
        <span>{{ t('button.rename') }}</span>
      </GameButton>
      <GameButton
        size="small"
        @click="clickDelete"
      >
        <span>{{ t('button.delete') }}</span>
      </GameButton>
    </div>
    <GameButton
      size="small"
      shape="circle"
      :aria-label="t('button.menu')"
      :aria-expanded="open"
      @click="toggle"
    >
      <GameIcon :name="open ? 'chevron-right' : 'chevron-left'" />
    </GameButton>
  </div>
</template>

<style scoped>
.game-list-item-menu {
  display: inline-flex;
  align-items: center;
  gap: var(--button-content-gap);
}

.game-list-item-menu__popup {
  display: flex;
  gap: var(--button-content-gap);
}
</style>
