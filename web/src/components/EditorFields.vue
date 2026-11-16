<script setup lang="ts">
// エディタの上の欄: タイトル・種類・状態(実験のときだけ)・タグ・一覧での見え方
import { computed } from "vue";
import { LIMITS, type NoteKind, type NoteStatus } from "../api";
import NoteStamp from "./NoteStamp.vue";
import TagInput from "./TagInput.vue";

const props = withDefaults(defineProps<{ kindLocked?: boolean; watchDays?: number | null }>(), {
  kindLocked: false,
  watchDays: null,
});
const title = defineModel<string>("title", { required: true });
const kind = defineModel<NoteKind>("kind", { required: true });
const status = defineModel<NoteStatus>("status", { required: true });
const tags = defineModel<string[]>("tags", { required: true });

const KINDS = [
  { value: "experiment", label: "実験" },
  { value: "article", label: "記事" },
  { value: "memo", label: "メモ" },
] as const;
const STATUSES = [
  { value: "pass", label: "PASS", on: "bg-pass text-white", off: "text-pass" },
  { value: "fail", label: "FAIL", on: "bg-fail text-white", off: "text-fail" },
  { value: "watch", label: "WATCH", on: "bg-watch text-white", off: "text-watch" },
] as const;

const preview = computed(() => ({
  kind: kind.value,
  status: kind.value === "experiment" ? status.value : null,
  days: kind.value === "experiment" && status.value === "watch" ? (props.watchDays ?? 1) : null,
}));
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <label class="flex flex-col gap-1.5">
      <span class="font-mono text-xs tracking-widest text-muted">TITLE / タイトル</span>
      <input
        v-model="title"
        type="text"
        required
        :maxlength="LIMITS.title"
        class="border-2 border-ink bg-white px-3.5 py-2.5 text-xl font-bold sm:text-[26px]"
        data-testid="title"
      >
    </label>
    <div class="flex flex-wrap items-end gap-x-7 gap-y-3.5">
      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 font-mono text-xs tracking-widest text-muted">
          TYPE / 種類<template v-if="kindLocked">
            (あとから変えられません)
          </template>
        </legend>
        <div class="flex pl-0.5">
          <label
            v-for="k in KINDS"
            :key="k.value"
            class="-ml-0.5 flex h-11 items-center gap-2 border-2 border-ink px-4 text-sm font-bold"
            :class="[
              kind === k.value ? 'bg-ink text-white' : 'bg-white text-ink',
              kindLocked ? 'cursor-not-allowed' : 'cursor-pointer',
              kindLocked && kind !== k.value ? 'opacity-40' : '',
            ]"
          >
            <input
              v-model="kind"
              type="radio"
              name="kind"
              :value="k.value"
              :disabled="kindLocked"
              class="accent-ink"
              :data-testid="`kind-${k.value}`"
            >
            {{ k.label }}
          </label>
        </div>
      </fieldset>

      <fieldset
        v-if="kind === 'experiment'"
        class="flex flex-col gap-1.5"
        data-testid="status-field"
      >
        <legend class="mb-1.5 font-mono text-xs tracking-widest text-muted">
          STATUS / 結果
        </legend>
        <div class="flex pl-0.5">
          <label
            v-for="s in STATUSES"
            :key="s.value"
            class="-ml-0.5 flex h-11 cursor-pointer items-center gap-2 border-2 border-ink px-4 font-mono text-sm font-bold tracking-widest"
            :class="status === s.value ? s.on : ['bg-white', s.off]"
          >
            <input
              v-model="status"
              type="radio"
              name="status"
              :value="s.value"
              class="accent-ink"
              :data-testid="`status-${s.value}`"
            >
            {{ s.label }}
          </label>
        </div>
      </fieldset>

      <div class="flex flex-[1_1_320px] flex-col gap-1.5">
        <label
          for="editor-tags"
          class="font-mono text-xs tracking-widest text-muted"
        >TAGS / タグ(Enter で追加)</label>
        <TagInput
          id="editor-tags"
          v-model="tags"
        />
      </div>

      <div
        class="flex items-center gap-2.5 pb-1.5"
        data-testid="stamp-preview"
      >
        <span class="font-mono text-xs text-muted">一覧での見え方</span>
        <span class="origin-left scale-110">
          <NoteStamp
            :kind="preview.kind"
            :status="preview.status"
            :watch-days="preview.days"
          />
        </span>
      </div>
    </div>
  </div>
</template>
