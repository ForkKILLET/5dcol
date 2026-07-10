<script setup lang="ts">
defineProps<{
  name: 'axis-view' | 'branch' | 'chat' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'chevron-up' | 'clock' | 'comment' | 'current' | 'delete-future' | 'ellipsis' | 'exclamation' | 'flip' | 'globe' | 'glyph' | 'jump' | 'members' | 'minimap' | 'panels' | 'plus' | 'record' | 'reset' | 'x'
}>()
</script>

<template>
  <svg
    class="game-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <template v-if="name === 'globe'">
      <circle
        cx="12"
        cy="12"
        r="9"
      />
      <path d="M3 12h18" />
      <path d="M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9" />
      <path d="M12 3c-2.3 2.5-3.5 5.5-3.5 9s1.2 6.5 3.5 9" />
    </template>
    <template v-else-if="name === 'flip'">
      <path d="M7 7h9.5l-3-3" />
      <path d="M16.5 7l-3 3" />
      <path d="M17 17H7.5l3 3" />
      <path d="M7.5 17l3-3" />
      <path d="M5 12c0-2.2.8-4 2-5" />
      <path d="M19 12c0 2.2-.8 4-2 5" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="M9 5l7 7-7 7" />
    </template>
    <template v-else-if="name === 'chevron-left'">
      <path d="M15 5l-7 7 7 7" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="M5 9l7 7 7-7" />
    </template>
    <template v-else-if="name === 'chevron-up'">
      <path d="M5 15l7-7 7 7" />
    </template>
    <template v-else-if="name === 'current'">
      <circle
        cx="12"
        cy="12"
        r="7"
      />
      <circle
        cx="12"
        cy="12"
        r="2.2"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'jump'">
      <path d="M5 5v14" />
      <path d="M7 12h11" />
      <path d="M14 8l4 4-4 4" />
    </template>
    <template v-else-if="name === 'branch'">
      <path d="M6 5v14" />
      <path d="M6 12h4.5c3 0 5.5-2.5 5.5-5.5V5" />
      <path d="M13 5h6v6" />
    </template>
    <template v-else-if="name === 'delete-future'">
      <path d="M9.5 12H19" />
      <path d="M15 8l4 4-4 4" />
      <path d="M4.8 9.4l5.2 5.2" />
      <path d="M10 9.4l-5.2 5.2" />
    </template>
    <template v-else-if="name === 'comment'">
      <path d="M5 5.5h14v10H10l-5 4z" />
    </template>
    <template v-else-if="name === 'chat'">
      <path d="M5 5.5h14v10H9.5L5 19z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h5" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle
        cx="12"
        cy="12"
        r="8"
      />
      <path d="M12 7.5V12l3.5 2" />
    </template>
    <template v-else-if="name === 'record'">
      <path d="M6 6.5h12" />
      <path d="M6 12h12" />
      <path d="M6 17.5h12" />
    </template>
    <template v-else-if="name === 'panels'">
      <rect
        x="5"
        y="5"
        width="5.5"
        height="5.5"
        rx="1"
      />
      <rect
        x="13.5"
        y="5"
        width="5.5"
        height="5.5"
        rx="1"
      />
      <rect
        x="5"
        y="13.5"
        width="5.5"
        height="5.5"
        rx="1"
      />
      <rect
        x="13.5"
        y="13.5"
        width="5.5"
        height="5.5"
        rx="1"
      />
    </template>
    <template v-else-if="name === 'minimap'">
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="1.5"
      />
      <rect
        x="12.5"
        y="10"
        width="4.5"
        height="4"
        rx=".5"
      />
    </template>
    <template v-else-if="name === 'axis-view'">
      <path d="M5 17h14" />
      <path d="M15 13l4 4-4 4" />
      <path d="M7 19V5" />
      <path d="M3 9l4-4 4 4" />
    </template>
    <template v-else-if="name === 'members'">
      <circle
        cx="9"
        cy="8"
        r="3"
      />
      <path d="M4 19c.7-3.4 2.4-5 5-5s4.3 1.6 5 5" />
      <path d="M14.5 6.5a2.7 2.7 0 0 1 0 5.2" />
      <path d="M15.2 14.2c2.2.4 3.7 1.9 4.4 4.8" />
    </template>
    <template v-else-if="name === 'glyph'">
      <path d="M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 16l-4.6 2.4.9-5.2-3.8-3.7 5.2-.8z" />
    </template>
    <template v-else-if="name === 'exclamation'">
      <path d="M12 5v9" />
      <path d="M12 19h.01" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'reset'">
      <path d="M5 8V4h4" />
      <path d="M5.6 8.2A7 7 0 1 1 5.2 15" />
    </template>
    <template v-else-if="name === 'x'">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </template>
    <template v-else>
      <circle
        cx="5"
        cy="12"
        r="1.5"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="19"
        cy="12"
        r="1.5"
        fill="currentColor"
        stroke="none"
      />
    </template>
  </svg>
</template>

<style scoped>
.game-icon {
  width: calc(var(--button-icon-size) * 0.9);
  height: calc(var(--button-icon-size) * 0.9);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
</style>
