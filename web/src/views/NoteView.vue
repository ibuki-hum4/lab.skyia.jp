<script setup lang="ts">
// /@:handle/:code: ノート 1 件。
//   実験: 本文・スタンプ・追試・派生・系譜・履歴・関係するもの・コメント・いいね
//   記事: 実験から、状態・追試・派生を除いたもの
//   メモ: 大きな付箋で本文。サイドにほかのメモ
import { useTitle } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import IconGitBranch from "~icons/lucide/git-branch";
import IconPencil from "~icons/lucide/pencil";
import IconRepeat from "~icons/lucide/repeat-2";
import { api, type Lineage, type NoteDetail, type NoteSummary } from "../api";
import ActionMenu, { type MenuItem } from "../components/ActionMenu.vue";
import Avatar from "../components/Avatar.vue";
import CommentSection from "../components/CommentSection.vue";
import HistoryBox from "../components/HistoryBox.vue";
import LikeButton from "../components/LikeButton.vue";
import LineageBox from "../components/LineageBox.vue";
import NoteStamp from "../components/NoteStamp.vue";
import ReasonDialog from "../components/ReasonDialog.vue";
import Stamp from "../components/Stamp.vue";
import StickyNote from "../components/StickyNote.vue";
import { useMe } from "../composables/useMe";
import { editUrl, errorMessage, fmtDate, fmtDateTime, noteUrl, STATUS_LABEL } from "../lib/notes";

const props = defineProps<{ handle: string; code: string }>();
const router = useRouter();
const { loggedIn } = useMe();

const note = ref<NoteDetail | null>(null);
const state = ref<"loading" | "ok" | "not_found" | "hidden" | "error">("loading");
const replications = ref<NoteSummary[]>([]);
const lineage = ref<Lineage | null>(null);
const related = ref<NoteSummary[]>([]);
const otherMemos = ref<NoteSummary[]>([]);
const notice = ref("");
const hiding = ref(false);
const deleting = ref(false);

const isExp = computed(() => note.value?.kind === "experiment");
const isMemo = computed(() => note.value?.kind === "memo");
const authorName = computed(() => note.value?.author.displayName || note.value?.author.handle || "");
useTitle(computed(() => (note.value ? `${note.value.title} - ${authorName.value}の実験ノート - skyia/lab` : "skyia/lab")));

async function load() {
  if (note.value?.code !== props.code.toUpperCase() || note.value?.author.handle !== props.handle) state.value = "loading";
  const res = await api("GET /api/users/:handle/notes/:code", { params: { handle: props.handle, code: props.code } });
  if (!res.ok) {
    note.value = null;
    state.value = res.status === 404 ? ((res.error as { error?: string } | undefined)?.error === "hidden" ? "hidden" : "not_found") : "error";
    return;
  }
  note.value = res.data;
  state.value = "ok";
  void loadSide(res.data);
}

async function loadSide(n: NoteDetail) {
  const id = n.id;
  replications.value = [];
  lineage.value = null;
  related.value = [];
  otherMemos.value = [];
  if (n.kind === "experiment") {
    const [r, l] = await Promise.all([
      api("GET /api/notes/:id/replications", { params: { id } }),
      api("GET /api/notes/:id/lineage", { params: { id } }),
    ]);
    if (r.ok) replications.value = r.data;
    if (l.ok) lineage.value = l.data;
  }
  if (n.kind === "memo") {
    const m = await api("GET /api/notes", { query: { author: n.author.handle, kind: "memo", limit: 6 } });
    if (m.ok) otherMemos.value = m.data.items.filter((x) => x.id !== id).slice(0, 5);
  } else {
    const rel = await api("GET /api/notes/:id/related", { params: { id } });
    if (rel.ok) related.value = rel.data;
  }
}

watch([() => props.handle, () => props.code, loggedIn], load, { immediate: true });

function show(text: string) {
  notice.value = text;
  setTimeout(() => {
    if (notice.value === text) notice.value = "";
  }, 4000);
}

const repSummary = computed(() => {
  const c = { pass: 0, fail: 0, watch: 0 };
  for (const r of replications.value) if (r.status) c[r.status]++;
  return c;
});

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    show("リンクをコピーしました");
  } catch {
    show("コピーできませんでした");
  }
}

async function publish() {
  if (!note.value) return;
  const res = await api("POST /api/notes/:id/publish", { params: { id: note.value.id } });
  if (res.ok) {
    note.value = res.data;
    show("公開しました");
  } else show(errorMessage(res.error));
}

