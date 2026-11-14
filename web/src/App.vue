<script setup lang="ts">
import { RouterView } from "vue-router";
import SiteFooter from "./components/SiteFooter.vue";
import SiteHeader from "./components/SiteHeader.vue";
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteHeader />
    <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
