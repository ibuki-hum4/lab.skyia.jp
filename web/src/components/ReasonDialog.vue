<script setup lang="ts">
// 理由を書いてもらうダイアログ(moderator がノートやコメントを隠すとき)。確かめるだけのときは reason なし
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { ref, watch } from "vue";
import { LIMITS } from "../api";

const props = withDefaults(
  defineProps<{ title: string; description: string; action: string; reason?: boolean; danger?: boolean }>(),
  { reason: false, danger: false },
);
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [reason: string] }>();

const text = ref("");
watch(open, (v) => {
  if (v) text.value = "";
});

function confirm() {
  if (props.reason && text.value.trim() === "") return;
  emit("confirm", text.value.trim());
  open.value = false;
}
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-30 bg-ink/40" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-40 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 border-2 border-ink bg-white p-6 shadow-block"
      >
        <AlertDialogTitle class="text-lg font-bold">
          {{ title }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-3 text-sm leading-7 text-[#3A3F45]">
          {{ description }}
        </AlertDialogDescription>
        <form
          class="mt-4 flex flex-col gap-4"
          @submit.prevent="confirm"
        >
          <label
            v-if="reason"
            class="flex flex-col gap-1.5"
          >
            <span class="font-mono text-xs tracking-widest text-muted">REASON / 理由(作者にも見えます)</span>
            <textarea
              v-model="text"
              rows="3"
              :maxlength="LIMITS.hideReason"
              required
              class="border border-ink p-2.5 text-sm"
            />
          </label>
          <div class="flex justify-end gap-3">
            <AlertDialogCancel
              type="button"
              class="h-11 cursor-pointer border-2 border-ink bg-white px-4 text-sm font-bold"
            >
              やめる
            </AlertDialogCancel>
            <button
              type="submit"
              class="h-11 cursor-pointer border-2 px-4 text-sm font-bold text-white disabled:opacity-50"
              :class="danger ? 'border-fail bg-fail' : 'border-ink bg-ink'"
              :disabled="reason && text.trim() === ''"
            >
              {{ action }}
            </button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
