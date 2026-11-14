<script setup lang="ts">
/*
 * ページ: /tags/:tag(タグごとの一覧) ← やーはりが書く
 *
 * ■ このページでやること
 *   - 「#タグ名 の記事」という見出しと、そのタグの記事の一覧
 *   - ほかのタグの一覧(件数つき)も出して、タグからタグへ移れるようにする
 *
 * ■ 呼ぶ API
 *   - api("GET /api/posts", { query: { tag } })  → PostMeta[]
 *   - api("GET /api/tags")                        → { tag, count }[](多い順)
 *
 * ■ 使うとよい Vue の機能
 *   - props:      tag は props で受け取れる(router.ts で `props: true`)
 *   - watch:      別のタグへ移ったら読み直す
 *   - 使い回し:    一覧ページで作った PostCard.vue をそのまま使う
 *   - composable: 一覧ページと同じ「読み込み中・エラー・データ」の扱いを
 *                 src/composables/usePosts.ts のような関数にまとめてみる
 */
import NotYet from "../components/NotYet.vue";

defineProps<{ tag: string }>();
</script>

<template>
  <NotYet page="タグ" />
</template>
