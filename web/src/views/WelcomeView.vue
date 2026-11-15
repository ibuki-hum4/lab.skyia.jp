<script setup lang="ts">
// /welcome: 初回だけ、@ のハンドルを決める。HoshID のニックネームが英数字なら、それを初期値にする(?suggest=)
import { useDebounceFn } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type HandleProblem } from "../api";
import { useMe } from "../composables/useMe";

const route = useRoute();
const router = useRouter();
const { me, loaded, refresh } = useMe();

const next = computed(() => {
  const n = typeof route.query.next === "string" ? route.query.next : "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
});
const handle = ref(typeof route.query.suggest === "string" ? route.query.suggest : "");
const status = ref<"idle" | "checking" | "ok" | HandleProblem>("idle");
const submitting = ref(false);
const error = ref("");

const PATTERN = /^[a-z0-9_-]{3,20}$/;
const MESSAGES: Record<HandleProblem, string> = {
  invalid: "3〜20 文字の、小文字の英数字と _ - で決めてください",
  reserved: "この名前は使えません",
  taken: "ほかの人が使っています",
};

const check = useDebounceFn(async (value: string) => {
  const res = await api("GET /api/handles/:handle/available", { params: { handle: value } });
  if (handle.value !== value) return; // 打っているあいだに変わった
  status.value = res.ok ? (res.data.available ? "ok" : res.data.reason) : "idle";
}, 300);

watch(
  handle,
  (value) => {
    const v = value.trim().toLowerCase();
    if (v !== value) {
      handle.value = v; // 小文字にそろえる
      return;
    }
    if (v === "") status.value = "idle";
    else if (!PATTERN.test(v)) status.value = "invalid";
    else {
      status.value = "checking";
      void check(v);
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await refresh();
  // ログインしていない・もう決めた人は、ここにいる意味がない
  if (!me.value) window.location.assign(`/auth/login?next=${encodeURIComponent(route.fullPath)}`);
  else if (me.value.handle) void router.replace(next.value);
});

async function submit() {
  if (status.value !== "ok" || submitting.value) return;
  submitting.value = true;
  error.value = "";
  const res = await api("POST /api/me/handle", { body: { handle: handle.value } });
  submitting.value = false;
  if (res.ok) {
    await refresh();
    void router.replace(next.value === "/" ? `/@${res.data.handle}` : next.value);
  } else if (res.status === 409 || res.status === 400) {
    const reason = (res.error as { error?: string })?.error;
    if (reason === "taken" || reason === "reserved" || reason === "invalid") status.value = reason;
    else error.value = "ハンドルはもう決まっています";
  } else {
    error.value = "保存できませんでした。もう一度お試しください";
  }
}
</script>

<template>
  <section
    v-if="loaded && me"
    class="mx-auto max-w-xl border border-ink bg-white p-6 shadow-block-lg sm:p-8"
    aria-labelledby="welcome-title"
  >
    <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
      WELCOME
    </p>
    <h1
      id="welcome-title"
      class="mt-1.5 text-2xl leading-snug font-bold sm:text-3xl"
    >
      {{ me.displayName || "ようこそ" }}さんの実験ノートを作ります
    </h1>
    <p class="mt-3 text-[15px] leading-7 text-[#3A3F45]">
      ノートの URL に使う @ の名前を決めてください。<strong>あとから変えられません。</strong>
    </p>

    <form
      class="mt-6 flex flex-col gap-3"
      @submit.prevent="submit"
    >
      <label
        for="handle"
        class="font-mono text-xs font-bold tracking-widest text-muted"
      >HANDLE</label>
      <div class="flex h-12 items-center border-2 border-ink bg-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <span
          class="pl-3 font-mono text-lg text-muted"
          aria-hidden="true"
        >@</span>
        <input
          id="handle"
          v-model="handle"
          name="handle"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          maxlength="20"
          required
          aria-describedby="handle-status"
          class="h-full min-w-0 grow bg-transparent px-1.5 font-mono text-lg outline-none"
        >
      </div>
      <p
        id="handle-status"
        class="min-h-6 font-mono text-[13px]"
        role="status"
        aria-live="polite"
        :class="status === 'ok' ? 'text-pass' : status === 'checking' || status === 'idle' ? 'text-muted' : 'text-fail'"
      >
        <template v-if="status === 'ok'">
          ✓ @{{ handle }} は使えます
        </template>
        <template v-else-if="status === 'checking'">
          確かめています…
        </template>
        <template v-else-if="status === 'idle'">
          3〜20 文字。小文字の英数字と _ -
        </template>
        <template v-else>
          {{ MESSAGES[status] }}
        </template>
      </p>
      <p
        v-if="error"
        class="text-sm text-fail"
        role="alert"
      >
        {{ error }}
      </p>
      <button
        type="submit"
        :disabled="status !== 'ok' || submitting"
        class="h-12 cursor-pointer border-2 border-ink bg-accent px-6 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:border-rule disabled:bg-rule disabled:text-muted sm:self-start"
      >
        {{ submitting ? "保存しています…" : "この名前に決める" }}
      </button>
    </form>
  </section>
</template>
