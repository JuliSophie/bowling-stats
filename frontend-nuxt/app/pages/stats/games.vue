<script setup lang="ts">
import { computed } from "vue";
import { groupGames } from "../../domain/legacy";
import { useGames } from "../../composables/useGames";
import { usePilotState } from "../../composables/usePilotState";
import { useTheme } from "../../composables/useTheme";
import { legacyLink } from "../../utils/legacy-links";

const { data, status, error, refresh } = useGames();
const { expanded, days, previews } = usePilotState();
const { theme, toggle } = useTheme();
const groups = computed(() => groupGames(data.value ?? []));
const legacyGames = legacyLink("/stats/games");
const legacyHome = legacyLink("/");
const legacyDays = legacyLink("/stats/days");
</script>
<template>
  <div class="shell">
    <header>
      <div class="brand"><span aria-hidden="true">🎳</span><strong>Bowling Stats</strong><small>Pilotenverlauf</small></div>
      <PilotNavigation />
      <button class="theme-toggle" aria-label="Darstellung umschalten" @click="toggle">
        {{ theme === "dark" ? "☀️" : "🌙" }}
      </button>
    </header>
    <main>
      <div class="pilot"><b>Nuxt Pilot</b><span>synthetischer Verlauf</span> · keine Produktions-API</div>
      <nav class="breadcrumbs" aria-label="Seitenkontext"><NuxtLink to="/">Start</NuxtLink><span>›</span><strong>Verlauf</strong></nav>
      <div class="title-row">
        <a v-if="legacyHome" :href="legacyHome" aria-label="Zur bestehenden Startseite">←</a>
        <span v-else aria-disabled="true" title="Bestehende Startseite nicht konfiguriert">←</span>
        <div><span class="eyebrow">DEIN VERLAUF</span><h1>Spieltage & Spiele</h1></div><span>({{ data?.length ?? 0 }})</span>
        <a v-if="legacyGames" :href="legacyGames">Bestehende Spiele öffnen</a>
      </div>
      <UiCard v-if="status === 'pending' || status === 'idle'" class="message" role="status">Lade Spiele...</UiCard>
      <UiCard v-else-if="error" class="message error" role="alert">
        Spiele konnten nicht geladen werden.
        <button @click="refresh()">Erneut versuchen</button>
      </UiCard>
      <UiCard v-else-if="!groups.length" class="message">Keine Spiele vorhanden.</UiCard>
      <template v-else>
        <GameDayPreviewCard v-for="(group, index) in groups" :key="group.date"
          :date="group.date" :games="group.games" :all-games="data ?? []"
          :expanded="days[group.date] ?? index === 0" :expanded-game="expanded"
          :preview="previews[group.date] ?? false"
          @toggle-day="days[group.date] = !(days[group.date] ?? index === 0)"
          @toggle-preview="previews[group.date] = !(previews[group.date] ?? false)"
          @toggle-game="expanded = $event" />
      </template>
      <p class="scope-note">Detailseiten und Bearbeitung sind nicht Teil dieses Piloten.
        Die Demospiele werden nicht an das bestehende System übertragen.
        <a v-if="legacyDays" :href="legacyDays">Tagesansicht im Bestand öffnen</a></p>
    </main>
    <PilotNavigation bottom />
  </div>
</template>
<style scoped>
.shell { max-width: 1050px; margin: auto; padding: 18px 20px; }
header { display: flex; align-items: center; gap: 26px; padding: 4px 0 22px; }
.brand { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.brand span { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px;
  font-size: 1.35rem; background: var(--brand-bg); }
.brand small { color: var(--muted); font-size: .72rem; margin-left: 3px; }
.theme-toggle { margin-left: auto; border: 0; background: transparent; font-size: 1.1rem; cursor: pointer; padding: 8px; }
.pilot { border-left: 4px solid var(--notice-text); background: var(--notice-bg); color: var(--notice-text); border-radius: 4px 12px 12px 4px; padding: 10px 14px; font-size: .85rem; }
.pilot span { margin-left: 10px; opacity: .8; }
.breadcrumbs { display: flex; gap: 8px; align-items: center; margin: 18px 0 7px; color: var(--muted); font-size: .8rem; }
.breadcrumbs a { text-decoration: none; }
.title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
.eyebrow { display: block; color: var(--accent); font-size: .7rem; font-weight: 800; letter-spacing: .12em; }
h1 { font-size: clamp(1.4rem, 4vw, 2rem); margin: 2px 0 0; }
.title-row a:last-child { margin-left: auto; }
.message { padding: 18px; }
.error { color: var(--error); }
.error button { margin-left: 8px; }
.scope-note { color: var(--muted); font-size: .85rem; }
.scope-note a { display: inline-block; margin-left: 7px; }
@media (max-width: 600px) { .shell { padding: 10px 10px 90px; } .brand small { display: none; } .pilot span { display: none; } }
</style>
