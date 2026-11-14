// 起動の入口。設定は環境変数から読む。
import { getIp, trustProxy } from "@senrijs/senri/ip";
import { serve } from "@senrijs/senri/serve";
import { resolve } from "node:path";
import { createLabApp } from "./app";
import { openLikeStore } from "./likes";

const env = process.env;

/** Markdown の置き場所(既定はリポジトリの content/) */
const contentDir = resolve(env.CONTENT_DIR ?? `${import.meta.dir}/../../content`);
/** ビルド済みの web(既定は web/dist) */
const publicDir = resolve(env.PUBLIC_DIR ?? `${import.meta.dir}/../../web/dist`);
/** SQLite のファイル。コンテナでは /data を外からつなぐ */
const dbPath = env.LAB_DB_PATH ?? "/data/lab.db";

/**
 * クライアントの IP の取り方。
 * TRUST_PROXY_HOPS は、アプリの手前にあるプロキシの段数(Ingress のコントローラーだけなら 1)。
 * 未設定・0 なら、接続元の IP をそのまま使う(手元で直接つなぐとき)。
 */
const hops = Number(env.TRUST_PROXY_HOPS ?? "0");
if (!Number.isInteger(hops) || hops < 0) throw new Error("TRUST_PROXY_HOPS は 0 以上の整数にしてください");
const clientIp = hops > 0 ? trustProxy({ hops }) : getIp;

const likes = openLikeStore(dbPath);
const { app, posts } = await createLabApp({ contentDir, publicDir, likes, clientIp });
console.log(`content: ${posts.length} 本を読み込みました (${contentDir})`);

await serve(app, { onShutdown: () => likes.close() });
