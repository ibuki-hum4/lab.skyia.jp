<script setup lang="ts">
// いいね。押したらすぐ数を変え、失敗したら元に戻す。ログイン前に押したらログインへ
import { ref, watch } from "vue";
import IconHeart from "~icons/lucide/heart";
import { loginUrl, setLike } from "../api";

const props = defineProps<{ id: string; liked: boolean; count: number; loggedIn: boolean; disabled?: boolean }>();
const emit = defineEmits<{ error: [message: string] }>();

const on = ref(props.liked);
const n = ref(props.count);
const busy = ref(false);
watch(
  () => [props.liked, props.count] as const,
  ([l, c]) => {
    on.value = l;
    n.value = c;
  },
);

async function toggle() {
  if (!props.loggedIn) {
    window.location.assign(loginUrl(window.location.pathname));
    return;
  }
  if (busy.value || props.disabled) return;
  const next = !on.value;
  on.value = next;
  n.value += next ? 1 : -1;
  busy.value = true;
  try {
    const res = await setLike(props.id, next);
    if (!res.ok) throw new Error(String(res.status));
    on.value = res.data.liked;
    n.value = res.data.likes;
  } catch (err) {
    on.value = !next;
    n.value += next ? -1 : 1;
    emit("error", (err as Error).message === "429" ? "少し待ってからお試しください" : "いいねできませんでした");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="on"
    :disabled="disabled"
    class="inline-flex h-11 cursor-pointer items-center gap-2 border-2 border-ink px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
    :class="on ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-paper'"
    @click="toggle"
  >
    <IconHeart
      class="size-4.5"
      :class="on ? 'fill-current' : ''"
      aria-hidden="true"
    />
    いいね <span
      class="font-mono"
      data-testid="like-count"
    >{{ n }}</span>
  </button>
</template>
