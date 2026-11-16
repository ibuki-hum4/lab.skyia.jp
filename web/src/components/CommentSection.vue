<script setup lang="ts">
// コメント欄。一覧・書く・直す・消す(本人だけ)・隠す(moderator 以上)。
// 消したものは「削除されました」、隠したものは「非表示にされました」と出す
import { ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api, LIMITS, loginUrl, type CommentItem } from "../api";
import { errorMessage, fmtDateTime } from "../lib/notes";
import ActionMenu, { type MenuItem } from "./ActionMenu.vue";
import Avatar from "./Avatar.vue";
import ReasonDialog from "./ReasonDialog.vue";

const props = withDefaults(
  defineProps<{ noteId: string; loggedIn: boolean; canComment: boolean; compact?: boolean }>(),
  { compact: false },
);
const emit = defineEmits<{ count: [n: number]; message: [text: string] }>();
const route = useRoute();

const comments = ref<CommentItem[]>([]);
const state = ref<"loading" | "ok" | "error">("loading");
const draft = ref("");
const sending = ref(false);
const editing = ref<string | null>(null);
const editText = ref("");
const hiding = ref<CommentItem | null>(null);
const deleting = ref<CommentItem | null>(null);

async function load() {
  const res = await api("GET /api/notes/:id/comments", { params: { id: props.noteId } });
  if (res.ok) {
    comments.value = res.data;
    state.value = "ok";
    emit("count", res.data.filter((c) => !c.deleted && !c.hidden).length);
  } else {
    state.value = "error";
  }
}
watch(() => [props.noteId, props.loggedIn], load, { immediate: true });

async function send() {
  if (!draft.value.trim() || sending.value) return;
  sending.value = true;
  try {
    const res = await api("POST /api/notes/:id/comments", { params: { id: props.noteId }, body: { body: draft.value } });
    if (res.ok) {
      draft.value = "";
      await load();
    } else {
      emit("message", res.status === 429 ? "コメントが続いています。少し待ってからお試しください" : errorMessage(res.error));
    }
  } finally {
    sending.value = false;
  }
}

function startEdit(c: CommentItem) {
  editing.value = c.id;
  editText.value = c.body ?? "";
}

async function saveEdit(c: CommentItem) {
  const res = await api("PATCH /api/comments/:id", { params: { id: c.id }, body: { body: editText.value } });
  if (res.ok) {
    editing.value = null;
    await load();
  } else {
    emit("message", errorMessage(res.error));
  }
}

async function remove(c: CommentItem) {
  const res = await api("DELETE /api/comments/:id", { params: { id: c.id } });
  if (res.ok) await load();
  else emit("message", errorMessage(res.error));
}

async function setHidden(c: CommentItem, on: boolean, reason = "") {
  const res = on
    ? await api("POST /api/comments/:id/hide", { params: { id: c.id }, body: { reason } })
    : await api("DELETE /api/comments/:id/hide", { params: { id: c.id } });
  if (res.ok) {
    emit("message", on ? "コメントを非表示にしました" : "コメントを戻しました");
    await load();
  } else {
    emit("message", errorMessage(res.error));
  }
}

function menu(c: CommentItem): MenuItem[] {
  const items: MenuItem[] = [];
  if (c.viewer.canEdit) {
    items.push({ label: "編集", select: () => startEdit(c) });
    items.push({ label: "削除", danger: true, select: () => (deleting.value = c) });
  }
  if (c.viewer.canModerate) {
    items.push(
      c.hidden
        ? { label: "非表示を戻す", select: () => void setHidden(c, false) }
        : { label: "非表示にする", danger: true, select: () => (hiding.value = c) },
    );
  }
  return items;
}
</script>

