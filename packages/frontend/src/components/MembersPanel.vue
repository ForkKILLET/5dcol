<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'

export interface MembersPanelMember {
  canJump: boolean
  color: string
  current: boolean
  id: string
  name: string
  online: boolean
  position: string
  role: string
}

const emit = defineEmits<{
  jump: [userId: string]
}>()

const memberList = useTemplateRef('memberList')
const props = defineProps<{
  emptyText: string
  focusedMemberId?: string | null
  focusPulseId?: number
  jumpLabel: string
  members: MembersPanelMember[]
  offlineLabel: string
  onlineLabel: string
  title: string
  youLabel: string
}>()

watch(() => props.focusPulseId, () => {
  if (! props.focusedMemberId) return
  void nextTick(() => {
    const row = memberList.value?.querySelector<HTMLElement>(
      `[data-member-id="${CSS.escape(props.focusedMemberId ?? '')}"]`,
    )
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
})

function jumpToMember(userId: string) {
  emit('jump', userId)
}
</script>

<template>
  <GamePanel class="members-panel">
    <h2 class="members-panel-title">{{ title }}</h2>
    <div
      v-if="members.length === 0"
      class="members-empty"
    >
      {{ emptyText }}
    </div>
    <ul
      v-else
      ref="memberList"
      class="members-list"
    >
      <li
        v-for="member in members"
        :key="`${member.id}:${member.id === focusedMemberId ? focusPulseId ?? 0 : 0}`"
        class="member-row"
        :class="{
          'member-row--online': member.online,
          'member-row--offline': !member.online,
          'member-row--current': member.current,
          'member-row--focused': member.id === focusedMemberId,
        }"
        :data-member-id="member.id"
        :style="{ '--member-color': member.color }"
      >
        <div class="member-main">
          <div class="member-heading">
            <span class="member-name">{{ member.name }}</span>
          </div>
          <div class="member-meta">
            <span>{{ member.role }}</span>
            <span v-if="member.current">{{ youLabel }}</span>
            <span class="member-status">{{ member.online ? onlineLabel : offlineLabel }}</span>
          </div>
          <div class="member-position">{{ member.position }}</div>
        </div>
        <GameButton
          v-if="!member.current"
          size="tiny"
          :disabled="!member.canJump"
          @click="jumpToMember(member.id)"
        >
          <span>{{ jumpLabel }}</span>
        </GameButton>
      </li>
    </ul>
  </GamePanel>
</template>

<style scoped>
.members-panel {
  max-height: min(320px, calc(var(--app-height) - var(--button-top) * 2));
  box-shadow: var(--button-shadow-offset) var(--button-shadow-offset) 0 var(--button-shadow-color);
  color: var(--button-text-color);
}

.members-panel-title {
  margin: 0;
  font-size: 28px;
  font-weight: 400;
  line-height: 1;
}

.members-empty {
  font-size: 16px;
  line-height: 1.25;
  opacity: 0.72;
}

.members-list {
  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  margin: 0;
  padding: 0 calc(var(--button-content-gap) * 0.5) 0 0;
  overflow: auto;
  list-style: none;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--button-content-gap);
  align-items: center;
  min-width: 0;
  padding: calc(var(--button-content-gap) * 0.75)
    calc(var(--button-content-gap) * 0.75)
    calc(var(--button-content-gap) * 0.75)
    calc(var(--button-content-gap) * 1.25);
  border-left: 5px solid var(--member-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--member-color) 13%, transparent);
}

.member-row--current {
  background: color-mix(in srgb, var(--member-color) 22%, transparent);
}

.member-row--offline {
  opacity: 0.62;
}

.member-row--online .member-name {
  color: rgb(92, 135, 95);
}

.member-row--focused {
  animation: member-row-pulse 900ms ease-out;
}

.member-main {
  display: grid;
  gap: calc(var(--button-content-gap) * 0.35);
  min-width: 0;
}

.member-heading,
.member-meta {
  display: flex;
  gap: calc(var(--button-content-gap) * 0.75);
  align-items: baseline;
  min-width: 0;
}

.member-name {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-meta,
.member-position {
  font-size: 13px;
  line-height: 1.1;
  opacity: 0.75;
}

.member-position {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes member-row-pulse {
  0%,
  100% {
    box-shadow: none;
  }

  35% {
    box-shadow: 0 0 0 3px rgb(92, 135, 95);
  }
}
</style>
