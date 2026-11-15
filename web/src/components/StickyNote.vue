<script setup lang="ts">
// メモの付箋。少し傾け、上にテープ、右下に折れた角、下に影。
//   row:  一覧の 1 行ぶん(行と同じ幅と左端)
//   page: ページいっぱい
withDefaults(defineProps<{ size?: "row" | "page"; tilt?: number }>(), { size: "row", tilt: -0.6 });
</script>

<template>
  <component
    :is="size === 'page' ? 'article' : 'aside'"
    class="relative flex w-full flex-col bg-sticky text-ink"
    :class="
      size === 'page'
        ? 'gap-4 px-6 pt-11 pb-10 shadow-[0_24px_34px_-12px_rgba(22,24,27,0.32),0_3px_0_rgba(22,24,27,0.06)] sm:px-13'
        : 'gap-2 px-6 pt-5.5 pb-4.5 shadow-[0_14px_22px_-6px_rgba(22,24,27,0.28),0_2px_0_rgba(22,24,27,0.06)]'
    "
    :style="{ transform: `rotate(${tilt}deg)` }"
  >
    <!-- テープ -->
    <span
      aria-hidden="true"
      class="absolute left-1/2 border border-ink/8 bg-white/60"
      :class="size === 'page' ? '-top-3.5 -ml-16.5 h-7 w-33 -rotate-2' : '-top-2.75 -ml-12 h-5.5 w-24 rotate-3'"
    />
    <!-- 右下の折れた角 -->
    <span
      aria-hidden="true"
      class="absolute right-0 bottom-0 size-0 border-solid border-t-0 border-r-0 border-t-transparent border-r-transparent border-b-paper border-l-sticky-fold"
      :class="size === 'page' ? 'border-b-[40px] border-l-[40px]' : 'border-b-[22px] border-l-[22px]'"
    />
    <slot />
  </component>
</template>
