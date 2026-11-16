<script setup lang="ts">
// /new と /@:handle/:code/edit: エディタ。新規作成と編集の両方。
//   ?kind=memo などで種類を、?replicationOf=<id> / ?derivedFrom=<id> で追試・派生の元を決めて開ける
//   Markdown と、横にプレビュー(サーバーで HTML にしたもの)。下書き保存と公開
//   書きかけで離れようとしたら確かめる
import { useDebounceFn, useEventListener, useTitle } from "@vueuse/core";
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from "vue-router";
import IconArrowLeft from "~icons/lucide/arrow-left";
import IconCode from "~icons/lucide/code-xml";
import IconLink from "~icons/lucide/link";
import { api, LIMITS, type LinkKind, type NoteDetail, type NoteKind, type NoteStatus } from "../api";
import EditorFields from "../components/EditorFields.vue";
import Stamp from "../components/Stamp.vue";
import { useMe } from "../composables/useMe";
import { errorMessage, fmtTime, noteUrl } from "../lib/notes";

const props = defineProps<{ handle?: string; code?: string }>();
const route = useRoute();
const router = useRouter();
const { me } = useMe();

const EXPERIMENT_TEMPLATE = "## 目的\n\n\n## 仮説\n\n\n## 方法\n\n\n## 結果\n\n\n## 考察\n\n";
const REPLICATION_TEMPLATE = "## 条件\n\n元の実験と同じ条件でやり直しました。違うところ:\n\n- \n\n## 結果\n\n\n## 考察\n\n";

// ---- 中身 ----
const title = ref("");
const kind = ref<NoteKind>("experiment");
const status = ref<NoteStatus>("watch");
const tags = ref<string[]>([]);
const body = ref("");

// ---- 保存の状態 ----
const noteId = ref<string | null>(null);
const existing = ref<NoteDetail | null>(null);
const savedAt = ref<Date | null>(null);
const saving = ref(false);
const error = ref("");
const state = ref<"loading" | "ok" | "forbidden" | "not_found">("loading");

// ---- 追試・派生の元 ----
const link = ref<{ kind: LinkKind; source: NoteDetail } | null>(null);

const snapshot = ref("");
const current = computed(() => JSON.stringify([title.value, kind.value, status.value, tags.value, body.value]));
const dirty = computed(() => state.value === "ok" && current.value !== snapshot.value);
const markSaved = () => (snapshot.value = current.value);

const isDraft = computed(() => !existing.value || existing.value.draft);
const label = computed(() => {
  const parts = [existing.value?.code ?? "新規", isDraft.value ? "下書き" : "公開中"];
  if (savedAt.value) parts.push(`${fmtTime(savedAt.value)} に保存`);
  else if (!existing.value) parts.push("まだ保存していません");
  if (dirty.value) parts.push("変更あり");
  return parts.join(" · ");
});
useTitle(computed(() => `${existing.value ? `${existing.value.code} を編集` : "新規作成"} - skyia/lab`));

const backTo = computed(() => (existing.value ? noteUrl(existing.value) : me.value?.handle ? `/@${me.value.handle}` : "/"));
const backLabel = computed(() => (existing.value ? `${existing.value.code} へ戻る` : `${me.value?.displayName || me.value?.handle || ""}の実験ノート`));

async function init() {
  error.value = "";
  if (props.handle && props.code) {
    const res = await api("GET /api/users/:handle/notes/:code", { params: { handle: props.handle, code: props.code } });
    if (!res.ok) {
      state.value = "not_found";
      return;
    }
    if (!res.data.viewer.canEdit) {
      state.value = "forbidden";
      return;
    }
    const n = res.data;
    existing.value = n;
    noteId.value = n.id;
    title.value = n.title;
    kind.value = n.kind;
    status.value = n.status ?? "watch";
    tags.value = [...n.tags];
    body.value = n.body ?? "";
    if (n.origin) {
      const src = await api("GET /api/notes/:id", { params: { id: n.origin.note.id } });
      if (src.ok) link.value = { kind: n.origin.kind, source: src.data };
    }
  } else {
    const q = route.query;
    const sourceId = typeof q.replicationOf === "string" ? q.replicationOf : typeof q.derivedFrom === "string" ? q.derivedFrom : null;
    if (sourceId) {
      const src = await api("GET /api/notes/:id", { params: { id: sourceId } });
      if (src.ok && src.data.kind === "experiment" && src.data.viewer.canInteract) {
        const linkKind: LinkKind = typeof q.replicationOf === "string" ? "replication" : "derivation";
        link.value = { kind: linkKind, source: src.data };
        kind.value = "experiment";
        tags.value = [...src.data.tags];
        if (linkKind === "replication") {
          title.value = `${src.data.title}(追試)`;
          body.value = REPLICATION_TEMPLATE;
        } else {
          body.value = EXPERIMENT_TEMPLATE;
        }
      } else {
        error.value = "元の実験が見つからないか、追試・派生ができません。ふつうの新規作成として開きました。";
      }
    }
    if (!link.value) {
      kind.value = q.kind === "article" || q.kind === "memo" ? q.kind : "experiment";
      if (kind.value === "experiment") body.value = EXPERIMENT_TEMPLATE;
    }
  }
  state.value = "ok";
  markSaved();
}
onMounted(init);

