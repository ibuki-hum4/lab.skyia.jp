<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <footer class="bg-ink text-[#E7EAEE]">
    <div class="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-7 text-[13px] sm:px-6">
      <span class="font-mono font-bold"><span class="font-medium text-[#B9BFC6]">skyia</span><span class="text-[#8FA6F0]">/</span>lab</span>
      <RouterLink
        to="/about"
        class="hover:underline"
      >
        このサイトについて
      </RouterLink>
    </div>
  </footer>
</template>
