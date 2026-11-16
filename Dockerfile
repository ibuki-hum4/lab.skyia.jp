# syntax=docker/dockerfile:1
#
# 2 つのイメージを作る(HoshID と同じ形)。
#   app       アプリ本体(--target app。既定)
#   migrator  マイグレーション(--target migrator)。k8s の migrate Job が `prisma migrate deploy` を流す
# どちらも同じ build の段から作るので、中身はずれない。CI は 2 つに同じタグを付ける。

ARG BUN_VERSION=1.4.3

# ---- 1 段目: 依存を入れ、Prisma のクライアントを作り、web をビルドし、server を 1 つのファイルにまとめる ----
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app

# 依存だけ先に入れる(package.json が変わらなければ、この層はキャッシュが効く)。
# postinstall(prisma generate)はスキーマがまだないので、ここでは走らせない
COPY package.json bun.lock ./
COPY server/package.json server/
COPY web/package.json web/
RUN bun install --frozen-lockfile --ignore-scripts

COPY server server
COPY web web
RUN bun run --cwd server generate \
 && bun run --cwd web build \
 && bun build server/src/main.ts --target=bun --outfile=out/server.js

# ---- migrator: Prisma の CLI でマイグレーションを当てるだけ ----
# Prisma の CLI と schema engine は glibc 用を入れているので、alpine ではなく slim にする
FROM oven/bun:${BUN_VERSION}-slim AS migrator
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/package.json /app/server/prisma.config.ts ./
COPY --from=build /app/server/prisma ./prisma
# root では動かさない。数値で指定する(k8s の runAsNonRoot は名前を解決できない)
USER 1000:1000
CMD ["bun", "run", "migrate"]

# ---- app: Bun の小さいイメージで server だけを動かす ----
FROM oven/bun:${BUN_VERSION}-alpine AS app
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3927 \
    PUBLIC_DIR=/app/public

# まとめた server(Prisma のクライアントも中に入る。node_modules は要らない)、ビルド済みの web
COPY --from=build /app/out/server.js ./server.js
COPY --from=build /app/web/dist ./public

# root では動かさない(イメージに入っている bun ユーザー、uid 1000)
USER 1000:1000

EXPOSE 3927
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3927/healthz || exit 1

# --no-install: import したパッケージが見つからなくても、Bun の自動インストールを走らせない。
# 走ると読み取り専用のルート(readOnlyRootFilesystem)に書こうとして EROFS で落ちる。
# (@better-auth/core は、入っていない @opentelemetry/api を動的に import する。なければ使わないだけ)
CMD ["bun", "--no-install", "server.js"]
