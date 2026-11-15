<script setup lang="ts">
// 「…」のメニュー。リンクをコピー、@〇〇 をブロック(赤。確認のダイアログを出してから)。通報はまだ作らない
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import { ref } from "vue";
import { setBlock } from "../api";

const props = defineProps<{ handle: string; blocking: boolean }>();
const emit = defineEmits<{ change: [blocking: boolean]; message: [text: string] }>();

const confirming = ref(false);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/@${props.handle}`);
    emit("message", "リンクをコピーしました");
  } catch {
    emit("message", "コピーできませんでした");
  }
}

async function apply(on: boolean) {
  const res = await setBlock(props.handle, on);
  if (res.ok) {
    emit("change", on);
    emit("message", on ? `@${props.handle} をブロックしました` : `@${props.handle} のブロックを外しました`);
  } else {
    emit("message", "できませんでした。もう一度お試しください");
  }
}

const itemClass =
  "flex h-11 cursor-pointer items-center border-b border-[#DDE0E3] px-4 text-sm outline-none last:border-b-0 data-highlighted:bg-paper";
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      aria-label="そのほかの操作"
      class="h-12 w-12 cursor-pointer border-2 border-ink bg-white text-xl font-bold text-ink"
    >
      …
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="8"
        class="z-20 flex w-56 flex-col border-2 border-ink bg-white text-ink shadow-block"
      >
        <DropdownMenuItem
          :class="itemClass"
          @select="copyLink"
        >
          リンクをコピー
        </DropdownMenuItem>
        <DropdownMenuItem
          v-if="!blocking"
          :class="[itemClass, 'font-bold text-fail']"
          @select="confirming = true"
        >
          @{{ handle }} をブロック
        </DropdownMenuItem>
        <DropdownMenuItem
          v-else
          :class="itemClass"
          @select="apply(false)"
        >
          @{{ handle }} のブロックを外す
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <AlertDialogRoot v-model:open="confirming">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-30 bg-ink/40" />
      <AlertDialogContent
        class="fixed top-1/2 left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 border-2 border-ink bg-white p-6 shadow-block"
      >
        <AlertDialogTitle class="text-lg font-bold">
          @{{ handle }} をブロックしますか?
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-3 text-sm leading-7 text-[#3A3F45]">
          お互いのフォローが外れ、@{{ handle }} はあなたをフォローできなくなります。ブロックしたことは相手に知らされません。
        </AlertDialogDescription>
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel class="h-11 cursor-pointer border-2 border-ink bg-white px-4 text-sm font-bold">
            やめる
          </AlertDialogCancel>
          <AlertDialogAction
            class="h-11 cursor-pointer border-2 border-fail bg-fail px-4 text-sm font-bold text-white"
            @click="apply(true)"
          >
            ブロックする
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
