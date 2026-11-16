<script setup lang="ts">
// タグの入力。Enter か , で足し、× か Backspace で消す。# は取り、小文字にそろえる。10 個まで
import { ref } from "vue";
import IconX from "~icons/lucide/x";
import { LIMITS } from "../api";

const tags = defineModel<string[]>({ required: true });
defineProps<{ id: string }>();
const text = ref("");
const error = ref("");

function normalize(raw: string): string | null {
  const t = raw.normalize("NFKC").trim().replace(/^#+/, "").toLowerCase();
  if (!t) return null;
  if (t.length > LIMITS.tag || !/^[\p{L}\p{N}_.+-]+$/u.test(t)) {
    error.value = "タグには、文字・数字と _ - . + だけが使えます(32 文字まで)";
    return null;
  }
  return t;
}

function add() {
  error.value = "";
  for (const part of text.value.split(/[,、\s]+/)) {
    const t = normalize(part);
    if (!t || tags.value.includes(t)) continue;
    if (tags.value.length >= LIMITS.tagsPerNote) {
      error.value = `タグは ${LIMITS.tagsPerNote} 個までです`;
      break;
    }
    tags.value = [...tags.value, t];
  }
  if (!error.value) text.value = "";
}

function onKey(e: KeyboardEvent) {
  if (e.isComposing) return; // 日本語の変換中は足さない
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    add();
  } else if (e.key === "Backspace" && text.value === "" && tags.value.length > 0) {
    tags.value = tags.value.slice(0, -1);
  }
}

const remove = (t: string) => (tags.value = tags.value.filter((x) => x !== t));
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex min-h-11 flex-wrap items-center gap-1.5 border border-ink bg-white px-2 py-1">
      <span
        v-for="t in tags"
        :key="t"
        class="inline-flex items-center gap-1 bg-[#E7EAEE] py-0.75 pr-1 pl-2 font-mono text-[13px]"
      >
        #{{ t }}
        <button
          type="button"
          class="cursor-pointer p-0.5 hover:text-fail"
          :aria-label="`#${t} を外す`"
          @click="remove(t)"
        >
          <IconX
            class="size-3.5"
            aria-hidden="true"
          />
        </button>
      </span>
      <input
        :id="id"
        v-model="text"
        type="text"
        placeholder="タグを追加"
        class="min-w-20 flex-[1_1_120px] bg-transparent text-sm outline-none"
        @keydown="onKey"
        @blur="text && add()"
      >
    </div>
    <p
      v-if="error"
      class="text-xs text-fail"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
