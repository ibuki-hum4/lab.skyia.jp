<script setup lang="ts">
// ノートの一覧の中身(読み込み中・空・行・もっと見る)。上のタブは呼ぶ側に置く
import type { NoteSummary } from "../api";
import NoteRow from "./NoteRow.vue";

defineProps<{
  items: NoteSummary[];
  state: "loading" | "ok" | "error";
  hasMore: boolean;
  loadingMore: boolean;
  variant?: "feed" | "notebook";
  empty?: string;
}>();
defineEmits<{ more: [] }>();
</script>

<template>
  <p
    v-if="state === 'loading'"
    class="border-b border-rule bg-white/72 px-1 py-8 font-mono text-sm text-muted"
  >
    読み込んでいます…
  </p>
  <p
    v-else-if="state === 'error'"
    class="border-b border-rule bg-white/72 px-1 py-8 text-fail"
    role="alert"
  >
    読み込めませんでした。時間をおいてもう一度お試しください。
  </p>
  <p
    v-else-if="items.length === 0"
    class="border-b border-dashed border-muted bg-white/72 px-4 py-10 text-center text-[15px] text-muted"
  >
    {{ empty ?? "まだ何もありません。" }}
  </p>
  <template v-else>
    <NoteRow
      v-for="n in items"
      :key="n.id"
      :note="n"
      :variant="variant"
    />
    <div
      v-if="hasMore"
      class="flex justify-center pt-7"
    >
      <button
        type="button"
        class="h-11 cursor-pointer border-2 border-ink bg-white px-7 text-sm font-bold hover:bg-paper disabled:cursor-wait disabled:opacity-60"
        :disabled="loadingMore"
        @click="$emit('more')"
      >
        {{ loadingMore ? "読み込んでいます…" : "もっと見る" }}
      </button>
    </div>
  </template>
</template>
