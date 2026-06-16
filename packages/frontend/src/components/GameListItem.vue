<script setup lang="ts">
defineProps<{
  border?: boolean
}>()
</script>

<template>
  <div
    class="game-list-item"
    :class="{ 'has-border': border }"
  >
    <div class="game-list-item__main">
      <div class="game-list-item__title">
        <slot name="title" />
      </div>
      <div class="game-list-item__meta">
        <slot name="meta" />
      </div>
    </div>
    <div class="game-list-item__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.game-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--button-content-gap) * 2);
}

.game-list-item.has-border {
  padding-top: calc(var(--button-content-gap) * 0.75);
  border-top: 1px solid color-mix(in srgb, var(--button-border-color) 55%, transparent);
}

.game-list-item__main {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(max-content, 100px) minmax(0, 1fr);
  column-gap: calc(var(--button-content-gap) * 0.75);
  align-items: center;
  min-width: 0;
}

.game-list-item__title {
  overflow: hidden;
  font-size: 18px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-list-item__meta {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.25;
  opacity: 0.78;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-list-item__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--button-content-gap) * 1.5);
}
</style>
