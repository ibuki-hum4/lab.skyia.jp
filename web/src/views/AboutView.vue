<!--
  見本のページ: /about(このサイトの説明)
  Vue の基本が 1 つずつ出てくるように書いてある。【】の印のところを見てね。
-->

<!-- 【script setup】ここに書いた変数や import は、そのまま下の template で使える -->
<script setup lang="ts">
import { computed, ref } from "vue";
// 【Iconify】使うアイコンだけを import する(unplugin-icons がその 1 つだけを取り込む)
// 名前は "~icons/セット名/アイコン名"。アイコンは https://icones.js.org で探せる
import IconFlask from "~icons/lucide/flask-conical";
import TechItem from "../components/TechItem.vue";

// ただの配列(変わらない値なので ref にしなくてよい)
const stack = [
  { name: "Vue 3 + Vite", role: "画面" },
  { name: "Senri", role: "サーバー(Bun)" },
  { name: "SQLite", role: "いいねの保存" },
  { name: "Kubernetes + ArgoCD", role: "置き場所" },
];

// 【ref】変わる値。中身は .value で読み書きする(template の中では .value を書かない)
const showAll = ref(false);

// 【computed】ほかの値から計算する値。showAll が変わると、自動で計算し直される
const visibleStack = computed(() => (showAll.value ? stack : stack.slice(0, 2)));
</script>

<template>
  <article class="space-y-6">
    <h1 class="flex items-center gap-2 text-2xl font-bold">
      <IconFlask
        class="size-6"
        aria-hidden="true"
      />
      このサイトについて
    </h1>

    <p>
      lab.skyia.jp は、試してみたことを置いておく「実験室」と、わかったことを書く「技術ブログ」をいっしょにしたサイトです。
    </p>

    <section>
      <h2 class="mb-2 text-lg font-bold">
        使っているもの
      </h2>
      <ul>
        <!-- 【v-for】配列の数だけくり返す。:key には、ほかと重ならない値を渡す -->
        <!-- 【props】:name="item.name" のように、子のコンポーネントへ値を渡す -->
        <TechItem
          v-for="item in visibleStack"
          :key="item.name"
          :name="item.name"
          :role="item.role"
        />
      </ul>
      <!-- @click で ref の値を書き換えると、computed と画面が自動で変わる -->
      <button
        type="button"
        class="mt-2 text-sm underline"
        @click="showAll = !showAll"
      >
        {{ showAll ? "たたむ" : "もっと見る" }}
      </button>
    </section>
  </article>
</template>
