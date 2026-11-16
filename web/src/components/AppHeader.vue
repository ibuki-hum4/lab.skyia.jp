<script setup lang="ts">
// 全ページの上。ロゴ・ナビ・検索欄。
// 右端は、ログイン前は「HoshID でログイン」、ログイン中は四角いアバター(押すとマイページ・新規作成・プロフィールの設定・ログアウト)
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from "reka-ui";
import { ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import IconLogIn from "~icons/lucide/log-in";
import IconSearch from "~icons/lucide/search";
import { loginUrl } from "../api";
import { useMe } from "../composables/useMe";
import AppLogo from "./AppLogo.vue";
import Avatar from "./Avatar.vue";

const { me, loaded } = useMe();
const route = useRoute();
const router = useRouter();
const q = ref(typeof route.query.q === "string" ? route.query.q : "");
// 検索のページから来たときは、検索語を入れておく
watch(
  () => route.query.q,
  (v) => {
    if (route.name === "search") q.value = typeof v === "string" ? v : "";
  },
);
const logoutForm = ref<HTMLFormElement | null>(null);

function search() {
  void router.push({ path: "/search", query: q.value.trim() ? { q: q.value.trim() } : {} });
}

function myPage() {
  void router.push(me.value?.handle ? `/@${me.value.handle}` : "/welcome");
}

const navClass = "text-ink hover:text-accent";
const itemClass = "flex h-11 cursor-pointer items-center px-4 text-sm outline-none data-highlighted:bg-paper";
</script>

<template>
  <header class="border-b-2 border-ink bg-white">
    <div class="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-3.5 px-4 py-3.5 sm:px-6">
      <RouterLink
        to="/"
        aria-label="skyia/lab のトップへ"
      >
        <AppLogo />
      </RouterLink>
      <nav
        aria-label="メイン"
        class="order-3 flex w-full gap-5.5 text-[15px] font-medium md:order-none md:w-auto"
      >
        <RouterLink
          to="/"
          :class="navClass"
        >
          新着
        </RouterLink>
        <RouterLink
          v-if="me"
          to="/following"
          :class="navClass"
        >
          フォロー中
        </RouterLink>
        <RouterLink
          to="/tags"
          :class="navClass"
        >
          タグ
        </RouterLink>
        <RouterLink
          to="/members"
          :class="navClass"
        >
          メンバー
        </RouterLink>
      </nav>
      <span class="hidden grow md:block" />
      <form
        role="search"
        class="order-4 flex h-10 w-full min-w-0 items-center gap-2 border border-ink bg-white px-3 md:order-none md:w-auto md:max-w-[300px] md:min-w-[200px] md:flex-[0_1_300px]"
        @submit.prevent="search"
      >
        <IconSearch
          class="size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
        <label
          for="site-search"
          class="sr-only"
        >実験ノートを検索</label>
        <input
          id="site-search"
          v-model="q"
          type="search"
          placeholder="実験・タグ・メンバーを検索"
          class="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-[#6B7178]"
        >
      </form>

      <div class="ml-auto md:ml-0">
        <template v-if="loaded && me">
          <DropdownMenuRoot>
            <DropdownMenuTrigger
              aria-label="アカウントのメニュー"
              class="block cursor-pointer border-2 border-ink"
            >
              <Avatar
                :name="me.displayName"
                :handle="me.handle"
                :src="me.avatar"
                size="md"
                class="size-9!"
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                :side-offset="8"
                class="z-20 flex w-52 flex-col border-2 border-ink bg-white text-ink shadow-block"
              >
                <DropdownMenuItem
                  :class="[itemClass, 'border-b border-[#DDE0E3]']"
                  @select="myPage"
                >
                  マイページ
                </DropdownMenuItem>
                <DropdownMenuItem
                  :class="[itemClass, 'border-b border-[#DDE0E3]']"
                  @select="router.push('/new')"
                >
                  新規作成
                </DropdownMenuItem>
                <DropdownMenuItem
                  :class="[itemClass, 'border-b border-[#DDE0E3]']"
                  @select="router.push('/settings/profile')"
                >
                  プロフィールの設定
                </DropdownMenuItem>
                <DropdownMenuItem
                  :class="itemClass"
                  @select="logoutForm?.submit()"
                >
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          <!-- ログアウトは POST(csrf() を通る)。そのあと HoshID の end_session へ送られる -->
          <form
            ref="logoutForm"
            method="post"
            action="/auth/logout"
            class="hidden"
          />
        </template>
        <a
          v-else-if="loaded"
          :href="loginUrl(route.fullPath)"
          class="inline-flex h-10 items-center gap-2 bg-ink px-4 text-sm font-bold text-white hover:bg-accent"
        >
          <IconLogIn
            class="size-4"
            aria-hidden="true"
          />
          HoshID でログイン
        </a>
        <span
          v-else
          class="inline-block size-10"
          aria-hidden="true"
        />
      </div>
    </div>
  </header>
</template>
