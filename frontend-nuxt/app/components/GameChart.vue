<script setup lang="ts">
import { computed, ref } from "vue";
import type { EChartsOption, LineSeriesOption } from "echarts";
import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import VChart from "vue-echarts";
import type { GameRead } from "../domain/legacy";
import { addPersonalBestData, buildGameChartData } from "../domain/legacy";
import { PLAYER_COLORS } from "../../../frontend/lib/constants";

use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

const props = defineProps<{ game: GameRead; allGames: GameRead[] }>();
const round = ref(true);
const open = ref(false);
const pb = ref(false);
const hidden = ref<string[]>([]);
const chart = ref<InstanceType<typeof VChart> | null>(null);
const selectedFrame = ref(0);
const pin = "path://M0,-10 C4,-10 4,-6 2,-4 L2,0 C7,5 6,10 0,10 C-6,10 -7,5 -2,0 L-2,-4 C-4,-6 -4,-10 0,-10 Z";
const data = computed(() => {
  const points = buildGameChartData(props.game);
  addPersonalBestData(points, props.game, props.allGames);
  return points;
});
const legend = computed(() => [
  ...props.game.scores.map((score, index) => ({
    name: score.player_name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
  })),
  ...(pb.value ? props.game.scores.map((score, index) => ({
    name: `${score.player_name} PB Game`,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
  })) : []),
  ...(open.value ? [{ name: "Offene Frames %", color: "#f97316" }] : []),
]);

const option = computed<EChartsOption>(() => {
  const series: LineSeriesOption[] = [];
  props.game.scores.forEach((score, index) => {
    const name = score.player_name;
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
    if (!hidden.value.includes(name)) {
      series.push({
        name,
        type: "line",
        smooth: true,
        connectNulls: false,
        lineStyle: { width: 2.8, color },
        itemStyle: { color },
        data: data.value.map((point) => {
          const marker = point[`${name}_type`];
          return {
            value: typeof point[name] === "number" ? point[name] : null,
            symbol: marker === "strike" || marker === "spare" ? pin : "circle",
            symbolSize: marker === "strike" || marker === "spare" ? 14 : 7,
            itemStyle: {
              color: marker === "strike" ? "#eab308" : marker === "spare" ? "#cbd5e1" : color,
              borderColor: marker === "spare" ? "#64748b" : color,
              borderWidth: 1,
            },
          };
        }),
      });
    }
    const pbName = `${name} PB Game`;
    if (pb.value && !hidden.value.includes(pbName)) {
      series.push({
        name: pbName, type: "line", smooth: true, connectNulls: false,
        data: data.value.map((point) => point[`${name} PB`] ?? null),
        symbol: "none",
        itemStyle: { color },
        lineStyle: { type: "dashed", color, opacity: 0.65 },
      });
    }
    series.push({
      name: `${name} total`, type: "line", data: [], silent: true,
      tooltip: { show: false },
      markLine: {
        silent: true, symbol: "none", label: { show: false },
        lineStyle: { color, type: "dashed", opacity: 0.45 },
        data: [{ yAxis: score.total_score }],
      },
    });
  });
  if (round.value) {
    series.push({
      name: "Rundenzahl", type: "line",
      data: data.value.map((point) => point.roundNumber),
      symbol: "none", silent: true,
      lineStyle: { type: "dashed", color: "#94a3b8" },
      tooltip: { show: false },
    });
  }
  if (open.value && !hidden.value.includes("Offene Frames %")) {
    series.push({
      name: "Offene Frames %", type: "line",
      data: data.value.map((point) => point.openFrameRate),
      step: "end", symbol: "none",
      itemStyle: { color: "#f97316" },
      lineStyle: { type: "dashed", color: "#f97316" },
    });
  }
  return {
    animation: false,
    grid: { left: 40, right: 15, top: 20, bottom: 35 },
    tooltip: {
      trigger: "axis", renderMode: "richText",
      formatter: (params) => (Array.isArray(params) ? params : [params])
        .filter((entry) => legend.value.some((item) => item.name === entry.seriesName))
        .filter((entry) => typeof entry.value === "number")
        .sort((a, b) => Number(b.value) - Number(a.value))
        .map((entry) => `${entry.seriesName}: ${entry.value}`)
        .join("\n"),
    },
    xAxis: { type: "category", data: data.value.map((point) => point.frame) },
    yAxis: {
      min: 0,
      max: (extent) => Math.max(extent.max, 0, ...props.game.scores.map((score) => score.total_score)) + 10,
    },
    series,
  };
});

function toggle(name: string) {
  hidden.value = hidden.value.includes(name)
    ? hidden.value.filter((item) => item !== name)
    : [...hidden.value, name];
}
function selectFrame(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !data.value.length) return;
  event.preventDefault();
  selectedFrame.value = Math.max(0, Math.min(data.value.length - 1,
    selectedFrame.value + (event.key === "ArrowRight" ? 1 : -1)));
  chart.value?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: selectedFrame.value });
}
</script>

<template>
  <div>
    <div class="controls" aria-label="Diagrammoptionen">
      <button :class="{ active: round }" :aria-pressed="round" @click="round = !round">Rundenzahl</button>
      <button :class="{ active: open }" :aria-pressed="open" @click="open = !open">Offene Frames</button>
      <button :class="{ active: pb }" :aria-pressed="pb" @click="pb = !pb">PB Game</button>
    </div>
    <div class="controls" aria-label="Datenreihen">
      <button v-for="entry in legend" :key="entry.name"
        :aria-pressed="!hidden.includes(entry.name)"
        :class="{ active: !hidden.includes(entry.name) }"
        :style="{ borderColor: entry.color }" @click="toggle(entry.name)">
        {{ entry.name }}
      </button>
    </div>
    <p class="pin-key"><span class="strike-key">●</span> Goldener Pin: Strike ·
      <span class="spare-key">●</span> Silberner Pin: Spare</p>
    <div class="chart" tabindex="0" aria-label="Punkteverlauf; Pfeiltasten wählen einen Frame"
      @keydown="selectFrame">
      <VChart ref="chart" class="chart-canvas" :option="option"
        :update-options="{ notMerge: true }" autoresize />
    </div>
    <ScoreTable :game="game" />
  </div>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.controls button {
  border: 1px solid var(--border); border-radius: 99px; padding: 5px 9px;
  background: var(--surface); color: var(--text); font-size: .8rem; cursor: pointer;
}
.controls button.active { background: var(--accent); color: var(--on-accent); }
.chart { height: 280px; width: 100%; touch-action: pan-y; }
.chart-canvas { height: 100%; width: 100%; }
.pin-key { font-size: .8rem; color: var(--muted); }
.strike-key { color: #a16207; }
.spare-key { color: #64748b; }
</style>
