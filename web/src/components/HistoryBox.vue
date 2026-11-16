<script setup lang="ts">
// HISTORY / スタンプの履歴。押されたスタンプを重ねて見せ(古いものほど薄く)、下に時刻の一覧
import { computed } from "vue";
import type { StatusChange } from "../api";
import { fmtShort, STATUS_LABEL } from "../lib/notes";

const props = defineProps<{ history: StatusChange[] }>();

const TONE = {
  pass: "text-pass border-pass",
  fail: "text-fail border-fail",
  watch: "text-watch border-watch border-dashed",
} as const;
const TEXT = { pass: "text-pass", fail: "text-fail", watch: "text-watch" } as const;

/** 重ねるのは最後の 4 つまで */
const stamps = computed(() => {
  const last = props.history.slice(-4);
  return last.map((h, i) => ({
    ...h,
    // 古いものほど薄く、少しずつずらして傾きも変える
    opacity: i === last.length - 1 ? 1 : 0.25 + (0.4 * i) / Math.max(1, last.length - 1),
    left: 16 + i * 44,
    rotate: i % 2 === 0 ? 4 : -7,
  }));
});
</script>

<template>
  <section
    aria-labelledby="history-title"
    class="flex flex-col gap-3.5 border border-ink bg-white px-5 py-4.5"
  >
    <h2
      id="history-title"
      class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
    >
      HISTORY / スタンプの履歴
    </h2>
    <div
      aria-hidden="true"
      class="relative h-18 overflow-hidden border border-dashed border-rule bg-[#FAFBFA]"
    >
      <span
        v-for="(s, i) in stamps"
        :key="i"
        class="absolute top-4.5 border-2 px-2.5 py-0.75 font-mono text-sm font-bold tracking-widest"
        :class="TONE[s.to]"
        :style="{ left: `${s.left}px`, opacity: s.opacity, transform: `rotate(${s.rotate}deg)` }"
        data-testid="history-stamp"
      >{{ STATUS_LABEL[s.to] }}</span>
    </div>
    <ol class="flex flex-col gap-2.5 text-[13px]">
      <li
        v-for="(h, i) in history"
        :key="i"
        class="flex items-baseline gap-2.5"
        :class="i < history.length - 1 ? 'opacity-60' : ''"
      >
        <time
          :datetime="h.at"
          class="flex-none font-mono text-xs text-muted"
        >{{ fmtShort(h.at) }}</time>
        <span>
          <template v-if="h.from"><b
            class="font-mono"
            :class="TEXT[h.from]"
          >{{ STATUS_LABEL[h.from] }}</b> → </template>
          <b
            class="font-mono"
            :class="TEXT[h.to]"
          >{{ STATUS_LABEL[h.to] }}</b>
          <template v-if="!h.from"> で始めた</template>
        </span>
      </li>
    </ol>
  </section>
</template>
