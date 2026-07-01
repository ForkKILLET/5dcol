<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'

export interface MembersPanelMember {
  canFollow: boolean
  canJump: boolean
  color: string
  current: boolean
  followedBy: MembersPanelMemberBadge[]
  following: boolean
  followingMembers: MembersPanelMemberBadge[]
  id: string
  name: string
  online: boolean
  role: string
}

export interface MembersPanelMemberBadge {
  color: string
  id: string
  name: string
}

const emit = defineEmits<{
  follow: [userId: string]
  jump: [userId: string]
}>()

const memberList = useTemplateRef('memberList')
const props = defineProps<{
  emptyText: string
  focusedMemberId?: string | null
  focusPulseId?: number
  followedByLabel: string
  followLabel: string
  followingLabel: string
  jumpLabel: string
  members: MembersPanelMember[]
  offlineLabel: string
  onlineLabel: string
  unfollowLabel: string
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

function followMember(userId: string) {
  emit('follow', userId)
}

function getMemberBadgeInitial(member: MembersPanelMemberBadge) {
  return Array.from(member.name.trim())[0]?.toUpperCase() ?? '?'
}
</script>

<template>
  <GamePanel
    class="members-panel"
    shadow
  >
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
          <div
            v-if="member.followingMembers.length > 0"
            class="member-follow-line"
          >
            <span>{{ followingLabel }}</span>
            <span class="member-badge-cluster">
              <span
                v-for="followed in member.followingMembers"
                :key="followed.id"
                class="member-badge"
                :style="{ '--member-badge-color': followed.color }"
                :title="followed.name"
              >
                {{ getMemberBadgeInitial(followed) }}
              </span>
            </span>
          </div>
          <div
            v-if="member.current && member.followedBy.length > 0"
            class="member-follow-line"
          >
            <span>{{ followedByLabel }}</span>
            <span class="member-badge-cluster">
              <span
                v-for="follower in member.followedBy"
                :key="follower.id"
                class="member-badge"
                :style="{ '--member-badge-color': follower.color }"
                :title="follower.name"
              >
                {{ getMemberBadgeInitial(follower) }}
              </span>
            </span>
          </div>
        </div>
        <div
          v-if="!member.current"
          class="member-actions"
        >
          <GameButton
            size="tiny"
            :disabled="!member.canJump"
            @click="jumpToMember(member.id)"
          >
            <span>{{ jumpLabel }}</span>
          </GameButton>
          <GameButton
            size="tiny"
            :disabled="!member.canFollow"
            @click="followMember(member.id)"
          >
            <span>{{ member.following ? unfollowLabel : followLabel }}</span>
          </GameButton>
        </div>
      </li>
    </ul>
  </GamePanel>
</template>

<style scoped>
.members-empty {
  font-size: 16px;
  line-height: 1.25;
  opacity: 0.72;
}

.members-list {
  --member-pulse-spread: 8px;
  --members-list-scroll-padding: calc(var(--button-content-gap) * 0.5);

  display: flex;
  flex-direction: column;
  gap: var(--button-content-gap);
  min-height: 0;
  margin: calc(var(--member-pulse-spread) * -1);
  padding:
    var(--member-pulse-spread)
    calc(var(--member-pulse-spread) + var(--members-list-scroll-padding))
    var(--member-pulse-spread)
    var(--member-pulse-spread);
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
  border-radius: 4px;
  background: transparent;
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

.member-actions {
  display: flex;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.5);
  align-items: flex-end;
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
.member-follow-line {
  font-size: 13px;
  line-height: 1.1;
  opacity: 0.75;
}

.member-follow-line {
  display: flex;
  gap: calc(var(--button-content-gap) * 0.55);
  align-items: center;
  min-width: 0;
}

.member-badge-cluster {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  min-width: 0;
  padding-right: calc(var(--button-tiny-height) * 0.2);
}

.member-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: calc(var(--button-tiny-height) * 0.72);
  height: calc(var(--button-tiny-height) * 0.72);
  margin-right: calc(var(--button-tiny-height) * -0.2);
  border: var(--button-tiny-border) solid var(--button-border-color);
  border-radius: 50%;
  background: var(--member-badge-color);
  color: rgb(244, 245, 237);
  box-shadow: var(--button-tiny-shadow-offset) var(--button-tiny-shadow-offset) 0 var(--button-shadow-color);
  font-size: calc(var(--button-tiny-font-size) * 0.66);
  font-weight: 700;
  line-height: 1;
}

@keyframes member-row-pulse {
  0% {
    background: color-mix(in srgb, rgb(92 135 95) 58%, transparent);
    box-shadow: 0 0 0 0 color-mix(in srgb, rgb(92 135 95) 80%, transparent);
  }

  42% {
    background: color-mix(in srgb, rgb(92 135 95) 32%, transparent);
    box-shadow: 0 0 0 6px color-mix(in srgb, rgb(92 135 95) 26%, transparent);
  }

  100% {
    background: transparent;
    box-shadow: 0 0 0 8px transparent;
  }
}
</style>
