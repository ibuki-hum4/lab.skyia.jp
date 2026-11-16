<script setup lang="ts">
// / と /following: みんなのノートの一覧。種類のタブ(?kind=)と、新着 / フォロー中の切り替え
import { useTitle } from "@vueuse/core";
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { loginUrl } from "../api";
import HomeSidebar from "../components/HomeSidebar.vue";
import NoteList from "../components/NoteList.vue";
import TabBar from "../components/TabBar.vue";
import { useMe } from "../composables/useMe";
import { useNoteList } from "../composables/useNoteList";

const props = withDefaults(defineProps<{ feed?: "new" | "following" }>(), { feed: "new" });
const route = useRoute();
const router = useRouter();
const { loggedIn, loaded } = useMe();
useTitle("skyia/lab - Skyia のみんなの実験ノート");

type Kind = "all" | "experiment" | "article" | "memo";
const KINDS = [
  { value: "all", label: "すべて" },
  { value: "experiment", label: "実験" },
  { value: "article", label: "記事" },
  { value: "memo", label: "メモ" },
] as const;

const kind = computed<Kind>({
  get: () => (KINDS.some((k) => k.value === route.query.kind) ? (route.query.kind as Kind) : "all"),
  set: (v) => void router.replace({ query: { ...route.query, kind: v === "all" ? undefined : v } }),
});

const following = computed(() => props.feed === "following");
const list = useNoteList(
  () =>
    following.value && !loggedIn.value
      ? null
      : { kind: kind.value === "all" ? undefined : kind.value, following: following.value ? "1" : undefined },
  { enabled: loaded },
);

const feedLink = (f: "new" | "following") => ({ path: f === "new" ? "/" : "/following", query: route.query });
</script>

<template>
  <div class="flex flex-col gap-10">
    <section class="flex flex-wrap items-stretch gap-8">
      <div class="flex min-w-0 flex-[999_1_520px] flex-col justify-center gap-3.5">
        <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
          SKYIA LAB · SHARED NOTEBOOK
        </p>
        <h1 class="text-3xl leading-tight font-bold tracking-tight sm:text-[46px]">
          Skyia のみんなの実験ノート
        </h1>
      </div>
      <aside
        aria-label="スタンプの見方"
        class="flex flex-[1_1_300px] flex-col gap-3.5 border border-ink bg-white px-5.5 py-5 shadow-block"
      >
        <p class="font-mono text-xs tracking-widest text-muted">
          LEGEND / スタンプの見方
        </p>
        <div
          v-for="row in [
            { label: 'PASS', cls: 'border-pass text-pass -rotate-4', text: '思ったとおりになった' },
            { label: 'FAIL', cls: 'border-fail text-fail -rotate-4', text: 'ならなかった(理由つき)' },
            { label: 'WATCH', cls: 'border-dashed border-watch text-watch -rotate-4', text: 'まだ結果待ち' },
          ]"
          :key="row.label"
          class="flex items-center gap-3.5"
        >
          <span
            class="min-w-16 border-2 px-2 py-0.75 text-center font-mono text-xs font-bold tracking-widest"
            :class="row.cls"
          >{{ row.label }}</span>
          <span class="text-sm text-[#3A3F45]">{{ row.text }}</span>
        </div>
        <div class="flex items-center gap-3.5 border-t border-dashed border-rule pt-3.5">
          <span class="min-w-16 border-2 border-ink bg-ink px-2 py-0.75 text-center font-mono text-xs font-bold tracking-widest text-white">記事</span>
          <span class="text-sm text-[#3A3F45]">わかったことをまとめたもの</span>
        </div>
        <div class="flex items-center gap-3.5">
          <span class="min-w-16 rotate-2 border-2 border-sticky bg-sticky px-2 py-0.75 text-center font-mono text-xs font-bold tracking-widest">メモ</span>
          <span class="text-sm text-[#3A3F45]">短い気づきや小ネタ</span>
        </div>
      </aside>
    </section>

    <div class="flex flex-wrap items-start gap-8">
      <section
        aria-label="ノートの一覧"
        class="flex min-w-0 flex-[999_1_640px] flex-col"
      >
        <div class="flex flex-wrap items-end gap-3 border-b-2 border-ink">
          <TabBar
            v-model="kind"
            :options="KINDS"
            label="種類"
          />
          <span class="grow" />
          <nav
            v-if="loggedIn"
            aria-label="並べ方"
            class="flex font-mono text-[13px]"
          >
            <RouterLink
              :to="feedLink('new')"
              class="flex min-h-11 items-center px-3"
              :class="!following ? 'font-bold text-ink underline decoration-2 underline-offset-4' : 'text-muted hover:text-ink'"
              :aria-current="!following ? 'page' : undefined"
            >
              新着
            </RouterLink>
            <RouterLink
              :to="feedLink('following')"
              class="flex min-h-11 items-center px-3"
              :class="following ? 'font-bold text-ink underline decoration-2 underline-offset-4' : 'text-muted hover:text-ink'"
              :aria-current="following ? 'page' : undefined"
            >
              フォロー中
            </RouterLink>
          </nav>
        </div>

        <p
          v-if="following && loaded && !loggedIn"
          class="border-b border-rule bg-white/72 px-1 py-8 text-[15px]"
        >
          フォロー中の人のノートを見るには、<a
            :href="loginUrl(route.fullPath)"
            class="text-accent underline"
          >ログイン</a>してください。
        </p>
        <NoteList
          v-else
          :items="list.items.value"
          :state="list.state.value"
          :has-more="!!list.nextCursor.value"
          :loading-more="list.loadingMore.value"
          :empty="following ? 'フォロー中の人のノートは、まだありません。' : 'まだノートがありません。'"
          @more="list.loadMore"
        />
      </section>

      <HomeSidebar />
    </div>
  </div>
</template>
