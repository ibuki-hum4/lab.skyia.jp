<script setup lang="ts">
// /posts/:slug: content/ の記事(以前の記事)。ノートとは別のもの。並べ方は PR の本文の案で決める
import { useTitle } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { api, type PostMeta, type TocItem } from "../api";
import KindBadge from "../components/KindBadge.vue";
import Stamp from "../components/Stamp.vue";

const props = defineProps<{ slug: string }>();
type Post = PostMeta & { html: string; toc: TocItem[]; likes: number };

const post = ref<Post | null>(null);
const state = ref<"loading" | "ok" | "not_found" | "error">("loading");
const likes = ref(0);
const likeMessage = ref("");
useTitle(computed(() => (post.value ? `${post.value.title} - skyia/lab` : "skyia/lab")));

const RESULT = { success: "pass", failure: "fail", observing: "watch" } as const;

async function load() {
  state.value = "loading";
  const res = await api("GET /api/posts/:slug", { params: { slug: props.slug } });
  if (res.ok) {
    post.value = res.data;
    likes.value = res.data.likes;
    state.value = "ok";
  } else {
    state.value = res.status === 404 ? "not_found" : "error";
  }
}
watch(() => props.slug, load, { immediate: true });

async function like() {
  const res = await api("POST /api/posts/:slug/like", { params: { slug: props.slug } });
  if (res.ok) {
    likes.value = res.data.likes;
    likeMessage.value = "ありがとう!";
  } else if (res.status === 429) {
    likeMessage.value = "少し待ってね";
  }
}
</script>

<template>
  <p
    v-if="state === 'loading'"
    class="font-mono text-sm text-muted"
  >
    読み込んでいます…
  </p>
  <section
    v-else-if="state === 'not_found'"
    class="border border-ink bg-white p-8 text-center"
  >
    <h1 class="text-lg font-bold">
      記事が見つかりません
    </h1>
    <RouterLink
      to="/"
      class="mt-4 inline-block text-accent underline"
    >
      新着へ戻る
    </RouterLink>
  </section>
  <p
    v-else-if="state === 'error'"
    class="text-fail"
    role="alert"
  >
    読み込めませんでした。
  </p>
  <div
    v-else-if="post"
    class="flex flex-wrap items-start gap-8"
  >
    <article class="min-w-0 flex-[999_1_640px] border border-ink bg-white shadow-block-lg">
      <header class="flex flex-col gap-4 border-b-2 border-ink px-5 py-7 sm:px-12">
        <p class="font-mono text-xs font-bold tracking-[0.12em] text-muted">
          ARCHIVE / 以前の記事
        </p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[13px]">
          <span class="text-muted">{{ post.date }}</span>
          <span
            v-for="t in post.tags"
            :key="t"
            class="text-accent"
          >#{{ t }}</span>
        </div>
        <div class="flex flex-wrap items-start gap-6">
          <h1 class="grow basis-80 text-[26px] leading-snug font-bold sm:text-4xl">
            {{ post.title }}
          </h1>
          <Stamp
            v-if="post.type === 'experiment' && post.status"
            :result="RESULT[post.status]"
          />
          <KindBadge
            v-else
            kind="post"
          />
        </div>
      </header>
      <!-- サーバーが Markdown から作った HTML(生の HTML は通していない) -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="note-body px-5 py-8 sm:px-12"
        v-html="post.html"
      />
      <!-- eslint-enable vue/no-v-html -->
      <footer class="flex items-center gap-4 border-t-2 border-ink px-5 py-5 sm:px-12">
        <button
          type="button"
          class="h-11 cursor-pointer border-2 border-ink bg-white px-4 text-sm font-bold hover:bg-paper"
          @click="like"
        >
          ♡ いいね <span class="font-mono">{{ likes }}</span>
        </button>
        <span
          v-if="likeMessage"
          class="text-sm text-muted"
          role="status"
        >{{ likeMessage }}</span>
      </footer>
    </article>
    <nav
      v-if="post.toc.length > 0"
      aria-label="目次"
      class="flex flex-[1_1_240px] flex-col gap-1 border border-ink bg-white px-5 py-4.5"
    >
      <h2 class="mb-2 font-mono text-xs font-bold tracking-[0.12em] text-muted">
        CONTENTS
      </h2>
      <a
        v-for="t in post.toc"
        :key="t.id"
        :href="`#${t.id}`"
        class="py-1 text-sm text-ink hover:text-accent"
        :style="{ paddingLeft: `${(t.depth - 2) * 12}px` }"
      >{{ t.text }}</a>
    </nav>
  </div>
</template>
