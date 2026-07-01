<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import type { ChatMessage } from '@5dcol/shared/protocol'
import GameButton from './GameButton.vue'
import GamePanel from './GamePanel.vue'
import GameTextInput from './GameTextInput.vue'

const props = defineProps<{
  currentUserId: string | null
  disabled?: boolean
  emptyText: string
  getAuthorColor: (userId: string) => string
  messages: ChatMessage[]
  placeholder: string
  sendLabel: string
}>()

const emit = defineEmits<{
  send: [text: string]
  uiSound: []
}>()

const draft = ref('')
const messageList = useTemplateRef('messageList')

watch(() => props.messages.length, () => {
  void nextTick(() => {
    const element = messageList.value
    if (! element) return
    element.scrollTop = element.scrollHeight
  })
})

function submitMessage() {
  const text = draft.value.trim()
  if (! text || props.disabled) return
  emit('uiSound')
  emit('send', text)
  draft.value = ''
}

function getAuthorName(message: ChatMessage) {
  return message.nickname?.trim() || 'Anonymous'
}
</script>

<template>
  <GamePanel
    class="chat-panel"
    shadow
  >
    <div
      ref="messageList"
      class="chat-message-list"
    >
      <div
        v-if="messages.length === 0"
        class="chat-empty"
      >
        {{ emptyText }}
      </div>
      <article
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="{ 'chat-message--own': message.userId === currentUserId }"
        :style="{ '--chat-author-color': getAuthorColor(message.userId) }"
      >
        <header class="chat-message-author">{{ getAuthorName(message) }}</header>
        <p class="chat-message-text">{{ message.text }}</p>
      </article>
    </div>
    <form
      class="chat-form"
      @submit.prevent="submitMessage"
    >
      <GameTextInput
        v-model="draft"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
      />
      <GameButton
        size="small"
        type="submit"
        :disabled="disabled || !draft.trim()"
      >
        <span>{{ sendLabel }}</span>
      </GameButton>
    </form>
  </GamePanel>
</template>

<style scoped>
.chat-panel {
  max-height: min(360px, calc(var(--app-height) - var(--button-top) * 2));
}

.chat-message-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: calc(var(--button-content-gap) * 0.75);
  min-height: 120px;
  overflow: auto;
  padding-right: calc(var(--button-content-gap) * 0.5);
}

.chat-empty {
  font-size: 16px;
  line-height: 1.25;
  opacity: 0.72;
}

.chat-message {
  padding-left: calc(var(--button-content-gap) * 1.25);
  border-left: 5px solid var(--chat-author-color);
  border-radius: 4px;
}

.chat-message-author {
  font-size: 14px;
  line-height: 1.1;
  opacity: 0.78;
}

.chat-message-text {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-form {
  display: flex;
  align-items: center;
  gap: var(--button-content-gap);
}
</style>
