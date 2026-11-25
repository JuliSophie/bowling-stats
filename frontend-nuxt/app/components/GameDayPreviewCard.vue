<script setup lang="ts">
import { computed } from "vue";
import type { GameRead } from "../domain/legacy";
import { dayPlayers, formatDateDE } from "../domain/legacy";
const props = defineProps<{
  date: string;
  games: GameRead[];
  allGames: GameRead[];
  expanded: boolean;
  expandedGame: number | null;
  preview: boolean;
}>();
const emit = defineEmits<{ toggleDay: []; toggleGame: [number | null]; togglePreview: [] }>();
const players = computed(() =>
  dayPlayers(props.games).map((player, index) => ({
    ...player,
    winner: index === 0,
    crown: index === 0,
  }))
);
</script>
<template>
  <UiCard as="section" class="day">
    <div class="day-head">
      <div>
        <h2>{{ formatDateDE(date) }}</h2>
        <small
          >{{ games[0]?.location || "Ort unbekannt" }} · {{ games.length }}
          {{ games.length === 1 ? "Spiel" : "Spiele" }}</small
        >
        <ScoreChips :entries="players" />
      </div>
      <div class="day-tools">
        <button class="day-action" :aria-expanded="expanded" :aria-controls="`day-${date}`"
          @click="emit('toggleDay')">
          {{ expanded ? "Spiele ausblenden" : "Spiele anzeigen" }}
        </button>
        <button class="day-action secondary" :aria-expanded="preview"
          :aria-controls="`summary-${date}`" @click="emit('togglePreview')">
          Tagesauswertung
        </button>
      </div>
    </div>
    <section v-show="preview" :id="`summary-${date}`" class="day-summary" aria-label="Tagesauswertung Vorschau">
      <div class="preview-kicker">VORSCHAU · Tagesauswertung</div>
      <p>Zusammengezählte Ergebnisse dieses Tages — keine Detailseite.</p>
      <ol>
        <li v-for="(player, index) in players" :key="player.name">
          <strong>{{ index + 1 }}. {{ player.name }}</strong><span>{{ player.total }} Punkte</span>
        </li>
      </ol>
      <p v-if="!players.length">Keine Ergebnisse für diesen Tag.</p>
    </section>
    <div v-show="expanded" :id="`day-${date}`" class="games">
      <template v-if="expanded">
        <GamePreviewCard
          v-for="(game, index) in games"
          :key="game.id"
          :game="game"
          :date="date"
          :all-games="allGames"
          :label="`Spiel ${index + 1}`"
          :expanded="expandedGame === game.id"
          @toggle="emit('toggleGame', expandedGame === game.id ? null : game.id)"
        />
      </template>
    </div>
  </UiCard>
</template>
<style scoped>
.day {
  overflow: hidden;
  margin: 14px 0;
}
.day-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 15px;
}
.day-tools { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.day-action { border: 1px solid var(--accent); border-radius: 8px; background: var(--accent);
  color: var(--on-accent); cursor: pointer; padding: 8px 10px; font-size: .78rem; }
.day-action.secondary { background: transparent; color: var(--accent); }
.day-summary { margin: 0 15px 14px; padding: 13px 15px; border-radius: 10px;
  background: var(--summary-bg); border: 1px solid var(--summary-border); }
.preview-kicker { color: var(--summary-text); font-size: .7rem; font-weight: 800; letter-spacing: .08em; }
.day-summary p { margin: 5px 0 10px; color: var(--muted); font-size: .82rem; }
.day-summary ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 5px; }
.day-summary li { display: flex; justify-content: space-between; gap: 12px; font-size: .86rem; }
.day-summary li span { color: var(--summary-text); font-weight: 700; }
h2 {
  font-size: 1rem;
  margin: 0 0 3px;
}
small {
  color: var(--muted);
}
button {
  align-self: flex-start;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 8px;
}
.games {
  border-top: 1px solid var(--border);
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 9px;
}
@media (max-width: 600px) {
  .day-head { flex-direction: column; }
  .day-tools { justify-content: stretch; width: 100%; }
  .day-action { flex: 1; }
}
</style>
