<script setup lang="ts">
import type { GameRead } from "../domain/legacy";
import { getFrameType } from "../domain/legacy";
defineProps<{ game: GameRead }>();
</script>
<template>
  <div
    class="table-scroll"
    tabindex="0"
    role="region"
    aria-label="Frame-Ergebnisse, horizontal scrollbar"
  >
    <table>
      <caption>
        Würfe und kumulative Punkte
      </caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th v-for="n in 10" :key="n" scope="col">{{ n }}</th>
          <th scope="col">Ges.</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="score in game.scores" :key="score.player_name">
          <th scope="row">{{ score.player_name }}</th>
          <td
            v-for="n in 10"
            :key="n"
            :class="score.frames[n - 1] ? getFrameType(score.frames[n - 1]!) : ''"
          >
            <template v-if="score.frames[n - 1]">
              <span class="throw-cell">
                <span>{{ score.frames[n - 1]!.throw1 }}</span>
                <SplitPatternPopover
                  v-if="score.frames[n - 1]!.split?.isSplit"
                  :standing-pins="score.frames[n - 1]!.split!.standingPins"
                  :converted="score.frames[n - 1]!.split!.converted"
                />
                <span>{{ score.frames[n - 1]!.throw2 }}</span>
                <span v-if="n === 10">{{ score.frames[n - 1]!.throw3 }}</span>
              </span>
              <small>{{ score.frames[n - 1]!.cumulative || "–" }}</small>
            </template>
          </td>
          <td>{{ score.total_score }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped>
.table-scroll {
  overflow: auto;
  margin-top: 12px;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: 680px;
  font-size: 0.8rem;
}
caption {
  text-align: left;
  padding-bottom: 8px;
  color: var(--muted);
}
th,
td {
  border: 1px solid var(--border);
  padding: 6px;
  text-align: center;
  white-space: nowrap;
}
thead th {
  background: var(--subtle);
}
tbody th {
  text-align: left;
}
.throw-cell {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 4px;
}
.strike {
  background: var(--strike-bg);
  color: var(--strike-text);
}
.spare {
  background: var(--spare-bg);
  color: var(--spare-text);
}
td small {
  display: block;
  margin-top: 4px;
  color: inherit;
}
</style>
