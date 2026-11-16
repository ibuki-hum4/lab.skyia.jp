<script setup lang="ts">
// /settings/profile: 表示名・自己紹介・アイコン画像。ハンドルは変えられない
import { useTitle } from "@vueuse/core";
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { RouterLink } from "vue-router";
import IconUpload from "~icons/lucide/upload";
import { api, LIMITS } from "../api";
import Avatar from "../components/Avatar.vue";
import { useMe } from "../composables/useMe";
import { clampCrop, drawCrop, renderAvatar, type Crop } from "../lib/avatar";
import { errorMessage } from "../lib/notes";

useTitle("プロフィールの設定 - skyia/lab");
const { refresh } = useMe();

const handle = ref<string | null>(null);
const displayName = ref("");
const bio = ref("");
const avatar = ref<string | null>(null);
const state = ref<"loading" | "ok" | "error">("loading");
const saving = ref(false);
const message = ref("");
const error = ref("");

onMounted(async () => {
  const res = await api("GET /api/me/profile");
  if (!res.ok) {
    state.value = "error";
    return;
  }
  handle.value = res.data.handle;
  displayName.value = res.data.displayName;
  bio.value = res.data.bio;
  avatar.value = res.data.avatar;
  state.value = "ok";
});

async function save() {
  saving.value = true;
  error.value = "";
  message.value = "";
  const res = await api("PATCH /api/me/profile", { body: { displayName: displayName.value, bio: bio.value } });
  saving.value = false;
  if (res.ok) {
    displayName.value = res.data.displayName;
    bio.value = res.data.bio;
    message.value = "保存しました";
    void refresh();
  } else {
    error.value = errorMessage(res.error);
  }
}

// ---- アイコン: 選んだ画像を、枠の中で動かして切り抜く ----
const VIEW = 240;
const picked = ref<HTMLImageElement | null>(null);
const crop = ref<Crop>({ zoom: 1, x: 0, y: 0 });
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
const uploading = ref(false);
const avatarError = ref("");

function pick(e: Event) {
  avatarError.value = "";
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    avatarError.value = "画像を選んでください";
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    picked.value = img;
    crop.value = { zoom: 1, x: 0, y: 0 };
  };
  img.onerror = () => {
    avatarError.value = "画像として読めませんでした";
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function redraw() {
  const ctx = canvas.value?.getContext("2d");
  if (!ctx || !picked.value) return;
  drawCrop(ctx, picked.value, VIEW, crop.value, VIEW * 2);
}
watch([picked, crop, canvas], redraw, { deep: true });

function setCrop(next: Crop) {
  if (picked.value) crop.value = clampCrop(picked.value.width, picked.value.height, VIEW, next);
}

let drag: { px: number; py: number; x: number; y: number } | null = null;
function onDown(e: PointerEvent) {
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  drag = { px: e.clientX, py: e.clientY, x: crop.value.x, y: crop.value.y };
}
function onMove(e: PointerEvent) {
  if (!drag) return;
  setCrop({ ...crop.value, x: drag.x + e.clientX - drag.px, y: drag.y + e.clientY - drag.py });
}
const onUp = () => (drag = null);
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 20 : 4;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  setCrop({ ...crop.value, x: crop.value.x + d[0]!, y: crop.value.y + d[1]! });
}
const zoom = computed({
  get: () => crop.value.zoom,
  set: (v: number) => setCrop({ ...crop.value, zoom: Number(v) }),
});

async function upload() {
  if (!picked.value) return;
  uploading.value = true;
  avatarError.value = "";
  try {
    const blob = await renderAvatar(picked.value, VIEW, crop.value);
    const res = await api("PUT /api/me/avatar", { body: blob });
    if (res.ok) {
      avatar.value = res.data.avatar;
      URL.revokeObjectURL(picked.value.src);
      picked.value = null;
      message.value = "アイコンを変えました";
      void refresh();
    } else {
      avatarError.value = res.status === 429 ? "続けて変えすぎです。少し待ってからお試しください" : errorMessage(res.error);
    }
  } catch (err) {
    avatarError.value = (err as Error).message;
  } finally {
    uploading.value = false;
  }
}

async function removeAvatar() {
  const res = await api("DELETE /api/me/avatar");
  if (res.ok) {
    avatar.value = null;
    message.value = "アイコンを外しました";
    void refresh();
  }
}

