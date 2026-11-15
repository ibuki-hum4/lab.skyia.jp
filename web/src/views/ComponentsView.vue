<script setup lang="ts">
// /_components: 部品を props ごとに並べる、確認用のページ(リンクはどこからも張っていない)
import Avatar from "../components/Avatar.vue";
import FollowButton from "../components/FollowButton.vue";
import KindBadge from "../components/KindBadge.vue";
import Stamp from "../components/Stamp.vue";
import StickyNote from "../components/StickyNote.vue";
import UserMenu from "../components/UserMenu.vue";
import AppLogo from "../components/AppLogo.vue";

// クラス名は丸ごと書く(Tailwind は文字列をつないだクラス名を拾えない)
const colors = [
  ["ink", "bg-ink"],
  ["paper", "bg-paper"],
  ["grid", "bg-grid"],
  ["accent", "bg-accent"],
  ["muted", "bg-muted"],
  ["rule", "bg-rule"],
  ["pass", "bg-pass"],
  ["fail", "bg-fail"],
  ["watch", "bg-watch"],
  ["sticky", "bg-sticky"],
] as const;
</script>

<template>
  <div class="flex flex-col gap-10">
    <h1 class="text-3xl font-bold">
      部品の見本
    </h1>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        COLORS / FONTS
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          v-for="[name, cls] in colors"
          :key="name"
          class="border border-ink bg-white"
        >
          <div
            class="h-12 border-b border-ink"
            :class="cls"
          />
          <div class="px-2 py-1 font-mono text-xs">
            {{ name }}
          </div>
        </div>
      </div>
      <p class="text-lg">
        本文は IBM Plex Sans JP。<span class="font-mono">Labels, numbers, code: JetBrains Mono 0123</span>
      </p>
      <div class="w-fit border border-ink bg-white p-4 shadow-block">
        shadow-block の箱
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        AppLogo
      </h2>
      <AppLogo />
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        Avatar(sm / md / lg)
      </h2>
      <div class="flex items-end gap-4">
        <Avatar
          name="あき"
          handle="aki"
          size="sm"
        />
        <Avatar
          name="そら"
          handle="sora"
          size="md"
        />
        <Avatar
          name="りく"
          handle="riku"
          size="lg"
        />
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        Stamp
      </h2>
      <div class="flex flex-wrap items-start gap-8">
        <Stamp result="pass" />
        <Stamp result="fail" />
        <Stamp
          result="watch"
          :day="1"
        />
        <Stamp
          result="watch"
          :day="14"
        />
        <Stamp
          result="watch"
          :day="19"
        />
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        KindBadge
      </h2>
      <div class="flex gap-4">
        <KindBadge kind="post" />
        <KindBadge kind="memo" />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        StickyNote(row / page)
      </h2>
      <StickyNote>
        <span class="font-mono text-[11px] font-bold tracking-[0.14em] text-[#6B5300]">MEMO</span>
        <span class="text-lg font-bold">wsl --shutdown すると Podman が止まる</span>
      </StickyNote>
      <StickyNote
        size="page"
        :tilt="-1"
      >
        <h3 class="text-3xl font-bold">
          ページいっぱいの付箋
        </h3>
        <p class="text-[17px] leading-8">
          メモのページで使う大きさ。
        </p>
      </StickyNote>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="font-mono text-sm font-bold tracking-widest text-accent">
        FollowButton / UserMenu
      </h2>
      <div class="flex flex-wrap gap-4">
        <FollowButton
          handle="example"
          :following="false"
          :logged-in="false"
        />
        <FollowButton
          handle="example"
          :following="true"
          :logged-in="true"
        />
        <UserMenu
          handle="example"
          :blocking="false"
        />
        <UserMenu
          handle="example"
          :blocking="true"
        />
      </div>
    </section>
  </div>
</template>
