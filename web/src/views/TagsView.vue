<script setup lang="ts">
// /tags: 使われているタグの一覧(多い順)。数で字の大きさを少し変える
import { useTitle } from "@vueuse/core";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, type TagCount } from "../api";

useTitle("タグ - skyia/lab");
const tags = ref<TagCount[]>([]);
const state = ref<"loading" | "ok" | "error">("loading");
const filter = ref("");

onMounted(async () => {
  const res = await api("GET /api/notes/tags");
  if (res.ok) {
    tags.value = res.data;
    state.value = "ok";
  } else state.value = "error";
});

const max = computed(() => Math.max(1, ...tags.value.map((t) => t.count)));
const shown = computed(() => {
  const f = filter.value.trim().replace(/^#/, "").toLowerCase();
  return f ? tags.value.filter((t) => t.tag.includes(f)) : tags.value;
});
const size = (n: number) => `${14 + Math.round((n / max.value) * 8)}px`;
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex grow flex-col gap-2">
        <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
          TAGS
        </p>
        <h1 class="text-3xl font-bold sm:text-4xl">
          タグ
        </h1>
      </div>
      <label class="flex h-10 w-full items-center border border-ink bg-white px-3 sm:w-72">
        <span class="sr-only">タグを絞り込む</span>
        <input
          v-model="filter"
          type="search"
          placeholder="タグを絞り込む"
          class="min-w-0 grow bg-transparent text-sm outline-none"
        >
      </label>
    </div>
    <p
      v-if="state === 'loading'"
      class="font-mono text-sm text-muted"
    >
      読み込んでいます…
    </p>
    <p
      v-else-if="state === 'error'"
      class="text-fail"
      role="alert"
    >
      読み込めませんでした。
    </p>
    <p
      v-else-if="shown.length === 0"
      class="border border-dashed border-muted bg-white/72 p-8 text-center text-muted"
    >
      タグはまだありません。
    </p>
    <ul
      v-else
      class="flex flex-wrap gap-3 border border-ink bg-white p-5 sm:p-7"
    >
      <li
        v-for="t in shown"
        :key="t.tag"
      >
        <RouterLink
          :to="`/tags/${encodeURIComponent(t.tag)}`"
          class="flex items-baseline gap-2 border border-rule px-3 py-1.5 font-mono text-ink hover:border-ink hover:bg-paper"
          :style="{ fontSize: size(t.count) }"
        >
          #{{ t.tag }}<span class="text-xs text-muted">{{ t.count }}</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