function cancelPick() {
  if (picked.value) URL.revokeObjectURL(picked.value.src);
  picked.value = null;
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-mono text-xs font-bold tracking-[0.12em] text-accent">
        SETTINGS / PROFILE
      </p>
      <h1 class="text-3xl font-bold">
        プロフィールの設定
      </h1>
    </div>

    <p
      v-if="state === 'loading'"
      class="font-mono text-sm text-muted"
    >
      読み込んでいます…
    </p>
    <p
      v-else-if="state === 'error'"
      class="text-fail"
      role="alert"
    >
      読み込めませんでした。ログインしているか確かめてください。
    </p>

    <template v-else>
      <p
        v-if="message"
        class="border-2 border-pass bg-white px-4 py-2.5 text-sm text-pass"
        role="status"
      >
        {{ message }}
      </p>

      <section
        aria-labelledby="avatar-title"
        class="flex flex-col gap-4 border border-ink bg-white p-5 shadow-block sm:p-7"
      >
        <h2
          id="avatar-title"
          class="text-lg font-bold"
        >
          アイコン
        </h2>
        <div
          v-if="!picked"
          class="flex flex-wrap items-center gap-5"
        >
          <Avatar
            :name="displayName"
            :handle="handle"
            :src="avatar"
            size="lg"
          />
          <div class="flex flex-col gap-2">
            <label class="inline-flex h-11 w-fit cursor-pointer items-center gap-2 border-2 border-ink bg-white px-4 text-sm font-bold hover:bg-paper focus-within:outline-2 focus-within:outline-accent">
              <IconUpload
                class="size-4"
                aria-hidden="true"
              />画像を選ぶ
              <input
                type="file"
                accept="image/*"
                class="sr-only"
                data-testid="avatar-file"
                @change="pick"
              >
            </label>
            <button
              v-if="avatar"
              type="button"
              class="w-fit cursor-pointer text-sm text-fail underline"
              @click="removeAvatar"
            >
              アイコンを外す(頭文字に戻す)
            </button>
            <p class="text-xs text-muted">
              正方形に切り抜いて、256px にしてから送ります。
            </p>
          </div>
        </div>
        <div
          v-else
          class="flex flex-wrap items-start gap-6"
        >
          <canvas
            ref="canvas"
            :width="VIEW * 2"
            :height="VIEW * 2"
            :style="{ width: `${VIEW}px`, height: `${VIEW}px` }"
            class="cursor-move touch-none border-2 border-ink"
            tabindex="0"
            role="img"
            aria-label="切り抜きの位置。ドラッグか矢印キーで動かす"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
            @keydown="onKey"
          />
          <div class="flex min-w-48 grow flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="font-mono text-xs tracking-widest text-muted">ZOOM / 大きさ</span>
              <input
                v-model.number="zoom"
                type="range"
                min="1"
                max="4"
                step="0.01"
                class="accent-ink"
              >
            </label>
            <p class="text-xs text-muted">
              ドラッグ(か矢印キー)で位置を合わせます。
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="h-11 cursor-pointer border-2 border-ink bg-white px-4 text-sm font-bold"
                @click="cancelPick"
              >
                やめる
              </button>
              <button
                type="button"
                class="h-11 cursor-pointer border-2 border-ink bg-ink px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
                :disabled="uploading"
                @click="upload"
              >
                {{ uploading ? "送っています…" : "この位置で決める" }}
              </button>
            </div>
          </div>
        </div>
        <p
          v-if="avatarError"
          class="text-sm text-fail"
          role="alert"
        >
          {{ avatarError }}
        </p>
      </section>

      <form
        class="flex flex-col gap-5 border border-ink bg-white p-5 shadow-block sm:p-7"
        @submit.prevent="save"
      >
        <div class="flex flex-col gap-1.5">
          <span class="font-mono text-xs tracking-widest text-muted">HANDLE / ハンドル</span>
          <p class="font-mono text-lg">
            @{{ handle }} <span class="font-sans text-xs text-muted">(変えられません)</span>
          </p>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="font-mono text-xs tracking-widest text-muted">DISPLAY NAME / 表示名</span>
          <input
            v-model="displayName"
            type="text"
            required
            :maxlength="LIMITS.displayName"
            class="h-11 border-2 border-ink px-3 text-base"
          >
          <span class="text-right font-mono text-xs text-muted">{{ displayName.length }} / {{ LIMITS.displayName }}</span>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-mono text-xs tracking-widest text-muted">BIO / 自己紹介</span>
          <textarea
            v-model="bio"
            rows="4"
            :maxlength="LIMITS.bio"
            class="border-2 border-ink p-3 text-[15px] leading-relaxed"
          />
          <span class="text-right font-mono text-xs text-muted">{{ bio.length }} / {{ LIMITS.bio }}</span>
        </label>
        <p
          v-if="error"
          class="text-sm text-fail"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="flex items-center justify-between gap-3">
          <RouterLink
            v-if="handle"
            :to="`/@${handle}`"
            class="text-sm text-accent hover:underline"
          >
            自分のページを見る
          </RouterLink>
          <button
            type="submit"
            class="h-11 cursor-pointer border-2 border-ink bg-accent px-6 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
            :disabled="saving"
          >
            保存する
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
