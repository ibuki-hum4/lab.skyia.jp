<script setup lang="ts">
// 種類のバッジ。記事は墨の地に白い字、メモは付箋の黄
defineProps<{ kind: "post" | "memo" }>();
</script>

<template>
  <span
    v-if="kind === 'post'"
    class="inline-block min-w-16 border-2 border-ink bg-ink px-2 py-0.5 text-center font-mono text-xs font-bold tracking-widest text-white"
  >記事</span>
  <span
    v-else
    class="inline-block min-w-16 rotate-2 border-2 border-sticky bg-sticky px-2 py-0.5 text-center font-mono text-xs font-bold tracking-widest text-ink"
  >メモ</span>
</template>
