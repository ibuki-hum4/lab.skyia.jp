<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="text-center">
    <h1 class="text-lg font-bold">
      ページが見つかりません
    </h1>
    <RouterLink
      to="/"
      class="mt-4 inline-block underline"
    >一覧へ戻る</RouterLink>
  </section>
</template>
