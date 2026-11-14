// API の定義。web は `import type { Api } from "@lab/server/api"` で、この型だけを読む。
// web の型チェックからも読まれるので、Bun 専用のもの(bun:sqlite など)はここで import しない。
import { defineRoutes, endpoint, rateLimit, type Context } from "@senrijs/senri";
import type { LikeStore, LoadedPost, PostMeta, PostType } from "./types";

export type RouteDeps = {
    /** 新しい順に並んだ記事 */
    posts: LoadedPost[];
    likes: LikeStore;
    /** クライアントの IP を返す関数。プロキシの後ろでは trustProxy() で作ったもの */
    clientIp: (c: Context) => string | null;
    /** いいねの連打の制限。既定は「同じ人・同じ記事で 60 秒に 1 回」 */
    likeLimit?: { windowMs: number; limit: number };
};

/** 一覧で返す形(本文や目次は入れない) */
function toMeta({ slug, title, date, tags, type, status, summary }: LoadedPost): PostMeta {
    return { slug, title, date, tags, type, ...(status ? { status } : {}), summary };
}

const notFound = { error: "not_found" } as const;

export function makeRoutes({ posts, likes, clientIp, likeLimit }: RouteDeps) {
    const bySlug = new Map(posts.map((p) => [p.slug, p]));

    // 連打を止める。数えるのは「IP + 記事」ごと(別の記事へのいいねは別に数える)
    const limitLikes = rateLimit({
        windowMs: likeLimit?.windowMs ?? 60_000,
        limit: likeLimit?.limit ?? 1,
        key: (c) => {
            const ip = clientIp(c);
            return ip === null ? null : `${ip}|${c.params.slug ?? ""}`;
        },
    });

    return defineRoutes({
        // 一覧。?type=post|experiment、?tag=xxx、?q=検索語 で絞り込める
        "GET /api/posts": (_, c): PostMeta[] => {
            const type = c.query("type") as PostType | undefined;
            const tag = c.query("tag");
            const q = c.query("q")?.trim().toLowerCase();
            return posts
                .filter((p) => !type || p.type === type)
                .filter((p) => !tag || p.tags.includes(tag))
                .filter((p) => !q || p.title.toLowerCase().includes(q) || p.source.toLowerCase().includes(q))
                .map(toMeta);
        },

        // 1 本ぶん。本文は HTML、目次といいねの数も付ける
        "GET /api/posts/:slug": ({ slug }, c) => {
            const post = bySlug.get(slug);
            if (!post) return c.json(notFound, 404);
            return c.json({ ...toMeta(post), html: post.html, toc: post.toc, likes: likes.get(slug) });
        },

        // タグと件数。多い順、同じ数なら名前の順
        "GET /api/tags": () => {
            const counts = new Map<string, number>();
            for (const p of posts) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
            return [...counts]
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
        },

        // いいねを 1 増やす。連打は rateLimit で 429 になる
        "POST /api/posts/:slug/like": endpoint({ use: [limitLikes] }, ({ slug }, c) => {
            if (!bySlug.has(slug)) return c.json(notFound, 404);
            return c.json({ likes: likes.increment(slug) });
        }),
    });
}

/** web の型付きクライアントに渡す型 */
export type Api = ReturnType<typeof makeRoutes>;