// ---- 保存 ----
async function save(publish: boolean) {
  if (saving.value) return;
  error.value = "";
  if (!title.value.trim()) {
    error.value = "タイトルを入れてください";
    return;
  }
  saving.value = true;
  try {
    const fields = {
      title: title.value,
      body: body.value,
      tags: tags.value,
      ...(kind.value === "experiment" ? { status: status.value } : {}),
    };
    const res = noteId.value
      ? await api("PATCH /api/notes/:id", {
          params: { id: noteId.value },
          body: { ...fields, ...(publish ? { draft: false } : {}) },
        })
      : await api("POST /api/notes", {
          body: {
            ...fields,
            kind: kind.value,
            draft: !publish,
            ...(link.value ? { link: { kind: link.value.kind, sourceId: link.value.source.id } } : {}),
          },
        });
    if (!res.ok) {
      error.value = res.status === 429 ? "続けて作りすぎです。少し待ってからお試しください" : errorMessage(res.error, "保存できませんでした");
      return;
    }
    existing.value = res.data;
    noteId.value = res.data.id;
    savedAt.value = new Date();
    markSaved();
    if (publish || !res.data.draft) {
      await router.push(noteUrl(res.data));
    } else if (!props.code) {
      // 新規の下書きを保存したら、編集の URL にする(次からは同じノートに保存する)
      await router.replace(`${noteUrl(res.data)}/edit`);
    }
  } finally {
    saving.value = false;
  }
}

// ---- 離れるときに確かめる ----
const LEAVE = "保存していない変更があります。このページを離れますか?";
onBeforeRouteLeave(() => (dirty.value ? window.confirm(LEAVE) : true));
useEventListener(window, "beforeunload", (e: BeforeUnloadEvent) => {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = ""; // 古いブラウザ向け
});

// ---- プレビュー ----
const previewHtml = ref("");
const previewing = ref(false);
const updatePreview = useDebounceFn(async (md: string) => {
  previewing.value = true;
  const res = await api("POST /api/notes/preview", { body: { body: md } });
  previewing.value = false;
  if (res.ok && md === body.value) previewHtml.value = res.data.html;
}, 400);
watch(body, (md) => void updatePreview(md), { immediate: true });

// ---- Markdown の手伝い ----
const textarea = useTemplateRef<HTMLTextAreaElement>("textarea");
function surround(before: string, after = before, placeholder = "") {
  const el = textarea.value;
  if (!el) return;
  const { selectionStart: s, selectionEnd: e, value } = el;
  const selected = value.slice(s, e) || placeholder;
  body.value = value.slice(0, s) + before + selected + after + value.slice(e);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(s + before.length, s + before.length + selected.length);
  });
}
function heading() {
  const el = textarea.value;
  if (!el) return;
  const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
  body.value = `${el.value.slice(0, start)}## ${el.value.slice(start)}`;
  requestAnimationFrame(() => el.focus());
}
function insertTemplate() {
  body.value = body.value.trim() ? `${body.value.trimEnd()}\n\n${EXPERIMENT_TEMPLATE}` : EXPERIMENT_TEMPLATE;
}

