<script setup lang="ts">
// 結果のスタンプ。少し傾ける。WATCH は破線。
// 下に「観察 ◯ 日目」を出せる。WATCH で 14 日を超えたら薄くして「そろそろ結果を」と出す
import { computed } from "vue";

const props = defineProps<{ result: "pass" | "fail" | "watch"; day?: number }>();

const LABEL = { pass: "PASS", fail: "FAIL", watch: "WATCH" } as const;
const stale = computed(() => props.result === "watch" && props.day !== undefined && props.day > 14);
const tone = computed(
  () =>
    ({
      pass: "text-pass border-pass border-solid",
      fail: "text-fail border-fail border-solid",
      watch: "text-watch border-watch border-dashed",
    })[props.result],
);
</script>

<template>
  <span class="inline-flex flex-col items-end gap-2.5">
    <span
      class="inline-block -rotate-5 border-2 px-2 py-0.5 font-mono text-[13px] font-bold tracking-widest"
      :class="[tone, stale ? 'opacity-45' : '']"
      data-testid="stamp"
    >{{ LABEL[result] }}</span>
    <span
      v-if="day !== undefined"
      class="text-right font-mono text-xs"
      :class="stale ? 'text-watch' : 'text-muted'"
      data-testid="stamp-day"
    >観察 {{ day }} 日目<template v-if="stale"><br>そろそろ結果を</template></span>
  </span>
</template>
