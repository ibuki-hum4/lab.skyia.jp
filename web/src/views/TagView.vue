<script setup lang="ts">
// /tags/:tag: そのタグのノートの一覧。種類のタブと、ほかのタグ
import { useTitle } from "@vueuse/core";
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api, type TagCount } from "../api";
import NoteList from "../components/NoteList.vue";
import TabBar from "../components/TabBar.vue";
import { useNoteList } from "../composables/useNoteList";

const props = defineProps<{ tag: string }>();
const route = useRoute();
const router = useRouter();
useTitle(computed(() => `#${props.tag} - skyia/lab`));

type Kind = "all" | "experiment" | "article" | "memo";
const KINDS = [
  { value: "all", label: "すべて" },
  { value: "experiment", label: "実験" },
  { value: "article", label: "記事" },
  { value: "memo", label: "メモ" },
] as const;
const kind = computed<Kind>({
  get: () => (KINDS.some((k) => k.value === route.query.kind) ? (route.query.kind as Kind) : "all"),
  set: (v) => void router.replace({ query: { kind: v === "all" ? undefined : v } }),
});

const list = useNoteList(() => ({ tag: props.tag, kind: kind.value === "all" ? undefined : kind.value }));
const tags = ref<TagCount[]>([]);
onMounted(async () => {
  const res = await api("GET /api/notes/tags");
  if (res.ok) tags.value = res.data;
});
const others = computed(() => tags.value.filter((t) => t.tag !== props.tag.toLowerCase()).slice(0, 30));
</script>

<template>
  <div class="flex flex-wrap items-start gap-8">
    <section class="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
      <div class="flex flex-col gap-2">
        <RouterLink
          to="/tags"
          class="font-mono text-xs font-bold tracking-[0.12em] text-accent hover:underline"
        >
          TAGS
        </RouterLink>
        <h1 class="font-mono text-3xl font-bold break-all sm:text-4xl">
          #{{ tag }}
        </h1>
      </div>
      <div class="flex flex-col">
        <div class="flex border-b-2 border-ink">
          <TabBar
            v-model="kind"
            :options="KINDS"
            label="種類"
          />
        </div>
        <NoteList
          :items="list.items.value"
          :state="list.state.value"
          :has-more="!!list.nextCursor.value"
          :loading-more="list.loadingMore.value"
          :empty="`#${tag} のノートはまだありません。`"
          @more="list.loadMore"
        />
      </div>
    </section>
    <aside class="flex flex-[1_1_260px] flex-col gap-3 border border-ink bg-white px-5 py-4.5">
      <h2 class="font-mono text-xs font-bold tracking-[0.12em] text-muted">
        OTHER TAGS
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="t in others"
          :key="t.tag"
          :to="`/tags/${encodeURIComponent(t.tag)}`"
          class="flex items-center gap-1.5 border border-rule px-2 py-1 font-mono text-[13px] text-ink hover:border-ink"
        >
          #{{ t.tag }} <span class="text-[11px] text-muted">{{ t.count }}</span>
        </RouterLink>
      </div>
    </aside>
  </div>
</template>
