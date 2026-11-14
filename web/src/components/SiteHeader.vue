<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <header class="border-b">
    <nav class="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
      <RouterLink
        to="/"
        class="font-bold"
      >lab.skyia.jp</RouterLink>
      <RouterLink
        to="/"
        class="text-sm"
      >一覧</RouterLink>
      <RouterLink
        to="/about"
        class="text-sm"
      >このサイトについて</RouterLink>
    </nav>
  </header>
</template>
