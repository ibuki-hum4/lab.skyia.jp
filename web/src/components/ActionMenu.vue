<script setup lang="ts">
// 「…」のメニュー(ノートとコメント)。並べるものは呼ぶ側が決める。危ないもの(消す・隠す)は赤
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from "reka-ui";

export type MenuItem = { label: string; danger?: boolean; select: () => void };

withDefaults(defineProps<{ items: MenuItem[]; label?: string; size?: "md" | "sm" }>(), {
  label: "そのほかの操作",
  size: "md",
});

const itemClass =
  "flex h-11 cursor-pointer items-center border-b border-[#DDE0E3] px-4 text-sm outline-none last:border-b-0 data-highlighted:bg-paper";
</script>

<template>
  <DropdownMenuRoot v-if="items.length > 0">
    <DropdownMenuTrigger
      :aria-label="label"
      class="cursor-pointer border-ink bg-white font-bold text-ink"
      :class="size === 'md' ? 'h-10 w-10 border-2 text-lg' : 'h-8 w-8 border text-base'"
    >
      …
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        class="z-20 flex w-56 flex-col border-2 border-ink bg-white text-ink shadow-block"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.label"
          :class="[itemClass, item.danger ? 'font-bold text-fail' : '']"
          @select="item.select"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
