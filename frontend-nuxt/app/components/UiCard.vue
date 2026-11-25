<script setup lang="ts">
withDefaults(defineProps<{ as?: "div" | "section" | "article" }>(), { as: "div" });
</script>
<template><component :is="as" class="card"><slot /></component></template>
<style scoped>
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 2px 8px #1720330b;
}
</style>
