<script setup lang="ts">
// ノートの右の印。実験は結果のスタンプ(WATCH なら観察 ◯ 日目)、記事とメモは種類のバッジ。下書きは点線
import type { NoteKind, NoteStatus } from "../api";
import KindBadge from "./KindBadge.vue";
import Stamp from "./Stamp.vue";

defineProps<{ kind: NoteKind; status: NoteStatus | null; watchDays?: number | null; draft?: boolean }>();
</script>

<template>
  <span
    v-if="draft"
    class="inline-block -rotate-5 border-2 border-dotted border-muted px-2 py-0.5 font-mono text-[13px] font-bold tracking-widest whitespace-nowrap text-muted"
    data-testid="stamp-draft"
  >下書き</span>
  <Stamp
    v-else-if="kind === 'experiment' && status"
    :result="status"
    :day="status === 'watch' ? (watchDays ?? undefined) : undefined"
  />
  <KindBadge
    v-else-if="kind === 'article'"
    kind="post"
  />
  <KindBadge
    v-else
    kind="memo"
  />
</template>
