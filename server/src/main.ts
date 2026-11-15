// 起動の入口。設定は環境変数から読む。
import { serve } from "@senrijs/senri/serve";
import { resolve } from "node:path";
import { createLabApp } from "./app";
import { clientIpFromEnv } from "./client-ip";
import { openLikeStore } from "./likes";

const env = process.env;

/** Markdown の置き場所(既定はリポジトリの content/) */
const contentDir = resolve(env.CONTENT_DIR ?? `${import.meta.dir}/../../content`);
/** ビルド済みの web(既定は web/dist) */
const publicDir = resolve(env.PUBLIC_DIR ?? `${import.meta.dir}/../../web/dist`);
/** SQLite のファイル。コンテナでは /data を外からつなぐ */
const dbPath = env.LAB_DB_PATH ?? "/data/lab.db";

/** クライアントの IP の取り方。いいねの連打の制限で使う(TRUSTED_PROXIES の意味は client-ip.ts) */
const clientIp = clientIpFromEnv(env.TRUSTED_PROXIES);

const likes = openLikeStore(dbPath);
const { app, posts } = await createLabApp({ contentDir, publicDir, likes, clientIp });
console.log(`content: ${posts.length} 本を読み込みました (${contentDir})`);

await serve(app, { onShutdown: () => likes.close() });
