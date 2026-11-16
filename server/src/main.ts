// 起動の入口。設定は環境変数から読む(.env.example)。
import { serve } from "@senrijs/senri/serve";
import { resolve } from "node:path";
import { createLabApp } from "./app";
import { clientIpFromEnv, parseProxies } from "./client-ip";
import { readConfig } from "./config";
import { openDb } from "./db";

const env = process.env;

/** ビルド済みの web(既定は web/dist) */
const publicDir = resolve(env.PUBLIC_DIR ?? `${import.meta.dir}/../../web/dist`);

const config = readConfig(env);
if (!config.hoshid) console.warn("HoshID の設定がないので、ログインはできません(HOSHID_ISSUER など)");

// TRUSTED_PROXIES の書き間違い(IP でも CIDR でもないもの)は、起動時に止める。値は Better Auth に渡す
clientIpFromEnv(env.TRUSTED_PROXIES);

// DB にはここではつながない(最初のクエリでつなぐ)。DB が遅れて立ち上がっても、起動は止めない
const db = openDb(config.databaseUrl);
const { app } = await createLabApp({
    config,
    db,
    publicDir,
    trustedProxies: parseProxies(env.TRUSTED_PROXIES),
});

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