async function remove() {
  if (!note.value) return;
  const res = await api("DELETE /api/notes/:id", { params: { id: note.value.id } });
  if (res.ok) void router.push(`/@${note.value.author.handle}`);
  else show(errorMessage(res.error));
}

async function setHidden(on: boolean, reason = "") {
  if (!note.value) return;
  const id = note.value.id;
  const res = on
    ? await api("POST /api/notes/:id/hide", { params: { id }, body: { reason } })
    : await api("DELETE /api/notes/:id/hide", { params: { id } });
  if (res.ok) {
    show(on ? "非表示にしました" : "非表示を戻しました");
    await load();
  } else show(errorMessage(res.error));
}

const menu = computed<MenuItem[]>(() => {
  const n = note.value;
  if (!n) return [];
  const items: MenuItem[] = [{ label: "リンクをコピー", select: copyLink }];
  if (n.viewer.canEdit && n.draft) items.push({ label: "公開する", select: publish });
  if (n.viewer.canEdit) items.push({ label: "削除", danger: true, select: () => (deleting.value = true) });
  if (n.viewer.canModerate && !n.viewer.canEdit) {
    items.push(
      n.hidden
        ? { label: "非表示を戻す", select: () => void setHidden(false) }
        : { label: "非表示にする", danger: true, select: () => (hiding.value = true) },
    );
  } else if (n.viewer.canModerate && n.hidden) {
    items.push({ label: "非表示を戻す", select: () => void setHidden(false) });
  }
  return items;
});

const tone = { pass: "text-pass", fail: "text-fail", watch: "text-watch" } as const;
</script>

