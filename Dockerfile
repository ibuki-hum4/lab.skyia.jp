# syntax=docker/dockerfile:1

# ---- 1 段目: web を Vite でビルドし、server を 1 つのファイルにまとめる ----
FROM oven/bun:1.4.3 AS build
WORKDIR /app

# 依存だけ先に入れる(package.json が変わらなければ、この層はキャッシュが効く)
COPY package.json bun.lock ./
COPY server/package.json server/
COPY web/package.json web/
RUN bun install --frozen-lockfile

COPY server server
COPY web web
RUN bun run --cwd web build \
 && bun build server/src/main.ts --target=bun --outfile=out/server.js

# ---- 2 段目: Bun の小さいイメージで server だけを動かす ----
FROM oven/bun:1.4.3-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3927 \
    CONTENT_DIR=/app/content \
    PUBLIC_DIR=/app/public \
    LAB_DB_PATH=/data/lab.db

# まとめた server(node_modules は要らない)、ビルド済みの web、記事
COPY --from=build /app/out/server.js ./server.js
COPY --from=build /app/web/dist ./public
COPY content ./content

# SQLite の置き場所。外から(k8s では PVC を)つなぐ
RUN mkdir -p /data && chown bun:bun /data
VOLUME ["/data"]

# root では動かさない(イメージに入っている bun ユーザー、uid 1000)
USER bun

EXPOSE 3927
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3927/healthz || exit 1

CMD ["bun", "server.js"]
