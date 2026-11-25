<script setup lang="ts">
import { computed } from "vue";
import type { GameRead } from "../domain/legacy";
import { calculateGameExcitement, formatDateDE, formatPlayedAtTime, winnerNames } from "../domain/legacy";
const props = defineProps<{ game: GameRead; date: string; allGames: GameRead[]; label: string; expanded: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const excitement = computed(() => calculateGameExcitement(props.game));
const thresholds = [.2, .7, 1.5, 2.5, 4];
const players = computed(() => {
  const winners = winnerNames(props.game);
  return props.game.scores.map((score) => ({
    name: score.player_name, total: score.total_score, winner: winners.includes(score.player_name),
  }));
});
</script>
<template>
  <UiCard as="article" class="game" :data-game-id="game.id">
    <div class="game-head">
      <div>
        <b class="label">{{ label }}</b>
        <span class="context-label">Ergebnis</span>
        <small v-if="game.played_at_time">{{ formatPlayedAtTime(game.played_at_time) }} Uhr</small>
        <ScoreChips :entries="players" />
      </div>
      <div class="actions">
        <span v-if="excitement" class="excitement"
          :aria-label="`Spannung ${excitement.tensionIndex.toFixed(1)}`"
          :title="`Spannung ${excitement.tensionIndex.toFixed(1)}`">
          <span v-for="threshold in thresholds" :key="threshold" aria-hidden="true"
            :class="{ dim: excitement.tensionIndex < threshold }">🔥</span>
        </span>
        <button :aria-expanded="expanded" :aria-controls="`chart-${game.id}`"
          :aria-label="`Chart ${expanded ? 'einklappen' : 'ausklappen'} – ${label} vom ${formatDateDE(date)}`" @click="emit('toggle')">
          {{ expanded ? "Analyse schließen" : "Analyse ansehen" }}
        </button>
      </div>
    </div>
    <div class="game-context" aria-label="Spiel Einordnung">
      <span>Einordnung</span>
      <strong>{{ excitement ? `Spannungsindex ${excitement.tensionIndex.toFixed(1)}` : game.scores.length === 0 ? "Noch keine Wertung" : game.scores.length === 1 ? "Kein Spannungsvergleich bei einem Spieler" : "Kein Spannungsvergleich möglich" }}</strong>
      <span class="analysis-hint">Analyse über Verlauf und Score-Tabelle</span>
    </div>
    <div v-show="expanded" :id="`chart-${game.id}`" class="chart-wrap">
      <GameChart v-if="expanded" :game="game" :all-games="allGames" />
    </div>
  </UiCard>
</template>
<style scoped>
.game { box-shadow: none; }
.game-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 15px; }
.label { background: var(--accent); color: var(--on-accent); border-radius: 99px; padding: 3px 8px; font-size: .75rem; }
.context-label { margin-left: 8px; color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; }
small { color: var(--muted); margin-left: 10px; }
.game-context { display: flex; align-items: baseline; flex-wrap: wrap; gap: 7px; padding: 0 15px 12px;
  color: var(--muted); font-size: .78rem; }
.game-context span:first-child { color: var(--accent); font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.analysis-hint { margin-left: auto; }
.actions { display: flex; align-items: flex-start; gap: 6px; }
button { border: 1px solid var(--border); border-radius: 8px; background: var(--subtle); cursor: pointer; padding: 8px; font-size: .78rem; }
.excitement { padding-top: 8px; white-space: nowrap; font-size: .85rem; }
.dim { opacity: .2; filter: grayscale(1); }
.chart-wrap { border-top: 1px solid var(--border); padding: 12px; }
@media (max-width: 600px) {
  .game-head { padding: 10px; }
  .actions { flex-direction: column-reverse; align-items: flex-end; }
  .excitement { font-size: .65rem; padding-top: 0; }
  .game-context { padding: 0 10px 10px; }
  .analysis-hint { margin-left: 0; width: 100%; }
}
</style>