const toolClass = "flex size-9 cursor-pointer items-center justify-center text-ink hover:bg-white";
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-10 border-b-2 border-ink bg-white">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <RouterLink
          :to="backTo"
          class="flex items-center gap-2 text-sm font-medium text-ink hover:underline"
        >
          <IconArrowLeft
            class="size-4"
            aria-hidden="true"
          />{{ backLabel }}
        </RouterLink>
        <span
          class="font-mono text-xs text-muted"
          data-testid="save-state"
        >{{ label }}</span>
        <span class="grow" />
        <button
          v-if="isDraft"
          type="button"
          class="h-11 cursor-pointer border-2 border-ink bg-white px-4.5 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
          :disabled="saving || state !== 'ok'"
          @click="save(false)"
        >
          下書き保存
        </button>
        <button
          type="button"
          class="h-11 cursor-pointer border-2 border-ink bg-accent px-5.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
          :disabled="saving || state !== 'ok'"
          @click="save(true)"
        >
          {{ isDraft ? "公開する" : "更新する" }}
        </button>
      </div>
    </header>

    <p
      v-if="state === 'loading'"
      class="p-6 font-mono text-sm text-muted"
    >
      読み込んでいます…
    </p>
    <section
      v-else-if="state !== 'ok'"
      class="m-6 border border-ink bg-white p-8 text-center"
    >
      <h1 class="text-lg font-bold">
        {{ state === "forbidden" ? "このノートは編集できません" : "ノートが見つかりません" }}
      </h1>
      <RouterLink
        to="/"
        class="mt-4 inline-block text-accent underline"
      >
        新着へ戻る
      </RouterLink>
    </section>

    <template v-else>
      <div class="mx-auto flex w-full max-w-[1392px] flex-col gap-3.5 px-4 pt-5 sm:px-6">
        <p
          v-if="error"
          class="border-2 border-fail bg-[#FFF6F5] px-4 py-2.5 text-sm text-fail"
          role="alert"
        >
          {{ error }}
        </p>

        <!-- 追試・派生として開いたとき: 元の実験 -->
        <aside
          v-if="link"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 border-2 border-ink bg-white px-4 py-3 shadow-block"
          :aria-label="link.kind === 'replication' ? '追試する実験' : '派生元の実験'"
          data-testid="link-source"
        >
          <span class="bg-ink px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-white">{{ link.kind === "replication" ? "追試" : "派生" }}</span>
          <span class="font-mono text-xs text-muted">@{{ link.source.author.handle }} の {{ link.source.code }}</span>
          <RouterLink
            :to="noteUrl(link.source)"
            target="_blank"
            class="min-w-0 grow font-bold text-ink hover:underline"
          >
            {{ link.source.title }}
          </RouterLink>
          <Stamp
            v-if="link.source.status"
            :result="link.source.status"
          />
        </aside>

        <EditorFields
          v-model:title="title"
          v-model:kind="kind"
          v-model:status="status"
          v-model:tags="tags"
          :kind-locked="!!existing || !!link"
          :watch-days="existing?.status === 'watch' && status === 'watch' ? existing.watchDays : null"
        />
      </div>

      <div class="mx-auto flex w-full max-w-[1392px] grow flex-wrap gap-4 px-4 pt-4 pb-6 sm:px-6">
        <section
          aria-label="Markdown"
          class="flex min-w-0 flex-[1_1_520px] flex-col border-2 border-ink bg-white"
        >
          <div class="flex flex-wrap items-center gap-1 border-b border-rule bg-[#F7F8F9] px-2 py-1.5">
            <span class="px-2 font-mono text-xs tracking-widest text-muted">MARKDOWN</span>
            <span class="grow" />
            <button
              type="button"
              aria-label="見出し"
              :class="[toolClass, 'font-mono text-sm font-bold']"
              @click="heading"
            >
              H
            </button>
            <button
              type="button"
              aria-label="太字"
              :class="[toolClass, 'font-bold']"
              @click="surround('**', '**', '太字')"
            >
              B
            </button>
            <button
              type="button"
              aria-label="コード"
              :class="toolClass"
              @click="surround('`', '`', 'code')"
            >
              <IconCode
                class="size-4"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              aria-label="リンク"
              :class="toolClass"
              @click="surround('[', '](https://)', 'リンクの文字')"
            >
              <IconLink
                class="size-4"
                aria-hidden="true"
              />
            </button>
            <button
              v-if="kind === 'experiment'"
              type="button"
              class="h-9 cursor-pointer border border-rule bg-white px-2.5 text-xs"
              @click="insertTemplate"
            >
              型紙を入れる
            </button>
          </div>
          <label
            for="md"
            class="sr-only"
          >本文(Markdown)</label>
          <textarea
            id="md"
            ref="textarea"
            v-model="body"
            :maxlength="LIMITS.noteBody"
            class="min-h-[360px] grow resize-y px-5 py-4.5 font-mono text-sm leading-[1.8] outline-none sm:min-h-[560px]"
          />
          <p class="border-t border-rule px-3 py-1.5 text-right font-mono text-xs text-muted">
            {{ body.length.toLocaleString() }} / {{ LIMITS.noteBody.toLocaleString() }}
          </p>
        </section>
        <section
          aria-label="プレビュー"
          class="flex min-w-0 flex-[1_1_520px] flex-col border-2 border-ink bg-white"
        >
          <div class="flex min-h-12 items-center border-b border-rule bg-[#F7F8F9] px-2 py-1.5">
            <span class="px-2 font-mono text-xs tracking-widest text-muted">PREVIEW</span>
            <span
              v-if="previewing"
              class="font-mono text-xs text-muted"
            >…</span>
          </div>
          <!-- サーバーが Markdown から作った HTML(公開したときと同じもの) -->
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="note-body px-5 py-5 sm:px-7"
            :class="kind === 'experiment' ? 'counted' : ''"
            v-html="previewHtml"
          />
          <!-- eslint-enable vue/no-v-html -->
        </section>
      </div>
    </template>
  </div>
</template>
