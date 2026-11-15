<script setup lang="ts">
// 四角いアバター。頭文字と、ハンドル(なければ名前)から決まる背景色。大きさは 3 段階
import { computed } from "vue";

const props = withDefaults(defineProps<{ name: string; handle?: string | null; size?: "sm" | "md" | "lg" }>(), {
  handle: null,
  size: "md",
});

const COLORS = ["bg-accent", "bg-pass", "bg-watch", "bg-ink", "bg-fail"];

const initial = computed(() => (props.handle || props.name || "?").trim().charAt(0).toUpperCase() || "?");
const color = computed(() => {
  const key = props.handle || props.name;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLORS[h % COLORS.length];
});
const sizeClass = computed(
  () => ({ sm: "size-6 text-xs", md: "size-10 text-base", lg: "size-16 text-3xl sm:size-22 sm:text-4xl" })[props.size],
);
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center font-mono font-bold text-white"
    :class="[color, sizeClass]"
    aria-hidden="true"
  >{{ initial }}</span>
</template>
