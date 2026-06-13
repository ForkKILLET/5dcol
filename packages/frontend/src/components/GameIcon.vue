<script setup lang="ts">
defineProps<{
  name: 'branch' | 'chevron-down' | 'chevron-right' | 'current' | 'delete-future' | 'ellipsis' | 'flip' | 'globe' | 'jump'
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
    <template v-else-if="name === 'chevron-down'">
      <path d="M5 9l7 7 7-7" />
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
