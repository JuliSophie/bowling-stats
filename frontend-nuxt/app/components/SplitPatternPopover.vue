<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ standingPins: number[]; converted: boolean }>();
const open = ref(false);
const button = ref<HTMLButtonElement | null>(null);
const left = ref(0);
const top = ref(0);
const layout = [
  [7, 0, -1.5],
  [8, 0, -0.5],
  [9, 0, 0.5],
  [10, 0, 1.5],
  [4, 1, -1],
  [5, 1, 0],
  [6, 1, 1],
  [2, 2, -0.5],
  [3, 2, 0.5],
  [1, 3, 0],
] as const;

function reposition() {
  const rect = button.value?.getBoundingClientRect();
  if (!rect) return;
  left.value = Math.min(rect.left, window.innerWidth - 150);
  top.value = Math.min(rect.bottom + 6, window.innerHeight - 120);
}
function close(event?: KeyboardEvent) {
  if (open.value && (!event || event.key === "Escape")) {
    open.value = false;
    button.value?.focus();
  }
}
async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    reposition();
  }
}
onMounted(() => {
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("keydown", close);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition, true);
  window.removeEventListener("keydown", close);
});
</script>

<template>
  <button
    ref="button"
    class="split-trigger"
    type="button"
    :aria-expanded="open"
    aria-label="Split-Muster anzeigen"
    @click.stop="toggle"
  >
    S
  </button>
  <Teleport to="body">
    <div v-if="open" class="split-backdrop" role="presentation" @click="close()">
      <div
        class="split-popover"
        :style="{ left: `${left}px`, top: `${top}px` }"
        role="dialog"
        aria-label="Split-Muster"
        @click.stop
      >
        <strong>Split {{ props.converted ? "geräumt" : "offen" }}</strong>
        <div class="pin-deck">
          <i
            v-for="[pin, row, offset] in layout"
            :key="pin"
            :class="{ standing: props.standingPins.includes(pin) }"
            :style="{ left: `${50 + offset * 28.9}%`, top: `${19 + row * 23}%` }"
            >{{ pin }}</i
          >
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.split-trigger {
  border: 1px solid currentColor;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font-size: 0.6rem;
  cursor: pointer;
}
.split-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.split-popover {
  position: fixed;
  z-index: 11;
  width: 140px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 8px 24px #17203333;
}
.split-popover strong {
  font-size: 0.7rem;
}
.pin-deck {
  position: relative;
  height: 80px;
  margin-top: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--subtle);
}
.pin-deck i {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  border: 1px solid var(--muted);
  border-radius: 50%;
  font-size: 9px;
  font-style: normal;
  text-align: center;
  color: var(--muted);
}
.pin-deck i.standing {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
}
</style>
