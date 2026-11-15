// 起動の入口。設定は環境変数から読む(.env.example)。
import { serve } from "@senrijs/senri/serve";
import { resolve } from "node:path";
import { createLabApp } from "./app";
import { clientIpFromEnv, parseProxies } from "./client-ip";
import { readConfig } from "./config";
import { openDb } from "./db";

const env = process.env;

/** Markdown の置き場所(既定はリポジトリの content/) */
const contentDir = resolve(env.CONTENT_DIR ?? `${import.meta.dir}/../../content`);
/** ビルド済みの web(既定は web/dist) */
const publicDir = resolve(env.PUBLIC_DIR ?? `${import.meta.dir}/../../web/dist`);

const config = readConfig(env);
if (!config.hoshid) console.warn("HoshID の設定がないので、ログインはできません(HOSHID_ISSUER など)");

/** クライアントの IP の取り方。いいねの連打の制限で使う(TRUSTED_PROXIES の意味は client-ip.ts) */
const clientIp = clientIpFromEnv(env.TRUSTED_PROXIES);

// DB にはここではつながない(最初のクエリでつなぐ)。DB が遅れて立ち上がっても、起動は止めない
const db = openDb(config.databaseUrl);
const { app, posts } = await createLabApp({
    config,
    db,
    contentDir,
    publicDir,
    clientIp,
    trustedProxies: parseProxies(env.TRUSTED_PROXIES),
});
console.log(`content: ${posts.length} 本を読み込みました (${contentDir})`);

// 期限の切れたセッションとログインの途中の状態を、1 時間ごとに消す
const sweep = async () => {
    try {
        const now = new Date();
        const s = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
        const f = await db.verification.deleteMany({ where: { expiresAt: { lt: now } } });
        const n = s.count + f.count;
        if (n > 0) console.log(`期限切れを ${n} 件消しました`);
    } catch (err) {
        console.error("期限切れの掃除に失敗しました:", (err as Error).message);
    }
};
const timer = setInterval(sweep, 60 * 60 * 1000);
void sweep();

await serve(app, {
    onShutdown: async () => {
        clearInterval(timer);
        await db.$disconnect();
    },
});
