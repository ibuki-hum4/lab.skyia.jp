<script setup lang="ts">
// 【props】親から受け取る値を、型で決める。
// 親では <TechItem name="Vue 3" role="画面" /> のように渡す。
defineProps<{
  name: string;
  role: string;
}>();
</script>

<template>
  <li class="flex justify-between border-b py-2">
    <span class="font-medium">{{ name }}</span>
    <span class="text-sm text-gray-500">{{ role }}</span>
  </li>
</template>
