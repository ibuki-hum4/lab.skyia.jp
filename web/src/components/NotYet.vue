<script setup lang="ts">
// まだ作っていないページに置く、仮の表示
defineProps<{ page: string }>();
</script>

<template>
  <section class="rounded border border-dashed p-6 text-center">
    <h1 class="text-lg font-bold">
      {{ page }}
    </h1>
    <p class="mt-2 text-gray-500">
      ここはまだ作っていません。
    </p>
  </section>
</template>
