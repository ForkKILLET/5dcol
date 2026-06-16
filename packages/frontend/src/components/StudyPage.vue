<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StudyDocument } from '@5dcol/shared/protocol'
import { useLocalStudies } from '@/composables/study'
import GameButton from './GameButton.vue'
import GameListItem from './GameListItem.vue'
import GameListItemMenu from './GameListItemMenu.vue'
import GamePanel from './GamePanel.vue'
import GameTab from './GameTab.vue'
import GameTextInput from './GameTextInput.vue'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  close: []
  openStudy: [study: StudyDocument, source?: { kind: 'local' }]
  importRecord: []
  uiSound: []
}>()

const { t } = useI18n({ useScope: 'global' })
const {
  createStudy,
  deleteStudy,
  getStudy,
  renameStudy,
  summaries,
} = useLocalStudies()

const sortedSummaries = computed(() => summaries.value)
const activeTab = ref<'local'>('local')
const editingStudyId = ref<string | null>(null)
const editingStudyTitle = ref('')
const openStudyActionMenuId = ref<string | null>(null)

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      activeTab.value = 'local'
    }
    else {
      cancelRenameStudy()
      openStudyActionMenuId.value = null
    }
  },
)

function createAndOpenStudy() {
  emit('uiSound')
  openStudyActionMenuId.value = null
  const study = createStudy({
    title: t('study.untitled'),
  })
  emit('openStudy', study, { kind: 'local' })
}

function openStudy(id: string) {
  if (editingStudyId.value) return
  const study = getStudy(id)
  if (! study) return
  emit('uiSound')
  openStudyActionMenuId.value = null
  emit('openStudy', study, { kind: 'local' })
}

function removeStudy(id: string) {
  emit('uiSound')
  if (editingStudyId.value === id) cancelRenameStudy()
  openStudyActionMenuId.value = null
  deleteStudy(id)
}

function openImportDialog() {
  cancelRenameStudy()
  openStudyActionMenuId.value = null
  emit('importRecord')
}

function beginRenameStudy(id: string, title: string) {
  emit('uiSound')
  openStudyActionMenuId.value = null
  editingStudyId.value = id
  editingStudyTitle.value = title
}

function saveRenameStudy() {
  const id = editingStudyId.value
  if (! id) return

  emit('uiSound')
  renameStudy(id, editingStudyTitle.value)
  cancelRenameStudy()
}

function cancelRenameStudy() {
  editingStudyId.value = null
  editingStudyTitle.value = ''
}

function clickCancelRenameStudy() {
  emit('uiSound')
  cancelRenameStudy()
}

function close() {
  emit('uiSound')
  openStudyActionMenuId.value = null
  emit('close')
}

function isStudyActionMenuOpen(id: string) {
  return openStudyActionMenuId.value === id
}

function setStudyActionMenuOpen(id: string, open: boolean) {
  openStudyActionMenuId.value = open ? id : null
}
</script>

<template>
  <div
    v-if="active"
    class="study-page"
  >
    <div
      class="study-tabs"
      role="tablist"
      :aria-label="t('study.tabsLabel')"
    >
      <GameTab :pressed="activeTab === 'local'">
        <span>{{ t('study.local') }}</span>
      </GameTab>
    </div>

    <div class="study-card">
      <div class="study-card-header">
        <h2 class="dialog-title">
          {{ t('study.localTitle') }}
        </h2>
        <div class="study-card-actions">
          <GameButton
            size="small"
            @click="close"
          >
            <span>{{ t('button.back') }}</span>
          </GameButton>
        </div>
      </div>

      <div class="study-local-toolbar">
        <GameButton
          size="small"
          @click="createAndOpenStudy"
        >
          <span>{{ t('study.create') }}</span>
        </GameButton>
        <GameButton
          size="small"
          @click="openImportDialog"
        >
          <span>{{ t('button.import') }}</span>
        </GameButton>
      </div>

      <div class="study-list">
        <GamePanel
          v-if="sortedSummaries.length === 0"
          tag="section"
          class="study-empty"
        >
          {{ t('study.empty') }}
        </GamePanel>
        <GamePanel
          v-for="study in sortedSummaries"
          :key="study.id"
          tag="section"
          class="study-item-panel"
        >
          <GameListItem>
            <template #title>
              <span v-if="editingStudyId !== study.id">{{ study.title }}</span>
              <GameTextInput
                v-else
                v-model="editingStudyTitle"
                :placeholder="t('study.namePlaceholder')"
                spellcheck="false"
                @keydown.enter.prevent="saveRenameStudy"
                @keydown.esc.prevent="cancelRenameStudy"
              />
            </template>
            <template #meta>
              <span>
                {{ t('study.meta', {
                  actions: study.actionCount,
                  annotations: study.annotationCount,
                  date: new Date(study.updatedAt).toLocaleDateString(),
                }) }}
              </span>
            </template>
            <template #actions>
              <template v-if="editingStudyId === study.id">
                <GameButton
                  size="small"
                  @click="saveRenameStudy"
                >
                  <span>{{ t('button.save') }}</span>
                </GameButton>
                <GameButton
                  size="small"
                  @click="clickCancelRenameStudy"
                >
                  <span>{{ t('button.cancel') }}</span>
                </GameButton>
              </template>
              <template v-else>
                <GameListItemMenu
                  :open="isStudyActionMenuOpen(study.id)"
                  @update:open="setStudyActionMenuOpen(study.id, $event)"
                  @ui-sound="emit('uiSound')"
                  @rename="beginRenameStudy(study.id, study.title)"
                  @delete="removeStudy(study.id)"
                />
                <GameButton
                  size="small"
                  @click="openStudy(study.id)"
                >
                  <span>{{ t('button.open') }}</span>
                </GameButton>
              </template>
            </template>
          </GameListItem>
        </GamePanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.study-page {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  width: min(760px, calc(100vw - var(--button-top) * 2));
  height: min(620px, calc(100vh - var(--button-top) * 2));
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.study-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 3);
  min-height: 0;
  padding: calc(var(--button-content-gap) * 5);
  border: var(--button-border) solid var(--menu-card-border-color);
  border-radius: 8px;
  background: var(--menu-card-fill-color);
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
}

.study-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.study-card-actions,
.study-local-toolbar,
.study-tabs {
  display: flex;
  align-items: baseline;
  gap: calc(var(--button-content-gap) * 1.5);
}

.study-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  padding-right: calc(var(--button-content-gap) * 0.5);
  overflow: auto;
}

.study-empty {
  color: var(--button-text-color);
  font-size: calc(var(--button-font-size) * 0.72);
}
</style>
