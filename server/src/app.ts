import { createApp, health, secureHeaders, type Context } from "@senrijs/senri";
import { devtools } from "@senrijs/senri/dev";
import { serveStatic } from "@senrijs/senri/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadPosts } from "./content";
import { createRenderer } from "./markdown";
import { makeRoutes, type RouteDeps } from "./routes";
import type { LikeStore } from "./types";

export type LabAppOptions = {
    /** Markdown の置き場所 */
    contentDir: string;
    /** ビルド済みの web(index.html と assets/)。なければ API だけで動く */
    publicDir?: string;
    likes: LikeStore;
    clientIp: (c: Context) => string | null;
    likeLimit?: RouteDeps["likeLimit"];
};

const isApi = (path: string) => path === "/api" || path.startsWith("/api/");

/** アプリを組み立てる。テストからも、これを呼んで使う */
export async function createLabApp(options: LabAppOptions) {
    // 起動時に Markdown を全部読んで HTML にしておく(リクエストのたびには変換しない)
    const render = await createRenderer();
    const posts = await loadPosts(options.contentDir, render);

    const app = createApp({ dev: devtools() }); // NODE_ENV=production では何もしない

    app.use(health()); // /healthz(と /readyz)
    app.use(secureHeaders());

    // ビルド済みの web を配る(/assets/... や /favicon.ico など)
    const indexPath = options.publicDir ? join(options.publicDir, "index.html") : undefined;
    const indexHtml = indexPath && existsSync(indexPath) ? await Bun.file(indexPath).text() : undefined;
    if (options.publicDir && indexHtml) app.use(serveStatic({ root: options.publicDir }));

    app.routes(makeRoutes({ posts, likes: options.likes, clientIp: options.clientIp, likeLimit: options.likeLimit }));

    // 見つからないとき。/api の下なら 404 の JSON にする
    app.notFound((c) => (isApi(c.path) ? c.json({ error: "not_found" }, 404) : new Response("Not Found", { status: 404 })));

    // それ以外の GET は index.html を返す(SPA なので、画面の切り替えは vue-router がする)
    app.get("/*", (_, c) => {
        if (isApi(c.path)) return c.notFound();
        if (indexHtml) return c.html(indexHtml);
        c.status(503);
        return "web がまだビルドされていません。開発中は http://localhost:5173 を開いてください。";
    });

    return { app, posts };
}
