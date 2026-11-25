<script setup lang="ts">
import { legacyLink } from "../utils/legacy-links";
defineProps<{ bottom?: boolean }>();
const entries = [
  { label: "Start", href: legacyLink("/") },
  { label: "Spieler", href: legacyLink("/stats/players") },
  { label: "Live", href: legacyLink("/live") },
];
</script>
<template>
  <nav
    :class="{ 'bottom-nav': bottom }"
    :aria-label="bottom ? 'Mobile Navigation' : 'Hauptnavigation'"
  >
    <NuxtLink to="/stats/games" aria-current="page">Verlauf</NuxtLink>
    <template v-for="entry in entries" :key="entry.label">
      <a v-if="entry.href" :href="entry.href">{{ entry.label }}</a>
      <span v-else aria-disabled="true" title="Im Pilot nicht verfügbar">{{
        entry.label
      }}</span>
    </template>
  </nav>
</template>
<style scoped>
nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: var(--muted);
}
a, span {
  padding: 8px 11px;
  border-radius: 9px;
}
a {
  text-decoration: none;
}
[aria-current="page"] {
  font-weight: 700;
  color: var(--on-accent);
  background: var(--accent);
}
[aria-disabled] {
  opacity: 0.65;
}
.bottom-nav {
  display: none;
}
@media (max-width: 600px) {
  nav:not(.bottom-nav) {
    display: none;
  }
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 5;
    justify-content: space-around;
    padding: 8px 8px max(8px, env(safe-area-inset-bottom));
    gap: 8px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    font-size: 0.8rem;
  }
}
</style>
