import { createApp, csrf, health, secureHeaders, type Context } from "@senrijs/senri";
import { devtools } from "@senrijs/senri/dev";
import { serveStatic } from "@senrijs/senri/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createAuth, mountAuth, sessionLoader } from "./auth";
import type { LabConfig } from "./config";
import { loadPosts } from "./content";
import type { Db } from "./db";
import { createLikeStore } from "./likes";
import { createRenderer } from "./markdown";
import { makeRoutes, type RouteDeps } from "./routes";
import { createSocialStore } from "./social";
import type { User } from "./types";

export type LabAppOptions = {
    config: LabConfig;
    db: Db;
    /** Markdown の置き場所 */
    contentDir: string;
    /** ビルド済みの web(index.html と assets/)。なければ API だけで動く */
    publicDir?: string;
    clientIp: (c: Context) => string | null;
    /** Traefik の CIDR(TRUSTED_PROXIES)。Better Auth にも渡す */
    trustedProxies?: string[];
    likeLimit?: RouteDeps["likeLimit"];
};

const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
const isAuth = (path: string) => path === "/auth" || path.startsWith("/auth/");

/** アプリを組み立てる。テストからも、これを呼んで使う */
export async function createLabApp(options: LabAppOptions) {
    const { config, db } = options;
    // 起動時に Markdown を全部読んで HTML にしておく(リクエストのたびには変換しない)
    const render = await createRenderer();
    const posts = await loadPosts(options.contentDir, render);

    const auth = createAuth({ config, db, trustedProxies: options.trustedProxies ?? [] });
    const social = createSocialStore(db);
    const loadUser = sessionLoader(auth, db);

    const app = createApp<{ user: User | null }>({ dev: devtools() }); // NODE_ENV=production では何もしない

    app.use(health()); // /healthz(と /readyz)。DB は見ない
    app.use(secureHeaders());
    // 書き込み(GET・HEAD・OPTIONS 以外)は、同じサイトからのものだけ通す。ログインの要らない書き込みにも効く
    app.use(csrf());

    // ビルド済みの web を配る(/assets/... や /favicon.ico など)
    const indexPath = options.publicDir ? join(options.publicDir, "index.html") : undefined;
    const indexHtml = indexPath && existsSync(indexPath) ? await Bun.file(indexPath).text() : undefined;
    if (options.publicDir && indexHtml) app.use(serveStatic({ root: options.publicDir }));

    // /auth の下(ログイン・コールバック・ログアウト)。ログイン中の人を読んでから
    app.use(async (c, next) => {
        if (isAuth(c.path)) return loadUser(c, next);
        await next();
    });
    mountAuth(app, { auth, db, config });

    app.routes(
        makeRoutes({
            posts,
            likes: createLikeStore(db),
            clientIp: options.clientIp,
            likeLimit: options.likeLimit,
            social,
            loadUser,
        }),
    );

    // 見つからないとき。/api と /auth の下なら 404 の JSON にする
    app.notFound((c) =>
        isApi(c.path) || isAuth(c.path) ? c.json({ error: "not_found" }, 404) : new Response("Not Found", { status: 404 }),
    );

    // それ以外の GET は index.html を返す(SPA なので、画面の切り替えは vue-router がする)
    app.get("/*", (_, c) => {
        if (isApi(c.path) || isAuth(c.path)) return c.notFound();
        if (indexHtml) return c.html(indexHtml);
        c.status(503);
        return "web がまだビルドされていません。開発中は http://localhost:5173 を開いてください。";
    });

    return { app, posts, auth, social };
}
