<script setup lang="ts">
import { type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatchRoomSettings } from '@5dcol/shared/protocol'
import GameToggle from './GameToggle.vue'

defineProps<{
  settings: MatchRoomSettings
  buttonStyle: StyleValue
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
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row settings-row--stacked">
        <span>{{ t('match.setting.creatorPlayer') }}</span>
        <div class="match-radio-group">
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="white"
            :style="buttonStyle"
          >
            <span>{{ t('match.setting.creatorWhite') }}</span>
          </GameToggle>
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="black"
            :style="buttonStyle"
          >
            <span>{{ t('match.setting.creatorBlack') }}</span>
          </GameToggle>
          <GameToggle
            v-model="settings.creatorPlayer"
            type="radio"
            value="random"
            :style="buttonStyle"
          >
            <span>{{ t('match.setting.creatorRandom') }}</span>
          </GameToggle>
        </div>
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.canReplay') }}</span>
        <GameToggle
          v-model="settings.canReplay"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.saveRecord') }}</span>
        <GameToggle
          v-model="settings.saveRecordToServer"
          :style="buttonStyle"
        />
      </div>
      <div class="settings-row">
        <span>{{ t('match.setting.liveMoves') }}</span>
        <GameToggle
          v-model="settings.showOpponentMoves"
          :style="buttonStyle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-settings-panel {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow: auto;
}

.match-settings-list {
  width: min(680px, 100%);
}

.match-radio-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}
</style>
