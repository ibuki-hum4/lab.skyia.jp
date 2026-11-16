<script setup lang="ts">
import { RouterView, useRoute } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import SiteFooter from "./components/SiteFooter.vue";

const route = useRoute();
</script>

<template>
  <!-- エディタは、自分の上の帯(保存と公開のボタン)を持つ -->
  <RouterView v-if="route.meta.bare" />
  <div
    v-else
    class="flex min-h-screen flex-col"
  >
    <AppHeader />
    <main class="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-10 pb-18 sm:px-6">
      <RouterView />
    </main>
    <SiteFooter />
  </div>
</template>
