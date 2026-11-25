<script setup lang="ts">
defineProps<{ entries: { name: string; total: number; winner: boolean; crown?: boolean }[] }>();
</script>
<template>
  <div class="chips">
    <span v-for="entry in entries" :key="entry.name" :class="{ winner: entry.winner }">
      {{ entry.crown ? "👑 " : "" }}{{ entry.name }}: {{ entry.total }}
    </span>
  </div>
</template>
<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.chips span { background: var(--subtle); border-radius: 99px; padding: 4px 9px; font-size: .8rem; }
.chips .winner { background: var(--winner-bg); color: var(--winner-text); }
</style>
