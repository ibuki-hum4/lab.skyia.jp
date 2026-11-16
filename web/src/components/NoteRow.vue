<script setup lang="ts">
// 一覧の 1 行。
//   feed:     ホーム・検索・タグ(作者の行・抜き書き・いいねとコメントの数・追試の数)
//   notebook: 人のページ(左に EXP-006 と日付)
// メモは付箋で出す
import { computed } from "vue";
import { RouterLink } from "vue-router";
import IconHeart from "~icons/lucide/heart";
import IconMessage from "~icons/lucide/message-circle";
import IconRepeat from "~icons/lucide/repeat-2";
import type { NoteSummary } from "../api";
import { fmtDate, noteUrl } from "../lib/notes";
import Avatar from "./Avatar.vue";
import NoteStamp from "./NoteStamp.vue";
import StickyNote from "./StickyNote.vue";

const props = withDefaults(defineProps<{ note: NoteSummary; variant?: "feed" | "notebook" }>(), { variant: "feed" });

const url = computed(() => noteUrl(props.note));
const date = computed(() => fmtDate(props.note.publishedAt ?? props.note.updatedAt));
const originLabel = computed(() => {
  const o = props.note.origin;
  if (!o) return "";
  return `@${o.note.author.handle} の ${o.note.code} ${o.kind === "replication" ? "の追試" : "から派生"}`;
});
</script>

<template>
  <!-- メモ: 付箋 -->
  <div
    v-if="note.kind === 'memo' && !note.draft"
    class="border-b border-rule bg-white/72 px-1 pt-6 pb-6.5"
  >
    <StickyNote>
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
        <span class="font-mono text-[11px] font-bold tracking-[0.14em] text-[#6B5300]">{{ variant === "notebook" ? note.code : "MEMO" }}</span>
        <RouterLink
          v-if="variant === 'feed'"
          :to="`/@${note.author.handle}`"
          class="flex items-center gap-1.5 font-bold text-ink hover:underline"
        >
          <Avatar
            :name="note.author.displayName"
            :handle="note.author.handle"
            :src="note.author.avatar"
            size="xs"
          />{{ note.author.displayName || note.author.handle }}
        </RouterLink>
        <span class="font-mono text-xs text-[#5C4A00]">{{ date }}</span>
        <span
          v-if="note.hidden"
          class="border border-fail px-1.5 font-mono text-xs text-fail"
        >非表示</span>
      </div>
      <RouterLink
        :to="url"
        class="text-lg leading-normal font-bold text-ink hover:underline"
      >
        {{ note.title }}
      </RouterLink>
      <p
        v-if="variant === 'feed' && note.excerpt"
        class="text-sm leading-[1.8] text-[#2E2A16]"
      >
        {{ note.excerpt }}
      </p>
      <div class="flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-xs">
        <RouterLink
          v-for="t in note.tags"
          :key="t"
          :to="`/tags/${encodeURIComponent(t)}`"
          class="text-[#4A3C00] hover:underline"
        >
          #{{ t }}
        </RouterLink>
        <span class="text-[#5C4A00]">♡ {{ note.likeCount }}</span>
      </div>
    </StickyNote>
  </div>

  <!-- 実験・記事(と、メモの下書き) -->
  <article
    v-else
    class="flex flex-wrap gap-x-6 gap-y-2.5 border-b border-rule bg-white/72 px-1"
    :class="variant === 'feed' ? 'py-5.5' : 'py-5'"
  >
    <div
      v-if="variant === 'notebook'"
      class="flex w-26 flex-none flex-col gap-1 font-mono"
    >
      <span class="text-[13px] font-bold text-accent">{{ note.code }}</span>
      <span class="text-xs text-muted">{{ date }}</span>
    </div>

    <div class="flex min-w-0 flex-[999_1_320px] flex-col gap-2">
      <div
        v-if="variant === 'feed'"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]"
      >
        <RouterLink
          :to="`/@${note.author.handle}`"
          class="flex items-center gap-2 font-bold text-ink hover:underline"
        >
          <Avatar
            :name="note.author.displayName"
            :handle="note.author.handle"
            :src="note.author.avatar"
            size="xs"
          />
          {{ note.author.displayName || note.author.handle }}<span class="font-normal text-muted">の実験ノート</span>
        </RouterLink>
        <span class="font-mono text-xs text-muted">{{ date }}</span>
      </div>
      <RouterLink
        :to="url"
        class="leading-normal font-bold break-words text-ink hover:text-accent hover:underline"
        :class="variant === 'feed' ? 'text-xl' : 'text-[19px]'"
      >
        {{ note.title }}
      </RouterLink>
      <p
        v-if="variant === 'feed' && note.excerpt"
        class="text-sm leading-[1.8] break-words text-[#3A3F45]"
      >
        {{ note.excerpt }}
      </p>
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 font-mono text-xs">
        <RouterLink
          v-for="t in note.tags"
          :key="t"
          :to="`/tags/${encodeURIComponent(t)}`"
          class="text-accent hover:text-ink hover:underline"
        >
          #{{ t }}
        </RouterLink>
        <template v-if="variant === 'feed'">
          <span
            class="flex items-center gap-1 text-muted"
            :aria-label="`いいね ${note.likeCount}`"
          ><IconHeart
            class="size-3.25"
            aria-hidden="true"
          />{{ note.likeCount }}</span>
          <span
            class="flex items-center gap-1 text-muted"
            :aria-label="`コメント ${note.commentCount}`"
          ><IconMessage
            class="size-3.25"
            aria-hidden="true"
          />{{ note.commentCount }}</span>
          <span
            v-if="note.replicationCount > 0"
            class="flex items-center gap-1 border border-ink px-1.5 text-ink"
            data-testid="replication-chip"
          ><IconRepeat
            class="size-3"
            aria-hidden="true"
          />追試 {{ note.replicationCount }}</span>
        </template>
        <span
          v-else
          class="text-muted"
        >♡ {{ note.likeCount }} · コメント {{ note.commentCount }}<template v-if="note.replicationCount > 0"> · 追試 {{ note.replicationCount }}</template></span>
        <span
          v-if="originLabel"
          class="text-muted"
        >{{ originLabel }}</span>
        <span
          v-if="note.hidden"
          class="border border-fail px-1.5 text-fail"
        >非表示</span>
      </div>
    </div>

    <div
      class="flex w-30 flex-none flex-col items-end gap-3"
      :class="variant === 'feed' ? 'sm:pt-7.5' : ''"
    >
      <NoteStamp
        :kind="note.kind"
        :status="note.status"
        :watch-days="note.watchDays"
        :draft="note.draft"
      />
    </div>
  </article>
</template>
