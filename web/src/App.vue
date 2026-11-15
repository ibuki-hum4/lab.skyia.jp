<script setup lang="ts">
import { RouterView } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import SiteFooter from "./components/SiteFooter.vue";
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-10 pb-18 sm:px-6">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
