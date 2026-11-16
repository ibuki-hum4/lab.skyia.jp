<script setup lang="ts">
// LINEAGE / 系譜。派生元(上)→ この実験 → 派生したもの(下、段ごとに字下げ)
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { Lineage, LineageNode, NoteRef } from "../api";
import { noteUrl, STATUS_LABEL } from "../lib/notes";

const props = defineProps<{ lineage: Lineage }>();

/** 子孫を、字下げの深さつきの 1 列にする */
const descendants = computed(() => {
  const out: { node: NoteRef; depth: number }[] = [];
  const walk = (nodes: LineageNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(props.lineage.children, 1);
  return out;
});

const label = (n: NoteRef) => (n.author.handle === props.lineage.self.author.handle ? n.code : `${n.author.handle} / ${n.code}`);
const tone = (n: NoteRef) => ({ pass: "text-pass", fail: "text-fail", watch: "text-watch" })[n.status ?? "watch"];
</script>

<template>
  <section
    aria-labelledby="lineage-title"
    class="flex flex-col gap-3.5 border border-ink bg-white px-5 py-4.5"
  >
    <h2
      id="lineage-title"
      class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
    >
      LINEAGE / 系譜
    </h2>
    <ol class="relative flex flex-col gap-4 pl-6">
      <span
        aria-hidden="true"
        class="absolute top-2.5 bottom-2.5 left-1.5 w-0.5 bg-rule"
      />
      <li
        v-for="a in lineage.ancestors"
        :key="a.id"
      >
        <RouterLink
          :to="noteUrl(a)"
          class="group relative flex flex-col gap-0.5 text-ink"
        >
          <span
            aria-hidden="true"
            class="absolute top-1.25 -left-5.75 size-3 border-2 border-muted bg-white"
          />
          <span class="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span class="font-bold text-muted">{{ label(a) }}</span>
            <span
              v-if="a.status"
              class="font-bold"
              :class="tone(a)"
            >{{ STATUS_LABEL[a.status] }}</span>
            <span class="text-muted">派生元</span>
          </span>
          <span class="text-[13px] leading-relaxed text-[#3A3F45] group-hover:underline">{{ a.title }}</span>
        </RouterLink>
      </li>
      <li
        class="relative flex flex-col gap-0.5"
        aria-current="page"
      >
        <span
          aria-hidden="true"
          class="absolute top-0.75 -left-6.25 size-4 border-2 border-ink bg-accent"
        />
        <span class="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span class="font-bold text-accent">{{ lineage.self.code }}</span>
          <span
            v-if="lineage.self.status"
            class="font-bold"
            :class="tone(lineage.self)"
          >{{ STATUS_LABEL[lineage.self.status] }}</span>
          <span class="bg-ink px-1.25 text-white">この実験</span>
        </span>
        <span class="text-[13px] leading-relaxed font-bold">{{ lineage.self.title }}</span>
      </li>
      <li
        v-for="d in descendants"
        :key="d.node.id"
        :style="{ marginLeft: `${d.depth * 20}px` }"
      >
        <RouterLink
          :to="noteUrl(d.node)"
          class="group relative flex flex-col gap-0.5 text-ink"
        >
          <span
            aria-hidden="true"
            class="absolute -top-2.5 -left-9.5 h-5 w-6.5 border-b-2 border-l-2 border-dashed border-watch"
          />
          <span
            aria-hidden="true"
            class="absolute top-1.25 -left-3.25 size-3 border-2 border-dashed border-watch bg-white"
          />
          <span class="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span class="font-bold text-muted">{{ label(d.node) }}</span>
            <span
              v-if="d.node.status"
              class="font-bold"
              :class="tone(d.node)"
            >{{ STATUS_LABEL[d.node.status] }}</span>
          </span>
          <span class="text-[13px] leading-relaxed text-[#3A3F45] group-hover:underline">{{ d.node.title }}</span>
        </RouterLink>
      </li>
    </ol>
    <p
      v-if="lineage.ancestors.length === 0 && descendants.length === 0"
      class="text-xs text-muted"
    >
      派生元も、派生したものもまだありません。
    </p>
  </section>
</template>