<template>
  <section
    aria-labelledby="comments"
    class="flex flex-col gap-4.5"
  >
    <h2
      id="comments"
      class="flex items-baseline gap-2.5 text-xl font-bold"
    >
      コメント<span class="font-mono text-sm font-normal text-muted">{{ comments.filter((c) => !c.deleted && !c.hidden).length }}</span>
    </h2>

    <p
      v-if="state === 'loading'"
      class="font-mono text-sm text-muted"
    >
      読み込んでいます…
    </p>
    <p
      v-else-if="state === 'error'"
      class="text-sm text-fail"
    >
      コメントを読み込めませんでした。
    </p>

    <div
      v-for="c in comments"
      :key="c.id"
      class="flex gap-3.5 border-b border-[#DDE0E3] pb-4"
      :data-testid="`comment-${c.id}`"
    >
      <Avatar
        :name="c.author.displayName"
        :handle="c.author.handle"
        :src="c.author.avatar"
        size="sm"
      />
      <div class="flex min-w-0 grow flex-col gap-1">
        <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <RouterLink
            :to="`/@${c.author.handle}`"
            class="text-sm font-bold text-ink hover:underline"
          >
            {{ c.author.displayName || c.author.handle }}
          </RouterLink>
          <span class="font-mono text-xs text-muted">{{ fmtDateTime(c.createdAt) }}<template v-if="c.updatedAt !== c.createdAt && !c.deleted">(編集済み)</template></span>
          <span class="grow" />
          <ActionMenu
            :items="menu(c)"
            size="sm"
            label="コメントの操作"
          />
        </div>

        <p
          v-if="c.deleted"
          class="text-sm text-muted italic"
        >
          削除されました
        </p>
        <template v-else>
          <p
            v-if="c.hidden"
            class="text-sm text-fail"
          >
            非表示にされました<template v-if="c.hiddenReason">
              (理由: {{ c.hiddenReason }})
            </template>
          </p>
          <form
            v-if="editing === c.id"
            class="flex flex-col gap-2"
            @submit.prevent="saveEdit(c)"
          >
            <label
              :for="`edit-${c.id}`"
              class="sr-only"
            >コメントを直す</label>
            <textarea
              :id="`edit-${c.id}`"
              v-model="editText"
              rows="3"
              :maxlength="LIMITS.comment"
              class="border border-ink bg-white p-3 text-[15px]"
            />
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="h-10 cursor-pointer border-2 border-ink bg-white px-4 text-sm font-bold"
                @click="editing = null"
              >
                やめる
              </button>
              <button
                type="submit"
                class="h-10 cursor-pointer border-2 border-ink bg-ink px-4 text-sm font-bold text-white"
              >
                保存
              </button>
            </div>
          </form>
          <!-- サーバーが Markdown から作った HTML(生の HTML と危ないリンクは通していない) -->
          <!-- eslint-disable vue/no-v-html -->
          <div
            v-else-if="c.html !== null"
            class="note-body compact"
            :class="c.hidden ? 'opacity-60' : ''"
            v-html="c.html"
          />
          <!-- eslint-enable vue/no-v-html -->
        </template>
      </div>
    </div>

    <form
      v-if="loggedIn && canComment"
      class="flex flex-col gap-2.5"
      @submit.prevent="send"
    >
      <label
        :for="`comment-body-${noteId}`"
        class="text-sm font-bold"
      >コメントを書く</label>
      <textarea
        :id="`comment-body-${noteId}`"
        v-model="draft"
        :rows="compact ? 2 : 3"
        :maxlength="LIMITS.comment"
        :placeholder="compact ? 'ひとことコメント' : 'Markdown が使えます'"
        class="border border-ink bg-white p-3 text-[15px] leading-relaxed"
      />
      <div class="flex items-center justify-end gap-3">
        <span class="font-mono text-xs text-muted">{{ draft.length }} / {{ LIMITS.comment }}</span>
        <button
          type="submit"
          class="h-11 cursor-pointer border-2 border-ink bg-ink px-5 text-sm font-bold text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!draft.trim() || sending"
        >
          {{ compact ? "送る" : "コメントする" }}
        </button>
      </div>
    </form>
    <p
      v-else-if="!loggedIn"
      class="text-sm"
    >
      コメントするには<a
        :href="loginUrl(route.fullPath)"
        class="text-accent underline"
      >ログイン</a>してください。
    </p>
    <p
      v-else
      class="text-sm text-muted"
    >
      このノートにはコメントできません。
    </p>

    <ReasonDialog
      :open="hiding !== null"
      title="コメントを非表示にしますか?"
      description="消さずに隠します。書いた人と moderator には、理由と一緒に見えます。"
      action="非表示にする"
      reason
      danger
      @update:open="(v) => !v && (hiding = null)"
      @confirm="(r) => hiding && setHidden(hiding, true, r)"
    />
    <ReasonDialog
      :open="deleting !== null"
      title="コメントを削除しますか?"
      description="中身は消え、「削除されました」と出ます。元に戻せません。"
      action="削除する"
      danger
      @update:open="(v) => !v && (deleting = null)"
      @confirm="() => deleting && remove(deleting)"
    />
  </section>
</template>
