# lab.skyia.jp

「実験室」と「技術ブログ」をいっしょにしたサイト。

| 場所 | 中身 |
| --- | --- |
| [server/](server/) | Senri(Bun)。API と、ビルド済みの画面を配る |
| [web/](web/) | Vue 3 + Vite + TypeScript + vue-router の SPA |
| [deploy/](deploy/) | k8s のマニフェスト(kustomize)と ArgoCD の Application |
| [Dockerfile](Dockerfile) | web のビルド → Bun の小さいイメージで server を動かす |

## 動かし方

[Bun](https://bun.sh) 1.4 以降と、PostgreSQL を立てるための Podman(か Docker)を使います。

```bash
bun install                 # postinstall で Prisma のクライアント(server/src/generated)も作られる
cp .env.example .env        # BETTER_AUTH_SECRET だけは自分で入れる(openssl rand -base64 32)
podman compose up -d        # PostgreSQL(lab と、テスト用の lab_test)
bun run migrate             # マイグレーションを当てる(prisma migrate deploy)
bun run dev:oidc            # 別のターミナルで。ニセの HoshID(http://127.0.0.1:9999)
bun dev                     # server(3927)と web(5173)
```

**ブラウザでは http://localhost:5173 を開きます。** `/api`・`/auth`・`/healthz` は、Vite が Senri(http://localhost:3927)へ回します。「HoshID でログイン」を押すと、ニセの HoshID でユーザー(sub・表示名・ニックネーム・ロール)を選べます。

- `podman compose` は中で `docker-compose` を使います。Docker 互換の API でポートを開けるところが nftables のエラーで止まる環境では、`podman-compose` を入れるか、同じ設定を `podman run` で立てます(`-p 127.0.0.1:5432:5432 -e POSTGRES_DB=lab -e POSTGRES_USER=lab -e POSTGRES_PASSWORD=lab -v ./dev/initdb:/docker-entrypoint-initdb.d:ro postgres:17-alpine`)
- 部品の見本は http://localhost:5173/_components(リンクは張っていません)
- Vue DevTools は Alt+Shift+D、Senri の開発用ダッシュボードは http://localhost:3927/_senri

| コマンド | すること |
| --- | --- |
| `bun dev` | server と web を開発モードで立ち上げる |
| `bun run dev:oidc` | ニセの HoshID を立てる |
| `bun run migrate` | マイグレーションを当てる |
| `bun run test` | server のテスト(テスト用の PostgreSQL を使う)と、web の部品のテスト(Vitest) |
| `bun run typecheck` | server と web の型チェック |
| `bun run lint` | web の ESLint |
| `bun run build` | web をビルドする(`web/dist`) |

server のテストは `TEST_DATABASE_URL`(既定は `postgresql://lab:lab@127.0.0.1:5432/lab_test`)の DB を、毎回まっさらにして使います。ほかの DB を指さないこと。

## ログイン

HoshID(OIDC)でログインします。[Better Auth](https://www.better-auth.com) の genericOAuth を使い、トークンはサーバーの DB にだけ置きます(BFF)。ブラウザが持つのは `__Host-lab_session` の Cookie(HttpOnly・Secure・SameSite=Lax・Path=/、30 日。使うたびに延ばす)だけです。

| ルート | すること |
| --- | --- |
| `GET /auth/login?next=/...` | state・nonce・PKCE(S256)を作り、HoshID へ送る。`next` はサイト内の相対パスだけ |
| `GET /auth/callback/hoshid` | HoshID から戻るところ。ID トークン(署名・iss・aud・exp・nonce)を確かめ、ユーザーを作るか探し、表示名とロールを上書きする。凍結中ならセッションを作らない |
| `GET /auth/after` | ハンドルがまだなら `/welcome` へ、あれば `next` へ |
| `POST /auth/logout` | セッションを消し、HoshID の end_session へ(`id_token_hint` つき) |

- 読むのは誰でもでき、書くにはログインが要ります。書き込みはすべて `csrf()` を通します(よそのサイトからの書き込みは 403)
- ロールは HoshID のクレームから決めます。クレームの名前と値の対応は `HOSHID_ROLES_CLAIM` と `HOSHID_ROLE_MAP` で変えられます

## API

| ルート | 返すもの |
| --- | --- |
| `GET /api/me` | ログイン中なら `{ handle, displayName, role }`、ログイン前は `null` |
| `POST /api/me/handle` | 初回だけハンドルを決める(`{ handle }`)。ログインが要る |
| `GET /api/me/blocks` | 自分がブロックしている人。本人だけ |
| `GET /api/handles/:handle/available` | ハンドルが使えるか(`{ available, reason? }`) |
| `GET /api/users/:handle` | ハンドル・表示名・自己紹介・フォロー数・フォロワー数。ログイン中は `viewer`(フォローしているか・されているか・ブロックしているか)も |
| `GET /api/users/:handle/followers`・`/following` | フォロワー・フォロー中の一覧 |
| `POST`・`DELETE /api/users/:handle/follow` | フォローする・外す。ブロックし合っている相手は 403 |
| `POST`・`DELETE /api/users/:handle/block` | ブロックする・外す。ブロックするとお互いのフォローを消す。相手には知らせない |
| `GET /api/notes` | ノートの一覧(新しい順、カーソルでページ送り)。`?kind=`・`?status=`・`?tag=`・`?author=`・`?following=1`・`?drafts=1`(本人だけ)・`?q=`・`?cursor=`・`?limit=` |
| `POST /api/notes` | 作る(`{ kind, title, body, status?, tags?, draft?, link?: { kind: "replication" | "derivation", sourceId } }`) |
| `GET`・`PATCH`・`DELETE /api/notes/:id`、`POST /api/notes/:id/publish` | 1 件・直す(下書きの保存)・消す・公開。直す・消す・公開は本人だけ |
| `GET /api/users/:handle/notes/:code` | `/@aki/EXP-006` の形で 1 件 |
| `GET /api/notes/:id/replications`・`/lineage`・`/related` | 追試の一覧・系譜(派生を上下 3 段)・同じタグのノート |
| `GET`・`POST /api/notes/:id/comments`、`PATCH`・`DELETE /api/comments/:id` | コメント。直す・消すは本人だけ(消したら「削除されました」) |
| `POST`・`DELETE /api/notes/:id/like` | いいね。数を返す |
| `GET /api/notes/tags`・`/api/notes/fails`・`/api/members`・`/api/search?q=` | タグと数・今週の FAIL・メンバー・検索(ノート・タグ・メンバー) |
| `POST /api/notes/preview` | エディタのプレビュー(保存しない) |
| `GET`・`PATCH /api/me/profile`、`PUT`・`DELETE /api/me/avatar`、`GET /api/users/:handle/avatar` | 表示名・自己紹介・アイコン(256KB まで、中身で判定。`?v=<ハッシュ>` で長くキャッシュ) |
| `POST`・`DELETE /api/notes/:id/hide`・`/api/comments/:id/hide` | moderator 以上。理由を付けて隠す・戻す |
| `POST`・`DELETE /api/admin/users/:handle/suspend` | admin。凍結(セッションも消す)・解除 |
| `GET /healthz` | 動いていれば 200(DB は見ない) |

- 長さの上限と連打の制限は [server/src/limits.ts](server/src/limits.ts)
- ブロック: blocker の一覧・検索・タグ・コメント欄・追試の一覧・系譜から blocked のノートとコメントを外す。ブロックし合っている 2 人のあいだでは、コメント・追試・いいね・派生ができない。ノートそのものは URL を開けば誰でも読める

- 型は [server/src/routes.ts](server/src/routes.ts) の `Api` です。web からは [web/src/api.ts](web/src/api.ts) の `api(...)` で、型付きで呼べます

## ノートの本文(Markdown)

- サーバーで HTML にしてから返します(保存のときに作って DB に置く)。生の HTML は通しません(文字のまま出ます)
- リンクは http・https・mailto とサイトの中だけ。外へのリンクには `rel="noopener noreferrer ugc"` を付けます
- コードの色付けは、[server/src/markdown.ts](server/src/markdown.ts) に並べた言語だけです。足りなければ、そこに足します

## Docker

[Dockerfile](Dockerfile) から 2 つのイメージを作ります(HoshID と同じ形)。

| target | 中身 |
| --- | --- |
| `app`(既定) | `oven/bun:*-alpine` に、1 つにまとめた server(Prisma のクライアント入り)・ビルド済みの web |
| `migrator` | `oven/bun:*-slim` に、Prisma の CLI とマイグレーション。`bun run migrate`(`prisma migrate deploy`)を流す |

どちらも uid 1000 で動きます。

## デプロイ

| | |
|---|---|
| ドメイン | `lab.skyia.jp` |
| レジストリ | `ghcr.io/ibuki-hum4/lab.skyia.jp`(アプリ)と `ghcr.io/ibuki-hum4/lab.skyia.jp-migrator` |
| DB | PostgreSQL(`postgres:17-alpine` の StatefulSet) |
| Secret | kubeseal(Sealed Secrets)。`cert.pem` は HoshID と同じクラスタの公開鍵 |
| Ingress | Traefik(TLS はクラスタ側で解決するので、Ingress には書かない) |
| マニフェスト | [deploy/](deploy/)(kustomize。`kubectl kustomize deploy` で中身を確かめられる) |

形は HoshID の `k8s/` と `.github/workflows/image.yml` にそろえています。

### 出し方

```bash
git tag v0.1.0
git push origin v0.1.0
```

1. CI([image.yml](.github/workflows/image.yml))が 2 つのイメージに `v0.1.0` を付けて ghcr.io へ push
2. ArgoCD Image Updater が最新の `vX.Y.Z` を拾い、[kustomization.yaml](deploy/kustomization.yaml) を書き換えて Git に commit
3. ArgoCD が同期する。wave 0 で ConfigMap・SealedSecret・PostgreSQL、wave 1 で [migrate-job.yaml](deploy/migrate-job.yaml)(Sync フック)、wave 2 でアプリ

Image Updater が入っていない場合は、`kustomization.yaml` の `newTag` を手で書き換えて push すれば同じ結果になります。

**中身が入れ替わるタグは使わない。** CI は毎回 `sha-<短いSHA>` を付け、`vX.Y.Z` はそのタグを打ったときだけ付けます。ブランチ名や `latest` は付けません。PR ではビルドと起動の確認だけをして、公開はしません。

### 戻すとき

`kustomization.yaml` の `newTag` を前の版に戻して push します。Image Updater は「最新の」`vX.Y.Z` を追うので、壊れた版を出したまま戻すと書き戻されることがあります。そのときは直した版を新しいタグ(`v0.1.1` など)で打ちます。

**マイグレーションは戻りません。** スキーマを変えた版から戻すなら、先にそれを打ち消す新しいマイグレーションが要ります。

### 初回

1. **HoshID にアプリを登録する。** リダイレクト URI は `https://lab.skyia.jp/auth/callback/hoshid`、scope は `openid profile`、クライアント認証は `client_secret_basic`。「アプリからのログアウト」を ON にして、戻り先に `https://lab.skyia.jp/` を入れる。client_id を [configmap.yaml](deploy/configmap.yaml) の `HOSHID_CLIENT_ID` に入れる
2. **ロールのクレームを合わせる。** HoshID が「一般 / 役員 / 管理者」を入れるクレームの名前と値を、`HOSHID_ROLES_CLAIM` と `HOSHID_ROLE_MAP` に入れる。合っていないと全員 member になる
3. **Secret に封をする。** [secret.example.yaml](deploy/secret.example.yaml) を `deploy/secret.yaml`(`.gitignore` 済み)に写して値を書き、封をする。`POSTGRES_PASSWORD` と `DATABASE_URL` のパスワードは同じ値にそろえる

   ```bash
   kubeseal --cert deploy/cert.pem -f deploy/secret.yaml -o yaml > deploy/sealed-secret.yaml
   ```

   **`BETTER_AUTH_SECRET` と `POSTGRES_PASSWORD` の平文を別の場所に控える。** SealedSecret はクラスタの鍵でしか開けません
4. **`TRUSTED_PROXIES` を確かめる。** Traefik の Pod が属する CIDR を [configmap.yaml](deploy/configmap.yaml) に入れる(MicroK8s の既定は `10.1.0.0/16`)

   ```bash
   kubectl get pod -A -l app.kubernetes.io/name=traefik -o wide
   ```

5. **タグを打つ。** `kustomization.yaml` は `v0.2.0` を指しているので、`v0.2.0` を打って 2 つのイメージを作っておく。ghcr.io のパッケージ(2 つとも)を公開にする(または `imagePullSecrets` を足す)
6. **Application を入れる。** ArgoCD の UI で **NEW APP → EDIT AS YAML** を開き、[argocd-application.yaml](deploy/argocd-application.yaml) の中身を貼って作る。自動で同期しますが、`selfHeal` は付けていません(障害対応で手作業した変更を勝手に戻さないため)

### バックアップ

[backup-cronjob.yaml](deploy/backup-cronjob.yaml) が毎日 `pg_dump` して PVC に 7 世代残します。**クラスタ内なので、クラスタごと失えば一緒に消えます。**

### 未完了

- [ ] **バックアップをクラスタの外へ出す。** 保管先が未定
- [ ] **HoshID のロールのクレームを確かめる。** いまは `roles` に「一般 / 役員 / 管理者」が入る前提
- [ ] **`TRUSTED_PROXIES` の答え合わせ。** デプロイ後、2 つの回線からログインして、`sessions.ip_address` にそれぞれの IP が入ることを確かめる
- [ ] **2 文字以下の語の検索。** pg_trgm の GIN は 3 文字以上の語にしか効かない(短い語は全件を見る)。件数が増えて遅くなったら pg_bigm を考える

### 構成

| ファイル | 中身 |
|---|---|
| `deployment.yaml` | アプリ本体。wave 2。startup と readiness は `/healthz`、liveness は TCP |
| `migrate-job.yaml` | マイグレーション(`prisma migrate deploy`)。Sync フック、wave 1 |
| `postgres.yaml` | PostgreSQL(StatefulSet + headless Service)。replicas は 1 のまま |
| `backup-cronjob.yaml` | 日次の `pg_dump`。7 世代 |
| `configmap.yaml` | 秘密でない設定(`TRUSTED_PROXIES`・HoshID の issuer と client_id・クレームの対応) |
| `secret.example.yaml` | 平文の見本。値は入れない。`resources` には入れない |
| `sealed-secret.yaml` | 封をしたもの。**いまはプレースホルダー**(初回の 3 で置き換える) |
| `cert.pem` | Sealed Secrets の公開鍵(HoshID と同じクラスタ) |
| `service.yaml` | ClusterIP、80 → 3927 |
| `ingress.yaml` | Traefik。`lab.skyia.jp` |
| `kustomization.yaml` | `images` で `vX.Y.Z` に差し替える(アプリと migrator は同じタグ)。Image Updater が書き換える |
| `argocd-application.yaml` | ArgoCD の UI から入れる。`resources` には入れない |

## CI(GitHub Actions)

- [ci.yml](.github/workflows/ci.yml): PR と main で、型チェック・lint・テスト(PostgreSQL の service を立てる)・web のビルド
- [image.yml](.github/workflows/image.yml): PR では 2 つのイメージのビルドと起動の確認(migrator でマイグレーションを当て、アプリの `/healthz`・`/api/me`・`/auth/login` を見て、ノートを作って読む)だけ。main と `vX.Y.Z` のタグでは ghcr.io に公開する。使う秘密の値は `GITHUB_TOKEN` だけ

## 選んだライブラリ

### server

| ライブラリ | 理由 |
| --- | --- |
| `@senrijs/senri` | サーバー本体。`defineRoutes` の型を web の型付きクライアントにそのまま渡せる。`rateLimit`・`health`・`serveStatic`・`secureHeaders`・`trustProxy`・テスト用の `testClient` まで入っていて、ほかを足さずに済む |
| `markdown-it` | Markdown の変換。`html: false` で生の HTML をエスケープし、`javascript:` のリンクも既定で通さない。安全側の既定が、設定 1 つで揃う(`marked` は生の HTML を通すので、自分で止める必要がある) |
| `better-auth` | ログイン(HoshID への OIDC)とセッション。genericOAuth が state・nonce・PKCE・ID トークンの検証(jose)・end_session までする。HoshID も Better Auth |
| `prisma`・`@prisma/client`・`@prisma/adapter-pg` | DB。HoshID と同じ Prisma 7。マイグレーションは `prisma/migrations/*/migration.sql` を順に当てる(Prisma Migrate) |
| `shiki` | コードの色付け(指定どおり)。使う言語だけを読み込み、WebAssembly を使わない JavaScript のエンジンにして、server を 1 つのファイルにまとめられるようにしている |

足さなかったもの:

- **見出しの id と目次:** `markdown-it-anchor` などは使わず、[markdown.ts](server/src/markdown.ts) で 30 行ほどで作る(日本語の見出しは、そのまま id にする)
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

## 画面

| パス | 中身 |
| --- | --- |
| `/`・`/following` | みんなのノート(すべて / 実験 / 記事 / メモ)。サイドに今週の FAIL・タグ・ノートブック・以前の記事 |
| `/@handle` | プロフィールと数の欄、ノートの一覧(本人には下書きも) |
| `/@handle/EXP-006` | ノート 1 件(実験・記事・メモで形が変わる) |
| `/new`・`/@handle/EXP-006/edit` | エディタ。`?kind=`、`?replicationOf=<id>`・`?derivedFrom=<id>` で追試・派生として開く |
| `/tags`・`/tags/:tag`・`/search`・`/members` | タグ・検索・メンバー |
| `/settings/profile` | 表示名・自己紹介・アイコン |
