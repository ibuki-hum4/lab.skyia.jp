<script setup lang="ts">
// /@:handle: ユーザーのページ。プロフィールの箱と、ノートの一覧の場所(一覧は次の PR)
import { useTitle } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import IconPlus from "~icons/lucide/plus";
import { api, type Profile } from "../api";
import Avatar from "../components/Avatar.vue";
import FollowButton from "../components/FollowButton.vue";
import UserMenu from "../components/UserMenu.vue";
import { useMe } from "../composables/useMe";

const props = defineProps<{ handle: string }>();
const { me, loggedIn } = useMe();

const profile = ref<Profile | null>(null);
const state = ref<"loading" | "ok" | "not_found" | "error">("loading");
const notice = ref("");

const isMe = computed(() => !!me.value?.handle && me.value.handle === profile.value?.handle);
useTitle(computed(() => (profile.value ? `${profile.value.displayName}の実験ノート - skyia/lab` : "skyia/lab")));

async function load() {
  // 読み直し(ログインの状態が変わったとき・ブロックしたとき)のあいだは、前の中身を出しておく
  if (profile.value?.handle !== props.handle) state.value = "loading";
  const res = await api("GET /api/users/:handle", { params: { handle: props.handle } });
  if (res.ok) {
    profile.value = res.data;
    state.value = "ok";
  } else {
    profile.value = null;
    state.value = res.status === 404 ? "not_found" : "error";
  }
}
// ログインの状態が分かったら(viewer が付くので)読み直す
watch([() => props.handle, loggedIn], load, { immediate: true });

function onFollow(following: boolean) {
  if (!profile.value?.viewer) return;
  profile.value.viewer.following = following;
  profile.value.followerCount += following ? 1 : -1;
}

function show(text: string) {
  notice.value = text;
  setTimeout(() => {
    if (notice.value === text) notice.value = "";
  }, 4000);
}
</script>

<template>
  <p
    v-if="state === 'loading'"
    class="font-mono text-sm text-muted"
  >
    読み込んでいます…
  </p>
  <section
    v-else-if="state === 'not_found'"
    class="border border-ink bg-white p-8 text-center"
  >
    <h1 class="text-lg font-bold">
      @{{ handle }} は見つかりません
    </h1>
    <RouterLink
      to="/"
      class="mt-4 inline-block text-accent underline"
    >
      新着へ戻る
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
    v-else-if="profile"
    class="flex flex-col gap-8"
  >
    <section
      class="relative flex flex-wrap items-center gap-x-7 gap-y-5 border border-ink bg-white p-5 shadow-block-lg sm:px-8 sm:py-7"
      aria-labelledby="profile-title"
    >
      <Avatar
        :name="profile.displayName"
        :handle="profile.handle"
        size="lg"
      />
      <div class="flex min-w-0 flex-[999_1_280px] flex-col gap-1.5">
        <div class="font-mono text-xs font-bold tracking-[0.12em] break-all text-accent">
          NOTEBOOK OF @{{ profile.handle }}
        </div>
        <h1
          id="profile-title"
          class="text-2xl leading-snug font-bold break-words sm:text-[34px]"
        >
          {{ profile.displayName || profile.handle }}の実験ノート
        </h1>
        <p
          v-if="profile.bio"
          class="text-[15px] leading-7 whitespace-pre-line text-[#3A3F45]"
        >
          {{ profile.bio }}
        </p>
        <div class="flex flex-wrap items-center gap-x-4.5 gap-y-2 pt-1 text-sm">
          <span><b class="font-mono">{{ profile.followingCount }}</b> フォロー</span>
          <span><b class="font-mono">{{ profile.followerCount }}</b> フォロワー</span>
          <span
            v-if="profile.viewer?.followedBy"
            class="border border-rule px-1.5 py-px font-mono text-xs text-muted"
          >フォローされています</span>
          <span
            v-if="profile.viewer?.blocking"
            class="border border-fail px-1.5 py-px font-mono text-xs text-fail"
          >ブロックしています</span>
        </div>
      </div>

      <!-- 自分のページ: 新規作成(行き先は次の PR) -->
      <RouterLink
        v-if="isMe"
        to="/new"
        class="inline-flex h-12 items-center gap-2 self-start border-2 border-ink bg-accent px-5.5 text-[15px] font-bold text-white"
      >
        <IconPlus
          class="size-4.5"
          aria-hidden="true"
        />
        新規作成
      </RouterLink>
      <!-- 他人のページ: フォローと「…」 -->
      <div
        v-else
        class="flex gap-2 self-start"
      >
        <FollowButton
          v-if="!profile.viewer?.blocking"
          :handle="profile.handle"
          :following="profile.viewer?.following ?? false"
          :logged-in="loggedIn"
          @change="onFollow"
          @error="show"
        />
        <UserMenu
          v-if="loggedIn && profile.viewer"
          :handle="profile.handle"
          :blocking="profile.viewer.blocking"
          @change="load"
          @message="show"
        />
      </div>

      <p
        v-if="notice"
        class="absolute -bottom-12 left-0 border-2 border-ink bg-white px-3 py-1.5 text-sm shadow-block"
        role="status"
      >
        {{ notice }}
      </p>
    </section>

    <section
      aria-label="実験の一覧"
      class="flex flex-col"
    >
      <div class="flex border-b-2 border-ink">
        <span class="bg-ink px-4.5 py-2.5 text-[15px] font-bold text-white">すべて</span>
      </div>
      <div class="border border-t-0 border-dashed border-muted bg-white/70 p-8 text-center">
        <p class="font-mono text-xs font-bold tracking-widest text-muted">
          NEXT PR
        </p>
        <p class="mt-2 text-[15px]">
          ノートの一覧(実験・記事・メモ)は、次の PR で作ります。
        </p>
      </div>
    </section>
  </div>
</template>
