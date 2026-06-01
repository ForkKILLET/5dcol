<script setup lang="ts">
import { onMounted, onUnmounted, reactive, useTemplateRef } from 'vue'
import Card from '@comp/Card.vue'

import { Game } from '@engine/game'
import { Logger, type GameMessage } from '@engine/logger'
import { CanvasRenderer } from '@engine/canvas/renderer'

const canvas = useTemplateRef('canvas')

const messages = reactive<GameMessage[]>([])
const logger = new Logger(messages)
let game: Game | null = null

const query = new URLSearchParams(window.location.search)

async function init() {
  try {
    const renderer = await CanvasRenderer.create(canvas.value!, logger)
    game = new Game({
      fps: 60,
      renderer,
      logger,
      debug: query.get('debug') === '1',
    })
    game.start()
  }
  catch (err) {
    logger.error(String(err))
    console.error(err)
  }
}

onMounted(init)
onUnmounted(() => game?.dispose())
</script>

<template>
  <div class="game">
    <canvas ref="canvas"></canvas>

    <Card v-if="messages.length" class="message-list">
      <p v-for="message of messages" :class="[message.type, 'message']">{{ message.text }}</p>
    </Card>
  </div>
</template>

<style scoped>
.game {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background-color: #8293b3;
}

.message-list {
  position: absolute;
  right: 1em;
  top: 1em;
  min-width: 33vw;
  max-width: 66vw;
}

.message.error {
  color: #9b3a32;
}
</style>
