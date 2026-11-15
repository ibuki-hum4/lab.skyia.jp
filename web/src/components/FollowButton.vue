<script setup lang="ts">
// 「フォローする」⇄「フォロー中」。押したらすぐ見た目を変え、失敗したら元に戻す。
// ログイン前に押したら、ログインへ送る
import { ref, watch } from "vue";
import IconCheck from "~icons/lucide/check";
import IconPlus from "~icons/lucide/plus";
import { loginUrl, setFollow } from "../api";

const props = defineProps<{ handle: string; following: boolean; loggedIn: boolean }>();
const emit = defineEmits<{ change: [following: boolean]; error: [message: string] }>();

const on = ref(props.following);
const busy = ref(false);
watch(
  () => props.following,
  (v) => (on.value = v),
);

async function toggle() {
  if (!props.loggedIn) {
    window.location.assign(loginUrl(window.location.pathname));
    return;
  }
  if (busy.value) return;
  const next = !on.value;
  on.value = next; // 先に変える
  busy.value = true;
  try {
    const res = await setFollow(props.handle, next);
    if (!res.ok) throw new Error(String(res.status));
    emit("change", next);
  } catch {
    on.value = !next; // 元に戻す
    emit("error", next ? "フォローできませんでした" : "フォローを外せませんでした");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="on"
    class="inline-flex h-12 cursor-pointer items-center gap-2 border-2 px-5.5 text-[15px] font-bold transition-colors"
    :class="on ? 'border-ink bg-white text-ink' : 'border-ink bg-ink text-white hover:border-accent hover:bg-accent'"
    @click="toggle"
  >
    <IconCheck
      v-if="on"
      class="size-4.5"
      aria-hidden="true"
    />
    <IconPlus
      v-else
      class="size-4.5"
      aria-hidden="true"
    />
    {{ on ? "フォロー中" : "フォローする" }}
  </button>
</template>
