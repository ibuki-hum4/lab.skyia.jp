<script setup lang="ts">
// /search?q=: ノート(タイトルと本文)・タグ・メンバーから探す
import { useTitle } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api, type Member, type NoteSummary, type TagCount } from "../api";
import Avatar from "../components/Avatar.vue";
import NoteList from "../components/NoteList.vue";

const route = useRoute();
const router = useRouter();
const q = computed(() => (typeof route.query.q === "string" ? route.query.q : ""));
const input = ref(q.value);
useTitle(computed(() => (q.value ? `「${q.value}」の検索 - skyia/lab` : "検索 - skyia/lab")));

const notes = ref<NoteSummary[]>([]);
const nextCursor = ref<string | null>(null);
const tags = ref<TagCount[]>([]);
const members = ref<Member[]>([]);
const state = ref<"idle" | "loading" | "ok" | "error">("idle");
const loadingMore = ref(false);

async function search() {
  input.value = q.value;
  if (!q.value.trim()) {
    state.value = "idle";
    notes.value = [];
    tags.value = [];
    members.value = [];
    return;
  }
  state.value = "loading";
  const res = await api("GET /api/search", { query: { q: q.value } });
  if (!res.ok) {
    state.value = "error";
    return;
  }
  notes.value = res.data.notes.items;
  nextCursor.value = res.data.notes.nextCursor;
  tags.value = res.data.tags;
  members.value = res.data.members;
  state.value = "ok";
}
watch(q, search, { immediate: true });

async function more() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  const res = await api("GET /api/search", { query: { q: q.value, cursor: nextCursor.value } });
  loadingMore.value = false;
  if (res.ok) {
    notes.value = [...notes.value, ...res.data.notes.items];
    nextCursor.value = res.data.notes.nextCursor;
  }
}

function submit() {
  void router.push({ path: "/search", query: input.value.trim() ? { q: input.value.trim() } : {} });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
        SEARCH
      </p>
      <h1 class="text-3xl font-bold break-words sm:text-4xl">
        {{ q ? `「${q}」の検索` : "検索" }}
      </h1>
      <form
        role="search"
        class="flex max-w-xl gap-2"
        @submit.prevent="submit"
      >
        <label
          for="search-page"
          class="sr-only"
        >検索語</label>
        <input
          id="search-page"
          v-model="input"
          type="search"
          placeholder="実験・タグ・メンバーを検索"
          class="h-11 min-w-0 grow border-2 border-ink bg-white px-3"
        >
        <button
          type="submit"
          class="h-11 cursor-pointer border-2 border-ink bg-ink px-5 text-sm font-bold text-white"
        >
          探す
        </button>
      </form>
    </div>

    <template v-if="state === 'ok'">
      <section
        v-if="members.length > 0 || tags.length > 0"
        class="flex flex-wrap gap-6"
      >
        <div
          v-if="members.length > 0"
          class="flex flex-[1_1_320px] flex-col gap-3 border border-ink bg-white px-5 py-4.5"
        >
          <h2 class="font-mono text-xs font-bold tracking-[0.12em] text-muted">
            MEMBERS
          </h2>
          <RouterLink
            v-for="m in members"
            :key="m.handle"
            :to="`/@${m.handle}`"
            class="group flex items-center gap-2.5 text-ink"
          >
            <Avatar
              :name="m.displayName"
              :handle="m.handle"
              :src="m.avatar"
              size="sm"
            />
            <span class="text-sm font-bold group-hover:underline">{{ m.displayName || m.handle }}</span>
            <span class="font-mono text-xs text-muted">@{{ m.handle }}</span>
          </RouterLink>
        </div>
        <div
          v-if="tags.length > 0"
          class="flex flex-[1_1_320px] flex-col gap-3 border border-ink bg-white px-5 py-4.5"
        >
          <h2 class="font-mono text-xs font-bold tracking-[0.12em] text-muted">
            TAGS
          </h2>
          <div class="flex flex-wrap gap-2">
            <RouterLink
              v-for="t in tags"
              :key="t.tag"
              :to="`/tags/${encodeURIComponent(t.tag)}`"
              class="flex items-center gap-1.5 border border-rule px-2 py-1 font-mono text-[13px] text-ink hover:border-ink"
            >
              #{{ t.tag }} <span class="text-[11px] text-muted">{{ t.count }}</span>
            </RouterLink>
          </div>
        </div>
      </section>

      <section
        aria-label="ノート"
        class="flex flex-col"
      >
        <h2 class="border-b-2 border-ink pb-2 font-mono text-xs font-bold tracking-[0.12em] text-muted">
          NOTES
        </h2>
        <NoteList
          :items="notes"
          state="ok"
          :has-more="!!nextCursor"
          :loading-more="loadingMore"
          :empty="`「${q}」を含むノートは見つかりませんでした。`"
          @more="more"
        />
      </section>
    </template>
    <p
      v-else-if="state === 'loading'"
      class="font-mono text-sm text-muted"
    >
      探しています…
    </p>
    <p
      v-else-if="state === 'error'"
      class="text-fail"
      role="alert"
    >
      探せませんでした。時間をおいてもう一度お試しください。
    </p>
    <p
      v-else
      class="text-sm text-muted"
    >
      タイトルと本文から探します。2 文字以下の語は、少し時間がかかることがあります。
    </p>
  </div>
</template>