<template>
  <p
    v-if="state === 'loading'"
    class="font-mono text-sm text-muted"
  >
    読み込んでいます…
  </p>
  <section
    v-else-if="state === 'not_found' || state === 'hidden'"
    class="border border-ink bg-white p-8 text-center"
  >
    <h1 class="text-lg font-bold">
      {{ state === "hidden" ? "このノートは非表示になっています" : "ノートが見つかりません" }}
    </h1>
    <p
      v-if="state === 'not_found'"
      class="mt-2 text-sm text-muted"
    >
      消されたか、まだ公開されていないノートです。
    </p>
    <RouterLink
      :to="`/@${handle}`"
      class="mt-4 inline-block text-accent underline"
    >
      @{{ handle }} の実験ノートへ
    </RouterLink>
  </section>
  <p
    v-else-if="state === 'error'"
    class="text-fail"
    role="alert"
  >
    読み込めませんでした。時間をおいてもう一度お試しください。
  </p>

  <div
    v-else-if="note"
    class="flex flex-col gap-6"
  >
    <nav
      aria-label="パンくず"
      class="flex flex-wrap items-center gap-2 font-mono text-[13px] text-muted"
    >
      <RouterLink
        to="/"
        class="text-accent hover:underline"
      >
        skyia/lab
      </RouterLink>
      <span aria-hidden="true">/</span>
      <RouterLink
        :to="`/@${note.author.handle}`"
        class="text-accent hover:underline"
      >
        {{ authorName }}の実験ノート
      </RouterLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ note.code }}</span>
    </nav>

    <p
      v-if="note.draft"
      class="border-2 border-dotted border-muted bg-white px-4 py-3 text-sm"
      role="status"
    >
      下書きです。公開するまで、ほかの人には見えません。
      <button
        v-if="note.viewer.canEdit"
        type="button"
        class="ml-2 cursor-pointer font-bold text-accent underline"
        @click="publish"
      >
        公開する
      </button>
    </p>
    <p
      v-if="note.hidden"
      class="border-2 border-fail bg-[#FFF6F5] px-4 py-3 text-sm text-fail"
      role="status"
    >
      このノートは moderator によって非表示にされています。作者と moderator にだけ見えています。
      <template v-if="note.hiddenReason">
        理由: {{ note.hiddenReason }}
      </template>
    </p>

    <!-- ============ メモ ============ -->
    <div
      v-if="isMemo"
      class="flex flex-wrap items-start gap-10"
    >
      <div class="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
        <StickyNote
          size="page"
          :tilt="-0.8"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <RouterLink
              :to="`/@${note.author.handle}`"
              class="flex items-center gap-2 font-bold text-ink hover:underline"
            >
              <Avatar
                :name="note.author.displayName"
                :handle="note.author.handle"
                :src="note.author.avatar"
                size="sm"
              />
              {{ authorName }}
            </RouterLink>
            <span class="font-mono text-xs font-bold tracking-[0.14em] text-[#6B5300]">{{ note.code }}</span>
            <span class="font-mono text-xs text-[#5C4A00]">{{ fmtDateTime(note.publishedAt ?? note.updatedAt) }}</span>
            <span class="grow" />
            <RouterLink
              v-if="note.viewer.canEdit"
              :to="editUrl(note)"
              class="inline-flex h-9 items-center gap-1.5 border-2 border-ink bg-white/70 px-3 text-sm font-bold text-ink"
            >
              <IconPencil
                class="size-4"
                aria-hidden="true"
              />編集
            </RouterLink>
            <ActionMenu :items="menu" />
          </div>
          <h1 class="text-2xl leading-snug font-bold break-words sm:text-[30px]">
            {{ note.title }}
          </h1>
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="note-body compact text-[17px]! leading-[1.9]! text-[#2E2A16]"
            v-html="note.html"
          />
          <!-- eslint-enable vue/no-v-html -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
            <RouterLink
              v-for="t in note.tags"
              :key="t"
              :to="`/tags/${encodeURIComponent(t)}`"
              class="font-mono text-[13px] text-[#4A3C00] hover:underline"
            >
              #{{ t }}
            </RouterLink>
            <span class="grow" />
            <LikeButton
              :id="note.id"
              :liked="note.viewer.liked"
              :count="note.likeCount"
              :logged-in="loggedIn"
              :disabled="loggedIn && !note.viewer.canInteract && !note.viewer.liked"
              @error="show"
            />
          </div>
        </StickyNote>
        <div class="border border-ink bg-white px-5 py-6 sm:px-8">
          <CommentSection
            :note-id="note.id"
            :logged-in="loggedIn"
            :can-comment="note.viewer.canInteract"
            compact
            @message="show"
          />
        </div>
      </div>
      <aside
        :aria-label="`${authorName}のほかのメモ`"
        class="flex flex-[1_1_240px] flex-col gap-5"
      >
        <h2 class="font-mono text-xs font-bold tracking-[0.12em] text-muted">
          MORE MEMOS / ほかのメモ
        </h2>
        <RouterLink
          v-for="(m, i) in otherMemos"
          :key="m.id"
          :to="noteUrl(m)"
          class="group"
        >
          <StickyNote :tilt="i % 2 === 0 ? 1 : -1.2">
            <span class="font-mono text-xs font-bold text-[#6B5300]">{{ m.code }}</span>
            <span class="text-[15px] leading-normal font-bold group-hover:underline">{{ m.title }}</span>
          </StickyNote>
        </RouterLink>
        <p
          v-if="otherMemos.length === 0"
          class="text-sm text-muted"
        >
          ほかのメモはまだありません。
        </p>
        <RouterLink
          :to="`/@${note.author.handle}`"
          class="text-sm text-accent hover:underline"
        >
          {{ authorName }}の実験ノートへ →
        </RouterLink>
      </aside>
    </div>

    <!-- ============ 実験・記事 ============ -->
    <div
      v-else
      class="flex flex-wrap items-start gap-8"
    >
      <article class="min-w-0 flex-[999_1_640px] border border-ink bg-white shadow-block-lg">
        <header class="relative flex flex-col gap-4.5 border-b-2 border-ink px-5 pt-7 pb-6 sm:px-12 sm:pt-9 sm:pb-7">
          <div class="flex flex-wrap items-center gap-3">
            <RouterLink
              :to="`/@${note.author.handle}`"
              class="flex items-center gap-2.5 text-[15px] font-bold text-ink hover:underline"
            >
              <Avatar
                :name="note.author.displayName"
                :handle="note.author.handle"
                :src="note.author.avatar"
                size="md"
                class="size-9!"
              />
              <span class="flex flex-col leading-snug">{{ authorName }}<span class="font-mono text-xs font-normal text-muted">@{{ note.author.handle }} の実験ノート</span></span>
            </RouterLink>
            <span class="grow" />
            <RouterLink
              v-if="note.viewer.canEdit"
              :to="editUrl(note)"
              class="inline-flex h-10 items-center gap-2 border-2 border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-paper"
            >
              <IconPencil
                class="size-4"
                aria-hidden="true"
              />編集
            </RouterLink>
            <ActionMenu :items="menu" />
          </div>
          <div class="flex flex-wrap items-center gap-x-4.5 gap-y-2.5 font-mono text-[13px]">
            <span class="text-[15px] font-bold text-accent">{{ note.code }}</span>
            <span class="text-muted">{{ fmtDate(note.publishedAt ?? note.updatedAt) }}</span>
            <RouterLink
              v-for="t in note.tags"
              :key="t"
              :to="`/tags/${encodeURIComponent(t)}`"
              class="text-accent hover:text-ink hover:underline"
            >
              #{{ t }}
            </RouterLink>
          </div>
          <div class="flex flex-wrap items-start gap-x-6 gap-y-4">
            <h1 class="max-w-160 grow basis-80 text-[26px] leading-snug font-bold break-words sm:text-4xl sm:leading-[1.4]">
              {{ note.title }}
            </h1>
            <span
              class="origin-center sm:mt-2 sm:mr-2 sm:scale-150"
              data-testid="note-stamp"
            >
              <NoteStamp
                :kind="note.kind"
                :status="note.status"
                :watch-days="note.watchDays"
                :draft="false"
              />
            </span>
          </div>
          <p
            v-if="note.origin"
            class="font-mono text-xs text-muted"
          >
            <RouterLink
              :to="noteUrl(note.origin.note)"
              class="text-accent hover:underline"
            >
              @{{ note.origin.note.author.handle }} の {{ note.origin.note.code }}
            </RouterLink>
            {{ note.origin.kind === "replication" ? "の追試" : "から派生" }}: {{ note.origin.note.title }}
          </p>
        </header>

        <!-- サーバーが Markdown から作った HTML(生の HTML と危ないリンクは通していない) -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="note-body px-5 py-8 sm:px-12 sm:py-10"
          :class="isExp ? 'counted' : ''"
          v-html="note.html"
        />
        <!-- eslint-enable vue/no-v-html -->

        <!-- 追試 -->
        <section
          v-if="isExp"
          aria-labelledby="replications"
          class="flex flex-col gap-4 border-t-2 border-ink bg-[#F7F8FA] px-5 pt-7 pb-8 sm:px-12"
        >
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <h2
              id="replications"
              class="flex items-baseline gap-2.5 text-[22px] font-bold"
            >
              追試<span class="font-mono text-sm font-normal text-muted">{{ replications.length }} 件</span>
            </h2>
            <span
              v-if="replications.length > 0"
              class="font-mono text-xs text-muted"
            >
              <span :class="repSummary.pass ? 'font-bold text-pass' : ''">PASS {{ repSummary.pass }}</span> ·
              <span :class="repSummary.fail ? 'font-bold text-fail' : ''">FAIL {{ repSummary.fail }}</span> ·
              <span :class="repSummary.watch ? 'font-bold text-watch' : ''">WATCH {{ repSummary.watch }}</span>
              <template v-if="repSummary.watch === 0"> · 結果はそろっています</template>
            </span>
            <span class="grow" />
            <RouterLink
              v-if="loggedIn && note.viewer.canInteract"
              :to="{ path: '/new', query: { replicationOf: note.id } }"
              class="inline-flex h-11 items-center gap-2 bg-ink px-4.5 text-sm font-bold text-white hover:bg-accent"
            >
              <IconRepeat
                class="size-4"
                aria-hidden="true"
              />自分も追試する
            </RouterLink>
          </div>
          <p
            v-if="replications.length === 0"
            class="text-sm text-muted"
          >
            まだ追試はありません。同じ条件でやり直して、結果を残せます。
          </p>
          <div class="flex flex-wrap gap-3.5">
            <RouterLink
              v-for="r in replications"
              :key="r.id"
              :to="noteUrl(r)"
              class="group flex flex-[1_1_300px] flex-col gap-2.5 border border-ink bg-white px-4.5 py-4 text-ink"
            >
              <div class="flex items-center gap-2.5">
                <Avatar
                  :name="r.author.displayName"
                  :handle="r.author.handle"
                  :src="r.author.avatar"
                  size="xs"
                  class="size-7!"
                />
                <span class="text-sm font-bold">{{ r.author.displayName || r.author.handle }}</span>
                <span class="grow" />
                <Stamp
                  v-if="r.status"
                  :result="r.status"
                />
              </div>
              <span class="font-mono text-xs text-muted">{{ r.code }} · {{ fmtDate(r.publishedAt) }}</span>
              <span class="text-sm font-bold group-hover:underline">{{ r.title }}</span>
              <p
                v-if="r.excerpt"
                class="text-sm leading-[1.8]"
              >
                {{ r.excerpt }}
              </p>
            </RouterLink>
          </div>
        </section>

        <footer class="flex flex-wrap items-center gap-x-5 gap-y-3 border-t-2 border-ink px-5 py-5 sm:px-12">
          <LikeButton
            :id="note.id"
            :liked="note.viewer.liked"
            :count="note.likeCount"
            :logged-in="loggedIn"
            :disabled="loggedIn && !note.viewer.canInteract && !note.viewer.liked"
            @error="show"
          />
          <RouterLink
            v-if="isExp && loggedIn && note.viewer.canInteract"
            :to="{ path: '/new', query: { derivedFrom: note.id } }"
            class="inline-flex h-11 items-center gap-2 border-2 border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-paper"
          >
            <IconGitBranch
              class="size-4.5"
              aria-hidden="true"
            />派生させる
          </RouterLink>
          <span class="grow" />
          <RouterLink
            :to="`/@${note.author.handle}`"
            class="text-sm text-accent hover:underline"
          >
            ノートへ
          </RouterLink>
        </footer>

        <div class="border-t-2 border-ink bg-[#FAFBFA] px-5 pt-7 pb-9 sm:px-12">
          <CommentSection
            :note-id="note.id"
            :logged-in="loggedIn"
            :can-comment="note.viewer.canInteract"
            @message="show"
          />
        </div>
      </article>

      <aside class="flex min-w-0 flex-[1_1_240px] flex-col gap-5">
        <nav
          v-if="note.toc.length > 0"
          aria-labelledby="toc-title"
          class="flex flex-col gap-1 border border-ink bg-white px-5 py-4.5"
        >
          <h2
            id="toc-title"
            class="mb-2 font-mono text-xs font-bold tracking-[0.12em] text-muted"
          >
            CONTENTS
          </h2>
          <a
            v-for="(t, i) in note.toc.filter((x) => x.depth === 2)"
            :key="t.id"
            :href="`#${t.id}`"
            class="flex gap-2.5 py-1 text-sm text-ink hover:text-accent"
          >
            <span
              v-if="isExp"
              class="font-mono text-xs text-accent"
            >{{ String(i + 1).padStart(2, "0") }}</span>{{ t.text }}
          </a>
        </nav>
        <LineageBox
          v-if="isExp && lineage"
          :lineage="lineage"
        />
        <HistoryBox
          v-if="isExp && note.history.length > 0"
          :history="note.history"
        />
        <section
          aria-labelledby="related-title"
          class="flex flex-col gap-3.5 border border-ink bg-white px-5 py-4.5"
        >
          <h2
            id="related-title"
            class="font-mono text-xs font-bold tracking-[0.12em] text-muted"
          >
            RELATED
          </h2>
          <p
            v-if="related.length === 0"
            class="text-xs text-muted"
          >
            同じタグのノートはまだありません。
          </p>
          <RouterLink
            v-for="r in related"
            :key="r.id"
            :to="noteUrl(r)"
            class="group flex flex-col gap-1 text-ink"
          >
            <span class="flex items-center gap-2.5 font-mono text-xs font-bold">
              <span :class="r.kind === 'experiment' ? 'text-accent' : 'text-ink'">{{ r.author.handle !== note.author.handle ? `${r.author.handle} / ` : "" }}{{ r.code }}</span>
              <span
                v-if="r.status"
                class="text-[10px]"
                :class="tone[r.status]"
              >{{ STATUS_LABEL[r.status] }}</span>
            </span>
            <span class="text-sm leading-relaxed group-hover:underline">{{ r.title }}</span>
          </RouterLink>
        </section>
      </aside>
    </div>

    <p
      v-if="notice"
      class="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 border-2 border-ink bg-white px-4 py-2 text-sm shadow-block"
      role="status"
    >
      {{ notice }}
    </p>

    <ReasonDialog
      v-model:open="hiding"
      title="このノートを非表示にしますか?"
      description="消さずに隠します。一覧や検索から外れ、作者と moderator にだけ見えるようになります。理由は作者にも見えます。"
      action="非表示にする"
      reason
      danger
      @confirm="(r) => setHidden(true, r)"
    />
    <ReasonDialog
      v-model:open="deleting"
      title="このノートを削除しますか?"
      description="コメント・いいね・追試や派生とのつながりも消えます。元に戻せません。"
      action="削除する"
      danger
      @confirm="remove"
    />
  </div>
</template>
