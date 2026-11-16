<script setup lang="ts">
// ホームの右: 今週の FAIL・タグ・ノートブック(よく書いている人)・以前の記事(content/)
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, type Member, type NoteSummary, type PostMeta, type TagCount } from "../api";
import { noteUrl } from "../lib/notes";
import Avatar from "./Avatar.vue";

const fails = ref<NoteSummary[]>([]);
const tags = ref<TagCount[]>([]);
const members = ref<Member[]>([]);
const posts = ref<PostMeta[]>([]);

async function load() {
  const [f, t, m, p] = await Promise.all([
    api("GET /api/notes/fails"),
    api("GET /api/notes/tags"),
    api("GET /api/members", { query: { sort: "active", limit: 5 } }),
    api("GET /api/posts"),
  ]);
  if (f.ok) fails.value = f.data;
  if (t.ok) tags.value = t.data.slice(0, 16);
  if (m.ok) members.value = m.data.filter((x) => x.noteCount > 0);
  if (p.ok) posts.value = p.data;
}
onMounted(load);
</script>

<template>
  <aside class="flex flex-[1_1_260px] flex-col gap-6">
    <section
      aria-labelledby="fails-title"
      class="flex flex-col gap-3.5 border-2 border-fail bg-white px-5 py-4.5 shadow-[6px_6px_0_var(--color-fail)]"
    >
      <div class="flex items-baseline justify-between gap-2">
        <h2
          id="fails-title"
          class="font-mono text-xs font-bold tracking-[0.12em] text-fail"
        >
          THIS WEEK'S FAIL
        </h2>
        <span class="text-xs text-muted">今週の FAIL</span>
      </div>
      <p
        v-if="fails.length === 0"
        class="text-sm text-muted"
      >
        今週はまだありません。
      </p>
      <RouterLink
        v-for="n in fails"
        :key="n.id"
        :to="noteUrl(n)"
        class="group flex items-start gap-3 text-ink"
      >
        <span class="mt-0.75 flex-none -rotate-5 border-2 border-fail px-1.5 py-px font-mono text-[11px] font-bold tracking-widest text-fail">FAIL</span>
        <span class="flex flex-col gap-0.5">
          <span class="text-sm leading-relaxed font-bold group-hover:underline">{{ n.title }}</span>
          <span class="text-xs text-muted">{{ n.author.displayName || n.author.handle }}<template v-if="n.replicationCount > 0"> · 追試 {{ n.replicationCount }}</template></span>
        </span>
      </RouterLink>
    </section>

    <section
      aria-labelledby="tags-title"
      class="flex flex-col gap-3 border border-ink bg-white px-5 py-4.5"
    >
      <div class="flex items-baseline justify-between">
        <h2
          id="tags-title"
          class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
        >
          TAGS
        </h2>
        <RouterLink
          to="/tags"
          class="text-xs text-accent hover:underline"
        >
          すべて
        </RouterLink>
      </div>
      <p
        v-if="tags.length === 0"
        class="text-sm text-muted"
      >
        まだありません。
      </p>
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
    </section>

    <section
      aria-labelledby="notebooks-title"
      class="flex flex-col gap-3 border border-ink bg-white px-5 py-4.5"
    >
      <div class="flex items-baseline justify-between">
        <h2
          id="notebooks-title"
          class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
        >
          NOTEBOOKS
        </h2>
        <RouterLink
          to="/members"
          class="text-xs text-accent hover:underline"
        >
          メンバー
        </RouterLink>
      </div>
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
        <span class="flex flex-col">
          <span class="text-sm font-bold group-hover:underline">{{ m.displayName || m.handle }}の実験ノート</span>
          <span class="font-mono text-xs text-muted">{{ m.noteCount }} 件</span>
        </span>
      </RouterLink>
    </section>

    <section
      v-if="posts.length > 0"
      aria-labelledby="archive-title"
      class="flex flex-col gap-2.5 border border-dashed border-muted bg-white/80 px-5 py-4"
    >
      <h2
        id="archive-title"
        class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
      >
        ARCHIVE / 以前の記事
      </h2>
      <RouterLink
        v-for="p in posts"
        :key="p.slug"
        :to="`/posts/${p.slug}`"
        class="text-sm text-ink hover:text-accent hover:underline"
      >
        {{ p.title }}
      </RouterLink>
    </section>
  </aside>
</template>
