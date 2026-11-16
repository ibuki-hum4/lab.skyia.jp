<script setup lang="ts" generic="T extends string">
// 一覧の上の切り替え(すべて / 実験 / 記事 / メモ …)。押したものが墨の地に白い字になる
defineProps<{ options: readonly { value: T; label: string; tone?: "muted" }[]; label: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex flex-wrap"
  >
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :aria-pressed="model === o.value"
      class="min-h-11 cursor-pointer px-4.5 py-2.5 text-[15px]"
      :class="
        model === o.value
          ? 'bg-ink font-bold text-white'
          : ['font-medium hover:bg-white', o.tone === 'muted' ? 'text-muted' : 'text-ink']
      "
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
