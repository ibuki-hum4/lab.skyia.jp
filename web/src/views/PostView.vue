<script setup lang="ts">
/*
 * ページ: /posts/:slug(記事 1 本) ← やーはりが書く
 *
 * ■ このページでやること
 *   - タイトル・日付・タグ・(実験なら)status を出す
 *   - 本文(サーバーが HTML にしたもの)を出す
 *   - 目次(toc)を出して、押したら見出しへ飛ぶ(リンク先は `#${item.id}`)
 *   - いいねの数と、いいねボタン
 *   - 記事がなければ「見つかりません」
 *
 * ■ 呼ぶ API
 *   - api("GET /api/posts/:slug", { params: { slug } })
 *       → { ...PostMeta, html, toc: TocItem[], likes }。ないときは res.status === 404
 *   - api("POST /api/posts/:slug/like", { params: { slug } })
 *       → { likes }。連打すると res.status === 429(少し待ってね、と出す)
 *
 * ■ 使うとよい Vue の機能
 *   - props:     router.ts で `props: true` にしてあるので、slug は props で受け取れる
 *                const props = defineProps<{ slug: string }>()
 *   - watch:     別の記事へ移ったとき(slug が変わったとき)に読み直す
 *                watch(() => props.slug, load, { immediate: true })
 *   - v-html:    本文の HTML を出す。サーバーで生の HTML を通さないようにしてあるので使ってよい
 *                (ほかから来た文字には v-html を使わない)
 *   - class="prose": @tailwindcss/typography で本文を読みやすくする
 *   - v-for:     目次
 *   - コンポーネント: いいねボタンは LikeButton.vue に分ける(props で slug と数、emit で増えたことを知らせる)
 *   - (いいね)Reka UI の Toast や Tooltip で「ありがとう」「少し待ってね」を出す
 *   - (タイトル)VueUse の useTitle でタブの名前を記事のタイトルにする
 */
import NotYet from "../components/NotYet.vue";

defineProps<{ slug: string }>();
</script>

<template>
  <NotYet page="記事" />
</template>
