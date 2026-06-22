<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MatchRoomSettings } from '@5dcol/shared/protocol'
import GameToggle from './GameToggle.vue'

defineProps<{
  settings: MatchRoomSettings
}>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="match-settings-panel">
    <div class="settings-list match-settings-list">
      <div class="settings-row">
        <span>{{ t('match.setting.private') }}</span>
        <GameToggle
          v-model="settings.private"
        />
      </div>
      <div class="settings-row settings-row--stacked">
        <span>{{ t('match.setting.creatorPlayer') }}</span>
        <div class="match-radio-group">
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="white"
          >
            <span>{{ t('match.setting.creatorWhite') }}</span>
          </GameToggle>
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="black"
          >
            <span>{{ t('match.setting.creatorBlack') }}</span>
          </GameToggle>
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="random"
          >
            <span>{{ t('match.setting.creatorRandom') }}</span>
          </GameToggle>
        </div>
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.canReplay') }}</span>
        <GameToggle
          v-model="settings.canReplay"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.saveRecord') }}</span>
        <GameToggle
          v-model="settings.saveRecordToServer"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.liveMoves') }}</span>
        <GameToggle
          v-model="settings.showOpponentMoves"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-settings-panel {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  overflow: auto;
}

.match-settings-list {
  width: 100%;
}

.match-radio-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}
</style>
