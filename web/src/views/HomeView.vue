<script setup lang="ts">
/*
 * ページ: /(一覧) ← やーはりが書く
 *
 * ■ このページでやること
 *   - 記事と実験の一覧を、新しい順に出す(タイトル・日付・タグ・summary)
 *   - 実験(type: experiment)には status(success / failure / observing)を印で出す
 *   - タイトルを押したら /posts/:slug へ、タグを押したら /tags/:tag へ
 *   - 「すべて / 記事 / 実験」で切り替えられるとよい
 *   - (あとで)検索の入力欄。打つたびに q を変えて呼び直す
 *
 * ■ 呼ぶ API(src/api.ts の api を使う)
 *   - api("GET /api/posts", { query: { type, tag, q } })  → PostMeta[]
 *     query はどれも省略できる
 *
 * ■ 使うとよい Vue の機能
 *   - ref:            一覧(PostMeta[])、読み込み中・エラーの状態
 *   - onMounted:      最初に 1 回 API を呼ぶ
 *   - v-for と :key:  一覧を並べる(key は slug)
 *   - v-if / v-else:  読み込み中・エラー・0 件の表示
 *   - computed:       「記事だけ」「実験だけ」に絞った一覧
 *   - RouterLink:     記事やタグへのリンク
 *   - コンポーネント:  1 件分を PostCard.vue に分けて、props で PostMeta を渡す
 *   - (検索)watch と VueUse の useDebounceFn: 打ち終わってから呼ぶ
 *   - (切り替え)Reka UI の ToggleGroup や Tabs
 */
import NotYet from "../components/NotYet.vue";
</script>

<template>
  <NotYet page="一覧" />
</template>
