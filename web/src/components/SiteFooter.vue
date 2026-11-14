<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="border-t">
    <p class="mx-auto max-w-3xl px-4 py-4 text-sm text-gray-500">
      © {{ year }} やーはり
    </p>
  </footer>
</template>
