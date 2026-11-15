<script setup lang="ts">
// /login/error: ログインに失敗したとき(server から ?error=... で送られてくる)
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const code = computed(() => (typeof route.query.error === "string" ? route.query.error : ""));
const message = computed(() =>
  code.value === "account_suspended"
    ? "このアカウントは、いま利用が止められています。運営にお問い合わせください。"
    : "ログインできませんでした。時間がたったか、途中の情報が合いませんでした。もう一度お試しください。",
);
</script>

<template>
  <section class="mx-auto max-w-xl border border-ink bg-white p-6 shadow-block-lg sm:p-8">
    <p class="font-mono text-xs font-bold tracking-[0.12em] text-fail">
      LOGIN FAILED
    </p>
    <h1 class="mt-1.5 text-2xl font-bold">
      ログインできませんでした
    </h1>
    <p
      class="mt-3 text-[15px] leading-7 text-[#3A3F45]"
      role="alert"
    >
      {{ message }}
    </p>
    <a
      v-if="code !== 'account_suspended'"
      href="/auth/login?next=/"
      class="mt-6 inline-flex h-12 items-center border-2 border-ink bg-ink px-5 text-[15px] font-bold text-white"
    >もう一度ログインする</a>
  </section>
</template>
