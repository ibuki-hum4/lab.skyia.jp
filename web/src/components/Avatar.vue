<script setup lang="ts">
// 四角いアバター。画像(src)があれば画像、なければ頭文字と、ハンドル(なければ名前)から決まる背景色。
// 大きさは 4 段階(xs は一覧の 1 行、sm はコメント、md はヘッダー、lg はプロフィール)
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ name: string; handle?: string | null; src?: string | null; size?: "xs" | "sm" | "md" | "lg" }>(),
  { handle: null, src: null, size: "md" },
);

const COLORS = ["bg-accent", "bg-pass", "bg-watch", "bg-ink", "bg-fail"];

/** 画像が読めなかったら、頭文字に戻す */
const broken = ref(false);
watch(
  () => props.src,
  () => (broken.value = false),
);

const initial = computed(() => (props.handle || props.name || "?").trim().charAt(0).toUpperCase() || "?");
const color = computed(() => {
  const key = props.handle || props.name;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLORS[h % COLORS.length];
});
const sizeClass = computed(
  () =>
    ({
      xs: "size-6 text-xs",
      sm: "size-8 text-sm",
      md: "size-10 text-base",
      lg: "size-16 text-3xl sm:size-22 sm:text-4xl",
    })[props.size],
);
</script>

<template>
  <img
    v-if="src && !broken"
    :src="src"
    alt=""
    class="shrink-0 bg-paper object-cover"
    :class="sizeClass"
    loading="lazy"
    decoding="async"
    data-testid="avatar-img"
    @error="broken = true"
  >
  <span
    v-else
    class="inline-flex shrink-0 items-center justify-center font-mono font-bold text-white"
    :class="[color, sizeClass]"
    aria-hidden="true"
  >{{ initial }}</span>
</template>
