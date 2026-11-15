# lab.skyia.jp

「実験室」と「技術ブログ」をいっしょにしたサイト。

| 場所 | 中身 |
| --- | --- |
| [content/](content/) | 記事と実験の Markdown |
| [server/](server/) | Senri(Bun)。API と、ビルド済みの画面を配る |
| [web/](web/) | Vue 3 + Vite + TypeScript + vue-router の SPA |
| [deploy/](deploy/) | k8s のマニフェスト(kustomize)と ArgoCD の Application |
| [Dockerfile](Dockerfile) | web のビルド → Bun の小さいイメージで server を動かす |

## 動かし方

[Bun](https://bun.sh) 1.4 以降を使います。

```bash
bun install
bun dev            # server(3927)と web(5173)が両方立ち上がる
```

**ブラウザでは http://localhost:5173 を開きます。** API(`/api/...`)と `/healthz` は、Vite が Senri(http://localhost:3927)へ回すので、Vite の URL だけで API まで動きます。

- 画面の変更はすぐ反映され、server の変更では server が立ち上がり直します
- 開発中のいいねは `.data/lab.db` に保存されます(git には入りません)
- Vue DevTools は、画面で Alt+Shift+D を押すか http://localhost:5173/__devtools__/ で開けます
- Senri の開発用ダッシュボードは http://localhost:3927/_senri で見られます

| コマンド | すること |
| --- | --- |
| `bun dev` | server と web を開発モードで立ち上げる |
| `bun run test` | server の API のテスト |
| `bun run typecheck` | server と web の型チェック |
| `bun run lint` | web の ESLint |
| `bun run build` | web をビルドする(`web/dist`) |
| `bun run start` | ビルド済みの web を server から配る(http://localhost:3927) |

## API

| ルート | 返すもの |
| --- | --- |
| `GET /api/posts` | 一覧(新しい順)。`?type=post\|experiment`、`?tag=xxx`、`?q=検索語`(タイトルと本文)で絞り込める |
| `GET /api/posts/:slug` | 1 本ぶん。本文の HTML、目次(`toc`)、いいねの数(`likes`)つき。ないときは 404 |
| `GET /api/tags` | タグと件数(多い順) |
| `POST /api/posts/:slug/like` | いいねを 1 増やす。同じ人・同じ記事は 60 秒に 1 回まで(超えたら 429) |
| `GET /healthz` | 動いていれば 200 |

- `/api` の下で見つからないものは `{"error":"not_found"}` の 404 です
- それ以外のパスには、ビルド済みの画面(`index.html`)を返します(SPA なので)
- 型は [server/src/routes.ts](server/src/routes.ts) の `Api` です。web からは [web/src/api.ts](web/src/api.ts) の `api(...)` で、型付きで呼べます

## 記事の足し方

`content/` に Markdown を置きます。**ファイル名が slug(URL)になります**(英小文字・数字・ハイフン)。

```markdown
---
title: タイトル
date: 2026-11-14
tags: [vue, senri]
type: post            # post(記事)か experiment(実験)
status: observing     # 実験のときだけ。success / failure / observing
summary: 一覧に出す短い説明
---

## 見出し

本文……
```

- server は起動時に全部読んで HTML にするので、足したら server を立ち上げ直します(`bun dev` なら、server のファイルを保存するか、止めてもう一度)
- frontmatter の書き間違い(`type` がない、`date` の形が違うなど)は、起動時にエラーで知らせます
- Markdown の中の生の HTML は通しません(文字のまま出ます)
- コードの色付けは、[server/src/markdown.ts](server/src/markdown.ts) に並べた言語だけです。足りなければ、そこに足します

## Docker

```bash
docker build -t lab .
docker run --rm -p 3927:3927 -v lab-data:/data lab
# http://localhost:3927
```

- 1 段目で web を Vite でビルドし、server を 1 つのファイルにまとめます。2 段目は `oven/bun:*-alpine` に、そのファイル・ビルド済みの web・`content/` だけを入れます
- root ではなく `bun` ユーザー(uid 1000)で動きます
- `HEALTHCHECK` で `/healthz` を見ます
- SQLite は `/data/lab.db` です。`/data` は外からつなぎます

## デプロイ

| | |
|---|---|
| ドメイン | `lab.skyia.jp` |
| レジストリ | `ghcr.io/ibuki-hum4/lab.skyia.jp` |
| Ingress | Traefik(TLS はクラスタ側で解決するので、Ingress には書かない) |
| マニフェスト | [deploy/](deploy/)(kustomize。`kubectl kustomize deploy` で中身を確かめられる) |

形は HoshID の `k8s/` と `.github/workflows/image.yml` にそろえています。

### 出し方

```bash
git tag v0.1.0
git push origin v0.1.0
```

1. CI([image.yml](.github/workflows/image.yml))がイメージに `v0.1.0` を付けて ghcr.io へ push
2. ArgoCD Image Updater が最新の `vX.Y.Z` を拾い、[kustomization.yaml](deploy/kustomization.yaml) を書き換えて Git に commit
3. ArgoCD が同期する

Image Updater が入っていない場合は、`kustomization.yaml` の `newTag` を手で書き換えて push すれば同じ結果になります。

**中身が入れ替わるタグは使わない。** CI は毎回 `sha-<短いSHA>` を付け、`vX.Y.Z` はそのタグを打ったときだけ付けます。ブランチ名や `latest` は付けません。PR ではビルドと起動の確認だけをして、公開はしません。

### 戻すとき

`kustomization.yaml` の `newTag` を前の版に戻して push します。Image Updater は「最新の」`vX.Y.Z` を追うので、壊れた版を出したまま戻すと書き戻されることがあります。そのときは直した版を新しいタグ(`v0.1.1` など)で打ちます。

SQLite の中身(いいねの数)は PVC にあり、イメージを戻しても戻りません。

### 初回

1. **`TRUSTED_PROXIES` を確かめる。** Traefik の Pod が属する CIDR を [configmap.yaml](deploy/configmap.yaml) に入れます。MicroK8s の既定は `10.1.0.0/16`(Calico)で、HoshID と同じ値を入れてあります。

   ```bash
   kubectl get pod -A -l app.kubernetes.io/name=traefik -o wide
   ```

   接続元がこの範囲のときだけ `X-Forwarded-For` を読みます([client-ip.ts](server/src/client-ip.ts))。ずれていると全員が Traefik の IP に見え、いいねの連打の制限が全員で 1 つになります(**気づける形では壊れない**)。
2. **最初のタグを打つ。** `kustomization.yaml` は `v0.1.0` を指しているので、`v0.1.0` を打ってイメージを作っておきます。
3. **ghcr.io のパッケージを公開にする**(または `imagePullSecrets` を足す)。非公開のままだと、クラスタから pull できません。
4. **Application を手で適用する。**

   ```bash
   kubectl apply -f deploy/argocd-application.yaml
   ```

   自動で同期しますが、`selfHeal` は付けていません(障害対応で手作業した変更を勝手に戻さないため)。

### 未完了

- [ ] **DB を PostgreSQL に移す(PR2)。** `postgres:17-alpine` の StatefulSet、マイグレーションの Job(Sync フック、sync-wave 1。アプリは 2)、`pg_dump` の CronJob、SealedSecret。移したら SQLite 用の [pvc.yaml](deploy/pvc.yaml) を消し、`replicas` と `strategy: Recreate` を見直す
- [ ] **`TRUSTED_PROXIES` の答え合わせ。** デプロイ後、いいねを 2 つの回線から押して、片方が 429 にならないことを確かめる

### 構成

| ファイル | 中身 |
|---|---|
| `deployment.yaml` | アプリ本体。SQLite なので `replicas: 1`・`Recreate`。startup と readiness は `/healthz`、liveness は TCP |
| `pvc.yaml` | SQLite(`/data`)。StorageClass はクラスタの既定。PR2 で消す |
| `configmap.yaml` | 秘密でない設定(`TRUSTED_PROXIES`) |
| `service.yaml` | ClusterIP、80 → 3927 |
| `ingress.yaml` | Traefik。`lab.skyia.jp` |
| `kustomization.yaml` | `images` で `vX.Y.Z` に差し替える。Image Updater が書き換える |
| `argocd-application.yaml` | ArgoCD に手で適用する。`resources` には入れない |

## CI(GitHub Actions)

- [ci.yml](.github/workflows/ci.yml): PR と main で、型チェック・lint・テスト・web のビルド
- [image.yml](.github/workflows/image.yml): PR ではビルドと起動の確認だけ。main と `vX.Y.Z` のタグでは ghcr.io に公開する。使う秘密の値は `GITHUB_TOKEN` だけ

## 選んだライブラリ

### server

| ライブラリ | 理由 |
| --- | --- |
| `@senrijs/senri` | サーバー本体。`defineRoutes` の型を web の型付きクライアントにそのまま渡せる。`rateLimit`・`health`・`serveStatic`・`secureHeaders`・`trustProxy`・テスト用の `testClient` まで入っていて、ほかを足さずに済む |
| `markdown-it` | Markdown の変換。`html: false` で生の HTML をエスケープし、`javascript:` のリンクも既定で通さない。安全側の既定が、設定 1 つで揃う(`marked` は生の HTML を通すので、自分で止める必要がある) |
| `shiki` | コードの色付け(指定どおり)。使う言語だけを読み込み、WebAssembly を使わない JavaScript のエンジンにして、server を 1 つのファイルにまとめられるようにしている |

足さなかったもの:

- **frontmatter:** `gray-matter` などは使わず、Bun に入っている `Bun.YAML.parse` で読む
- **見出しの id と目次:** `markdown-it-anchor` などは使わず、[markdown.ts](server/src/markdown.ts) で 30 行ほどで作る(日本語の見出しは、そのまま id にする)
- **SQLite:** Bun に入っている `bun:sqlite`
- **バリデーション(Zod など):** クエリは 3 つの文字列だけなので、ハンドラーで読む

### web

| ライブラリ | 理由 |
| --- | --- |
| `vue`・`vue-router`・`vite` | 指定どおり |
| `tailwindcss`(v4)・`@tailwindcss/typography` | 見た目。記事の本文(サーバーが作った HTML)は `class="prose"` で整える |
| `reka-ui` | 見た目なしの部品(Dialog・Tabs・Toast など)。キーボード操作やアクセシビリティを任せられる |
| `unplugin-icons`・`@iconify-json/lucide` | アイコン。`import IconX from "~icons/lucide/x"` と書いたものだけ取り込む。ほかのセットを使うなら `@iconify-json/<セット名>` を足す |
| `@vueuse/core` | よく使う composable(`useDebounceFn`・`useTitle` など) |
| `vue-tsc`・`eslint`・`eslint-plugin-vue`・`@vue/eslint-config-typescript` | `.vue` の型チェックと lint |
| `vite-plugin-vue-devtools` | 開発中だけ Vue DevTools を出す(ビルドには入らない) |

**auto-import の類(`unplugin-auto-import`・`unplugin-vue-components`)は入れていません。** 勉強のため、`ref` もコンポーネントもアイコンも、使うものは import を書きます。

TypeScript は 6.0 にしています。7.0 は、`vue-tsc` と `typescript-eslint` がまだ対応していないためです。

## これから書くページ(おすすめの順番)

画面は、見本の [/about](web/src/views/AboutView.vue) のほかは、まだ「ここはまだ作っていません」と出るだけです。各ファイルの先頭のコメントに「このページでやること」「呼ぶ API」「使うとよい Vue の機能」を書いてあります。

1. **一覧**([HomeView.vue](web/src/views/HomeView.vue)): `ref`・`onMounted`・`v-for`・`v-if` で、API を呼んで並べる基本
2. **記事**([PostView.vue](web/src/views/PostView.vue)): props でパラメーターを受け取り、`watch` で読み直す。`v-html` と `prose`、目次
3. **タグ**([TagView.vue](web/src/views/TagView.vue)): 一覧で作った部品を使い回し、composable にまとめてみる
4. **いいねボタン**: コンポーネントを分けて、props と emit。429(連打)のときの表示
5. **検索**: 一覧に入力欄を足して、`watch` と `useDebounceFn` で打ち終わってから呼ぶ
