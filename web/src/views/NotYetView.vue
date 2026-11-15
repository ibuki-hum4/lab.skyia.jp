<script setup lang="ts">
// 次の PR で作るページ(/new・/following・/tags・/members)
import NotYet from "../components/NotYet.vue";

defineProps<{ page: string }>();
</script>

<template>
  <NotYet :page="page" />
</template>
