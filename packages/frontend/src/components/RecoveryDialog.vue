<script setup lang="ts">
import { computed, ref, watch, type StyleValue } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  dismissSafeModeNotice,
  fatalRecoveryError,
  getRecoveryDiagnostics,
  resetAllLocalDataAndRestart,
  resetRecoverableUIStateAndRestart,
  restartInSafeMode,
  restartNormally,
  safeModeActive,
  safeModeNoticeOpen,
} from '@/composables/recovery'
import GameButton from './GameButton.vue'
import GameDialog from './GameDialog.vue'

const props = withDefaults(defineProps<{
  activeRenderer?: string | null
  buttonStyle?: StyleValue
  canExportRecord?: boolean
  canReturnToMainMenu?: boolean
}>(), {
  activeRenderer: null,
  buttonStyle: undefined,
  canExportRecord: false,
  canReturnToMainMenu: false,
})

const emit = defineEmits<{
  exportRecord: []
  returnToMainMenu: []
}>()

const { t } = useI18n({ useScope: 'global' })
const copyStatus = ref('')
const confirmResetAll = ref(false)

const fatal = computed(() => fatalRecoveryError.value)
const visible = computed(() => Boolean(fatal.value) || (
  safeModeActive.value && safeModeNoticeOpen.value
))
const title = computed(() => fatal.value
  ? t('recovery.crashTitle')
  : t('recovery.safeModeTitle'))

watch(visible, (next) => {
  if (! next) {
    copyStatus.value = ''
    confirmResetAll.value = false
  }
})

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(getRecoveryDiagnostics({
      renderer: props.activeRenderer,
    }))
    copyStatus.value = t('recovery.diagnosticsCopied')
  }
  catch {
    copyStatus.value = t('recovery.diagnosticsCopyFailed')
  }
}

function resetAll() {
  if (! confirmResetAll.value) {
    confirmResetAll.value = true
    return
  }
  resetAllLocalDataAndRestart()
}
</script>

<template>
  <GameDialog
    v-if="visible"
    card-class="dialog-card--recovery"
    :button-style="buttonStyle"
    :close-on-backdrop="false"
    :title="title"
  >
    <p class="recovery-message">
      {{ fatal ? t('recovery.crashMessage') : t('recovery.safeModeMessage') }}
    </p>
    <p
      v-if="fatal"
      class="recovery-error"
    >
      {{ fatal.message }}
    </p>
    <div class="recovery-primary-actions">
      <GameButton
        v-if="fatal"
        size="small"
        @click="restartInSafeMode"
      >
        <span>{{ t('recovery.restartSafely') }}</span>
      </GameButton>
      <GameButton
        v-if="fatal && canReturnToMainMenu"
        size="small"
        @click="emit('returnToMainMenu')"
      >
        <span>{{ t('button.returnToMainMenu') }}</span>
      </GameButton>
      <GameButton
        v-if="!fatal"
        size="small"
        @click="dismissSafeModeNotice"
      >
        <span>{{ t('button.continue') }}</span>
      </GameButton>
      <GameButton
        v-if="!fatal"
        size="small"
        @click="restartNormally"
      >
        <span>{{ t('recovery.restartNormally') }}</span>
      </GameButton>
    </div>
    <details class="recovery-details">
      <summary>{{ t('recovery.moreOptions') }}</summary>
      <div class="recovery-secondary-actions">
        <GameButton
          v-if="fatal && canExportRecord"
          size="small"
          @click="emit('exportRecord')"
        >
          <span>{{ t('recovery.exportRecord') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="copyDiagnostics"
        >
          <span>{{ t('recovery.copyDiagnostics') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="resetRecoverableUIStateAndRestart"
        >
          <span>{{ t('recovery.resetInterface') }}</span>
        </GameButton>
        <GameButton
          class="recovery-reset-all"
          size="small"
          @click="resetAll"
        >
          <span>
            {{ confirmResetAll ? t('recovery.confirmResetAll') : t('recovery.resetAll') }}
          </span>
        </GameButton>
      </div>
      <p
        class="recovery-copy-status"
        aria-live="polite"
      >
        {{ copyStatus }}
      </p>
    </details>
  </GameDialog>
</template>

<style scoped>
.recovery-message,
.recovery-error,
.recovery-copy-status {
  margin: 0;
  color: var(--button-text-color);
}

.recovery-error {
  max-width: min(640px, calc(100vw - var(--button-top) * 8));
  overflow-wrap: anywhere;
  font-family: monospace;
  font-size: var(--button-small-font-size);
  opacity: 0.82;
}

.recovery-primary-actions,
.recovery-secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--button-content-gap) * 2);
}

.recovery-details {
  width: 100%;
  color: var(--button-text-color);
}

.recovery-details summary {
  width: fit-content;
  cursor: pointer;
}

.recovery-secondary-actions {
  margin-top: calc(var(--button-content-gap) * 2);
}

.recovery-reset-all {
  --button-border-color: var(--button-danger-border-color);
  --button-fill-color: var(--button-danger-fill-color);
  --button-text-color: var(--button-danger-text-color);
  --button-hover-border-color: var(--button-danger-hover-border-color);
  --button-hover-fill-color: var(--button-danger-hover-fill-color);
  --button-hover-text-color: var(--button-danger-hover-text-color);
}

.recovery-copy-status {
  min-height: 1.2em;
  margin-top: var(--button-content-gap);
  font-size: var(--button-small-font-size);
}
</style>
