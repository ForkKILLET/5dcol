<template>
  <div class="card">
    <slot />
  </div>
</template>

<style scoped>
.card {
  padding: 1em;
  border-radius: 2em;
  border: 4px solid #f4f5ed;
  background-color: #e1e2d8;
  color: #222;
  line-height: 1.2;
}
</style>