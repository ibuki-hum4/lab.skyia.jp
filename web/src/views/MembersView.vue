<script setup lang="ts">
// /members: ハンドルのある人の一覧
import { useTitle } from "@vueuse/core";
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, type Member } from "../api";
import Avatar from "../components/Avatar.vue";

useTitle("メンバー - skyia/lab");
const members = ref<Member[]>([]);
const state = ref<"loading" | "ok" | "error">("loading");

onMounted(async () => {
  const res = await api("GET /api/members");
  if (res.ok) {
    members.value = res.data;
    state.value = "ok";
  } else state.value = "error";
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
        MEMBERS
      </p>
      <h1 class="text-3xl font-bold sm:text-4xl">
        メンバー
      </h1>
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
    <ul
      v-else
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="m in members"
        :key="m.handle"
      >
        <RouterLink
          :to="`/@${m.handle}`"
          class="group flex h-full gap-4 border border-ink bg-white p-4.5 text-ink hover:shadow-block"
        >
          <Avatar
            :name="m.displayName"
            :handle="m.handle"
            :src="m.avatar"
            size="md"
            class="size-12!"
          />
          <span class="flex min-w-0 flex-col gap-1">
            <span class="font-bold break-words group-hover:underline">{{ m.displayName || m.handle }}の実験ノート</span>
            <span class="font-mono text-xs text-muted">@{{ m.handle }} · {{ m.noteCount }} 件</span>
            <span
              v-if="m.bio"
              class="line-clamp-2 text-sm leading-relaxed text-[#3A3F45]"
            >{{ m.bio }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
