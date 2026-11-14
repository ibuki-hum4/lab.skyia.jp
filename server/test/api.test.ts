import { describe, expect, test } from "bun:test";
import { getIp } from "@senrijs/senri/ip";
import { request, testClient } from "@senrijs/senri/testing";
import { join } from "node:path";
import { createLabApp } from "../src/app";
import { openLikeStore } from "../src/likes";
import type { Api } from "../src/routes";

/** テスト用のアプリ。いいねはメモリー上の SQLite に入れる */
async function setup(contentDir = join(import.meta.dir, "fixtures")) {
    const { app } = await createLabApp({
        contentDir,
        likes: openLikeStore(":memory:"),
        clientIp: getIp,
        likeLimit: { windowMs: 60_000, limit: 2 },
    });
    return { app, api: testClient<Api>(app) };
}

describe("GET /api/posts", () => {
    test("一覧を新しい順に返す(本文は入れない)", async () => {
        const { api } = await setup();
        const res = await api("GET /api/posts");
        expect(res.status).toBe(200);
        if (!res.ok) throw new Error("unreachable");
        expect(res.data.map((p) => p.slug)).toEqual(["raw-html", "old-experiment"]);
        expect(res.data[1]).toMatchObject({ type: "experiment", status: "failure", tags: ["security", "bun"] });
        expect(res.data[0]).not.toHaveProperty("html");
    });

    test("type・tag・q で絞り込める", async () => {
        const { api } = await setup();
        const slugs = async (query: Record<string, string>) => {
            const res = await api("GET /api/posts", { query });
            return res.ok ? res.data.map((p) => p.slug) : [];
        };
        expect(await slugs({ type: "experiment" })).toEqual(["old-experiment"]);
        expect(await slugs({ tag: "bun" })).toEqual(["old-experiment"]);
        expect(await slugs({ tag: "security" })).toEqual(["raw-html", "old-experiment"]);
        expect(await slugs({ q: "ひみつのことば" })).toEqual(["old-experiment"]); // 本文から
        expect(await slugs({ q: "生の HTML" })).toEqual(["raw-html"]); // タイトルから
        expect(await slugs({ q: "どこにもない" })).toEqual([]);
    });
});

describe("GET /api/posts/:slug", () => {
    test("1 本ぶんを HTML・目次・いいねの数つきで返す", async () => {
        const { api } = await setup();
        const res = await api("GET /api/posts/:slug", { params: { slug: "old-experiment" } });
        expect(res.status).toBe(200);
        if (!res.ok) throw new Error("unreachable");
        expect(res.data.title).toBe("古い実験");
        expect(res.data.html).toContain('<h2 id="はじめに">はじめに</h2>');
        expect(res.data.toc).toEqual([{ depth: 2, id: "はじめに", text: "はじめに" }]);
        expect(res.data.likes).toBe(0);
    });

    test("コードは shiki で色が付く", async () => {
        const { api } = await setup();
        const res = await api("GET /api/posts/:slug", { params: { slug: "raw-html" } });
        if (!res.ok) throw new Error("unreachable");
        expect(res.data.html).toContain('class="shiki github-dark"');
    });

    test("生の HTML は通さない", async () => {
        const { api } = await setup();
        const res = await api("GET /api/posts/:slug", { params: { slug: "raw-html" } });
        if (!res.ok) throw new Error("unreachable");
        const html = res.data.html;
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<img");
        expect(html).not.toContain('href="javascript:');
        expect(html).toContain("&lt;script&gt;"); // 文字として出る
    });

    test("ない記事は 404 の JSON", async () => {
        const { api } = await setup();
        const res = await api("GET /api/posts/:slug", { params: { slug: "nothing" } });
        expect(res.status).toBe(404);
        expect(res.error).toEqual({ error: "not_found" });
    });
});

describe("404", () => {
    test("/api で見つからないものは 404 の JSON", async () => {
        const { app } = await setup();
        const res = await request(app, "GET /api/unknown/path");
        expect(res.status).toBe(404);
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(await res.json()).toEqual({ error: "not_found" });
    });

    test("/healthz は 200", async () => {
        const { app } = await setup();
        const res = await request(app, "GET /healthz");
        expect(res.status).toBe(200);
    });
});

describe("GET /api/tags", () => {
    test("タグと件数を、多い順に返す", async () => {
        const { api } = await setup();
        const res = await api("GET /api/tags");
        if (!res.ok) throw new Error("unreachable");
        expect(res.data).toEqual([
            { tag: "security", count: 2 },
            { tag: "bun", count: 1 },
        ]);
    });
});

describe("POST /api/posts/:slug/like", () => {
    test("いいねが増えて、記事の取得にも反映される", async () => {
        const { api } = await setup();
        const like = await api("POST /api/posts/:slug/like", { params: { slug: "raw-html" } });
        expect(like.status).toBe(200);
        expect(like.data).toEqual({ likes: 1 });
        const post = await api("GET /api/posts/:slug", { params: { slug: "raw-html" } });
        expect(post.ok && post.data.likes).toBe(1);
    });

    test("連打したら 429 で止まる(別の記事・別の人は数えない)", async () => {
        const { app, api } = await setup(); // テストでは 60 秒に 2 回まで
        const like = (slug: string) => api("POST /api/posts/:slug/like", { params: { slug } });
        expect((await like("raw-html")).status).toBe(200);
        expect((await like("raw-html")).status).toBe(200);
        const blocked = await like("raw-html");
        expect(blocked.status).toBe(429);
        expect(blocked.response.headers.get("retry-after")).not.toBeNull();
        // 止められた分は数えない
        const post = await api("GET /api/posts/:slug", { params: { slug: "raw-html" } });
        expect(post.ok && post.data.likes).toBe(2);
        // 別の記事は別に数える
        expect((await like("old-experiment")).status).toBe(200);
        // 別の人(IP)は別に数える
        const other = testClient<Api>(app, { ip: "192.0.2.10" });
        expect((await other("POST /api/posts/:slug/like", { params: { slug: "raw-html" } })).status).toBe(200);
    });

    test("ない記事には 404", async () => {
        const { api } = await setup();
        const res = await api("POST /api/posts/:slug/like", { params: { slug: "nothing" } });
        expect(res.status).toBe(404);
    });
});

describe("content/", () => {
    test("リポジトリの見本の記事が全部読める", async () => {
        const { api } = await setup(join(import.meta.dir, "../../content"));
        const res = await api("GET /api/posts");
        if (!res.ok) throw new Error("unreachable");
        expect(res.data.length).toBe(3);
        expect(res.data.filter((p) => p.type === "experiment").length).toBe(1);
    });
});
