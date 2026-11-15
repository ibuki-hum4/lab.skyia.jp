// API の定義。web は `import type { Api } from "@lab/server/api"` で、この型だけを読む。
// web の型チェックからも読まれるので、Bun 専用のもの(bun:sqlite など)はここで import しない。
import { defineRoutes, endpoint, rateLimit, type Context, type Middleware } from "@senrijs/senri";
import { requireUser } from "./guards";
import { normalizeHandle } from "./handle";
import type { LikeStore, LoadedPost, Me, PostMeta, PostType, SocialStore, User } from "./types";

export type RouteDeps = {
    /** 新しい順に並んだ記事 */
    posts: LoadedPost[];
    likes: LikeStore;
    /** クライアントの IP を返す関数。プロキシの後ろでは trustProxy() で作ったもの */
    clientIp: (c: Context) => string | null;
    /** いいねの連打の制限。既定は「同じ人・同じ記事で 60 秒に 1 回」 */
    likeLimit?: { windowMs: number; limit: number };
    social: SocialStore;
    /** Cookie からログイン中の人を読んで c.get("user") に入れる(auth.ts の sessionLoader) */
    loadUser: Middleware<{ user: User | null }>;
};

/** 一覧で返す形(本文や目次は入れない) */
function toMeta({ slug, title, date, tags, type, status, summary }: LoadedPost): PostMeta {
    return { slug, title, date, tags, type, ...(status ? { status } : {}), summary };
}

const notFound = { error: "not_found" } as const;

/** 本文の JSON から文字列の項目を 1 つ読む */
async function readString(c: Context, key: string): Promise<string | null> {
    const body = await c.body().catch(() => null);
    const value = body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" ? value : null;
}

export function makeRoutes({ posts, likes, clientIp, likeLimit, social, loadUser }: RouteDeps) {
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

    /** 相手が見つからない・自分自身のとき */
    const targetError = (c: Context, result: "not_found" | "self") =>
        result === "not_found" ? c.json(notFound, 404) : c.json({ error: "self" } as const, 400);

    return defineRoutes("", { use: [loadUser] })({
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
        "GET /api/posts/:slug": async ({ slug }, c) => {
            const post = bySlug.get(slug);
            if (!post) return c.json(notFound, 404);
            return c.json({ ...toMeta(post), html: post.html, toc: post.toc, likes: await likes.get(slug) });
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
        // 骨組みのいいねは、ログインなしで押せるまま(次の PR で記事の作りと一緒に見直す)
        "POST /api/posts/:slug/like": endpoint({ use: [limitLikes] }, async ({ slug }, c) => {
            if (!bySlug.has(slug)) return c.json(notFound, 404);
            return c.json({ likes: await likes.increment(slug) });
        }),

        // ---- ログイン中の自分 ----

        // ログイン中なら自分のハンドル・表示名・ロール。ログイン前なら null
        "GET /api/me": (_, c) => {
            const user = c.get("user");
            const me: Me | null = user ? { handle: user.handle, displayName: user.displayName, role: user.role } : null;
            return c.json(me);
        },

        // 初回だけハンドルを決める
        "POST /api/me/handle": endpoint({ use: [requireUser] }, async (_, c) => {
            const user = c.get("user")!;
            const raw = await readString(c, "handle");
            if (raw === null) return c.json({ error: "invalid" } as const, 400);
            const handle = normalizeHandle(raw);
            const result = await social.setHandle(user.id, handle);
            if (result === "ok") return c.json({ handle });
            if (result === "already") return c.json({ error: "already" } as const, 409);
            if (result === "taken") return c.json({ error: "taken" } as const, 409);
            return c.json({ error: result }, 400);
        }),

        // 自分がブロックしている人。本人だけが見られる
        "GET /api/me/blocks": endpoint({ use: [requireUser] }, (_, c) => social.blocks(c.get("user")!.id)),

        // ハンドルが使えるか
        "GET /api/handles/:handle/available": async ({ handle }) => {
            const problem = await social.handleProblem(normalizeHandle(handle));
            return problem === null ? { available: true as const } : { available: false as const, reason: problem };
        },

        // ---- ほかの人 ----

        "GET /api/users/:handle": async ({ handle }, c) => {
            const profile = await social.profile(handle, c.get("user")?.id ?? null);
            if (!profile) return c.json(notFound, 404);
            return c.json(profile);
        },

        "GET /api/users/:handle/followers": async ({ handle }, c) => {
            const list = await social.followers(handle);
            return list ? c.json(list) : c.json(notFound, 404);
        },

        "GET /api/users/:handle/following": async ({ handle }, c) => {
            const list = await social.following(handle);
            return list ? c.json(list) : c.json(notFound, 404);
        },

        // フォローする。ブロックし合っている相手はフォローできない(どちらがブロックしたかは言わない)
        "POST /api/users/:handle/follow": endpoint({ use: [requireUser] }, async ({ handle }, c) => {
            const result = await social.follow(c.get("user")!.id, handle);
            if (result === "ok") return c.json({ following: true });
            if (result === "blocked") return c.json({ error: "cannot_follow" } as const, 403);
            return targetError(c, result);
        }),

        "DELETE /api/users/:handle/follow": endpoint({ use: [requireUser] }, async ({ handle }, c) => {
            const result = await social.unfollow(c.get("user")!.id, handle);
            return result === "ok" ? c.json({ following: false }) : targetError(c, result);
        }),

        // ブロックする。お互いのフォローも消える。相手には知らせない
        "POST /api/users/:handle/block": endpoint({ use: [requireUser] }, async ({ handle }, c) => {
            const result = await social.block(c.get("user")!.id, handle);
            return result === "ok" ? c.json({ blocking: true }) : targetError(c, result);
        }),

        "DELETE /api/users/:handle/block": endpoint({ use: [requireUser] }, async ({ handle }, c) => {
            const result = await social.unblock(c.get("user")!.id, handle);
            return result === "ok" ? c.json({ blocking: false }) : targetError(c, result);
        }),
    });
}

/** web の型付きクライアントに渡す型 */
export type Api = ReturnType<typeof makeRoutes>;
