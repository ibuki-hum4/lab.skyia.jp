// API の定義。web は `import type { Api } from "@lab/server/api"` で、この型だけを読む。
// web の型チェックからも読まれるので、Bun 専用のもの(bun:sqlite など)はここで import しない。
import { bodyLimit, defineRoutes, endpoint, rateLimit, type Context, type Middleware } from "@senrijs/senri";
import type { AvatarStore } from "./avatar";
import { requireRole, requireUser } from "./guards";
import { normalizeHandle } from "./handle";
import { parseId } from "./ids";
import { DEFAULT_RATE_LIMITS, LIMITS, type RateLimitRule, type RateLimits } from "./limits";
import type { Fail, ListFilter, NoteStore, Result } from "./notes";
import type { Me, SocialStore, User } from "./types";
import type { UserStore } from "./users";

export type RouteDeps = {
    notes: NoteStore;
    users: UserStore;
    avatars: AvatarStore;
    /** 連打の制限(テストで小さくする)。既定は limits.ts の DEFAULT_RATE_LIMITS */
    rateLimits?: Partial<RateLimits>;
    social: SocialStore;
    /** Cookie からログイン中の人を読んで c.get("user") に入れる(auth.ts の sessionLoader) */
    loadUser: Middleware<{ user: User | null }>;
};

const notFound = { error: "not_found" } as const;

/** 本文の JSON から文字列の項目を 1 つ読む */
async function readString(c: Context, key: string): Promise<string | null> {
    const body = await c.body().catch(() => null);
    const value = body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
    return typeof value === "string" ? value : null;
}

/** 本文の JSON をオブジェクトとして読む(違えば空) */
async function readObject(c: Context): Promise<Record<string, unknown>> {
    const body = await c.body().catch(() => null);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** ストアの結果を、JSON のレスポンスに */
function send<T>(c: Context, result: Result<T>) {
    if (result.ok) return c.json(result.value);
    const fail: Fail = result;
    return c.json({ error: fail.error }, fail.status);
}

/** :id が数字でなければ 404 */
const badId = (c: Context) => c.json(notFound, 404);

/** ログイン中の人ごとに数える連打の制限(requireUser のあとに付ける) */
const perUser = (name: string, rule: RateLimitRule) =>
    rateLimit({ ...rule, key: (c) => `${name}|${(c.get("user") as User | null)?.id ?? ""}` });

export function makeRoutes({ social, loadUser, notes, users, avatars, rateLimits }: RouteDeps) {
    const rl = { ...DEFAULT_RATE_LIMITS, ...rateLimits };
    const limitNote = perUser("note", rl.note);
    const limitComment = perUser("comment", rl.comment);
    const limitNoteLike = perUser("like", rl.like);
    const limitAvatar = perUser("avatar", rl.avatar);
    const limitPreview = perUser("preview", rl.preview);
    const avatarBody = bodyLimit({ maxSize: LIMITS.avatarBytes, onError: (c) => c.json({ error: "too_large" }, 413) });
    const mod = requireRole("moderator");
    const admin = requireRole("admin");

    /** ?kind=… などを読む */
    const listFilter = (c: Context): ListFilter => ({
        kind: c.query("kind") || undefined,
        status: c.query("status") || undefined,
        tag: c.query("tag") || undefined,
        author: c.query("author") || undefined,
        following: c.query("following") === "1",
        drafts: c.query("drafts") === "1",
        q: c.query("q"),
        cursor: c.query("cursor") || undefined,
        limit: c.query("limit") ? Number(c.query("limit")) : undefined,
    });

    /** 相手が見つからない・自分自身のとき */
    const targetError = (c: Context, result: "not_found" | "self") =>
        result === "not_found" ? c.json(notFound, 404) : c.json({ error: "self" } as const, 400);

    return defineRoutes("", { use: [loadUser] })({
        // ---- ログイン中の自分 ----

        // ログイン中なら自分のハンドル・表示名・ロール。ログイン前なら null
        "GET /api/me": (_, c) => {
            const user = c.get("user");
            const me: Me | null = user
                ? {
                      handle: user.handle,
                      displayName: user.displayName,
                      role: user.role,
                      avatar: user.handle && user.avatarHash ? `/api/users/${encodeURIComponent(user.handle)}/avatar?v=${user.avatarHash}` : null,
                  }
                : null;
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

        // ---- プロフィールの設定 ----

        "GET /api/me/profile": endpoint({ use: [requireUser] }, async (_, c) => {
            const settings = await users.settings(c.get("user")!.id);
            return settings ? c.json(settings) : c.json(notFound, 404);
        }),

        // 表示名と自己紹介。渡したものだけ変える
        "PATCH /api/me/profile": endpoint({ use: [requireUser] }, async (_, c) => {
            const result = await users.updateProfile(c.get("user")!.id, await readObject(c));
            return typeof result === "string" ? c.json({ error: result }, 400) : c.json(result);
        }),

        // アイコン画像。本文は画像のバイト列そのもの(ブラウザで 256px の WebP にしたもの)。
        // 256KB を超えたら 413、中身が画像でなければ 415。宣言された Content-Type は見ない
        "PUT /api/me/avatar": endpoint({ use: [requireUser, limitAvatar, avatarBody] }, async (_, c) => {
            const user = c.get("user")!;
            if (!user.handle) return c.json({ error: "no_handle" } as const, 403);
            const bytes = new Uint8Array(await c.req.arrayBuffer());
            const result = await avatars.save(user.id, bytes);
            if (!result.ok) return c.json({ error: result.error }, result.error === "too_large" ? 413 : 415);
            return c.json({ avatar: `/api/users/${encodeURIComponent(user.handle)}/avatar?v=${result.hash}` });
        }),

        "DELETE /api/me/avatar": endpoint({ use: [requireUser] }, async (_, c) => {
            await avatars.remove(c.get("user")!.id);
            return c.json({ avatar: null });
        }),

        // アイコン画像の配信。?v=<ハッシュ> が今の画像と合えば、1 年キャッシュしてよい(画像が変われば URL も変わる)
        "GET /api/users/:handle/avatar": async ({ handle }, c) => {
            const avatar = await avatars.get(handle);
            if (!avatar) return c.json(notFound, 404);
            const fresh = c.query("v") === avatar.hash;
            return new Response(new Uint8Array(avatar.data), {
                headers: {
                    "content-type": avatar.contentType,
                    "x-content-type-options": "nosniff",
                    "content-security-policy": "default-src 'none'; sandbox",
                    "cache-control": fresh ? "public, max-age=31536000, immutable" : "no-cache",
                    etag: `"${avatar.hash}"`,
                },
            });
        },

        // ---- ノート ----

        // 一覧。?kind=experiment|article|memo、?status=pass|fail|watch、?tag=、?author=ハンドル、
        // ?following=1(フォロー中の人だけ)、?drafts=1(自分の下書き。author が自分のときだけ)、?q=検索語、?cursor=、?limit=
        "GET /api/notes": async (_, c) => send(c, await notes.list(c.get("user") ?? null, listFilter(c))),

        // 作る。{ kind, title, body, status?, tags?, draft?, link?: { kind: "replication" | "derivation", sourceId } }
        "POST /api/notes": endpoint({ use: [requireUser, limitNote] }, async (_, c) =>
            send(c, await notes.create(c.get("user")!, await readObject(c))),
        ),

        // 使われているタグと数
        "GET /api/notes/tags": async (_, c) => notes.tags(c.get("user") ?? null),

        // 直近 7 日に FAIL になった実験
        "GET /api/notes/fails": async (_, c) => notes.failsThisWeek(c.get("user") ?? null),

        // エディタのプレビュー(保存しない)
        "POST /api/notes/preview": endpoint({ use: [requireUser, limitPreview] }, async (_, c) =>
            send(c, notes.preview((await readObject(c)).body)),
        ),

        "GET /api/notes/:id": async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.get(c.get("user") ?? null, nid));
        },

        // /@handle/EXP-006 の形で 1 件
        "GET /api/users/:handle/notes/:code": async ({ handle, code }, c) =>
            send(c, await notes.getByCode(c.get("user") ?? null, handle, code)),

        // 直す(下書きの保存も)。{ title?, body?, status?, tags?, draft?: false で公開 }
        "PATCH /api/notes/:id": endpoint({ use: [requireUser] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.update(c.get("user")!, nid, await readObject(c)));
        }),

        "DELETE /api/notes/:id": endpoint({ use: [requireUser] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.remove(c.get("user")!, nid));
        }),

        "POST /api/notes/:id/publish": endpoint({ use: [requireUser] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.publish(c.get("user")!, nid));
        }),

        "GET /api/notes/:id/replications": async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.replications(c.get("user") ?? null, nid));
        },

        "GET /api/notes/:id/lineage": async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.lineage(c.get("user") ?? null, nid));
        },

        "GET /api/notes/:id/related": async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.related(c.get("user") ?? null, nid));
        },

        // いいねを付ける・外す。数を返す
        "POST /api/notes/:id/like": endpoint({ use: [requireUser, limitNoteLike] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.like(c.get("user")!, nid, true));
        }),

        "DELETE /api/notes/:id/like": endpoint({ use: [requireUser, limitNoteLike] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.like(c.get("user")!, nid, false));
        }),

        // ---- コメント ----

        "GET /api/notes/:id/comments": async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.comments(c.get("user") ?? null, nid));
        },

        "POST /api/notes/:id/comments": endpoint({ use: [requireUser, limitComment] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.addComment(c.get("user")!, nid, await readObject(c)));
        }),

        "PATCH /api/comments/:id": endpoint({ use: [requireUser] }, async ({ id }, c) => {
            const cid = parseId(id);
            return cid === null ? badId(c) : send(c, await notes.editComment(c.get("user")!, cid, await readObject(c)));
        }),

        "DELETE /api/comments/:id": endpoint({ use: [requireUser] }, async ({ id }, c) => {
            const cid = parseId(id);
            return cid === null ? badId(c) : send(c, await notes.deleteComment(c.get("user")!, cid));
        }),

        // ---- 探す・一覧 ----

        // ノート(タイトルと本文)・タグ・メンバーから探す
        "GET /api/search": async (_, c) => {
            const viewer = c.get("user") ?? null;
            const q = (c.query("q") ?? "").trim().slice(0, LIMITS.query);
            const lower = q.toLowerCase();
            const [found, tags, members] = await Promise.all([
                notes.list(viewer, { q, cursor: c.query("cursor") || undefined }),
                q ? notes.tags(viewer, 1000) : Promise.resolve([]),
                q ? notes.members("handle") : Promise.resolve([]),
            ]);
            return send(
                c,
                found.ok
                    ? {
                          ok: true,
                          value: {
                              notes: found.value,
                              tags: tags.filter((t) => t.tag.includes(lower)).slice(0, 20),
                              members: members
                                  .filter((m) => m.handle.includes(lower) || m.displayName.toLowerCase().includes(lower))
                                  .slice(0, 20),
                          },
                      }
                    : found,
            );
        },

        // ハンドルのある人。?sort=active で書いた数の多い順、?limit=
        "GET /api/members": async (_, c) => {
            const limit = Math.min(Math.max(Number(c.query("limit")) || 200, 1), 200);
            return notes.members(c.query("sort") === "active" ? "active" : "handle", limit);
        },

        // ---- moderator 以上: 隠す・戻す(消さない。わけを残す) ----

        "POST /api/notes/:id/hide": endpoint({ use: [mod] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.hideNote(c.get("user")!, nid, (await readObject(c)).reason));
        }),

        "DELETE /api/notes/:id/hide": endpoint({ use: [mod] }, async ({ id }, c) => {
            const nid = parseId(id);
            return nid === null ? badId(c) : send(c, await notes.unhideNote(nid));
        }),

        "POST /api/comments/:id/hide": endpoint({ use: [mod] }, async ({ id }, c) => {
            const cid = parseId(id);
            return cid === null ? badId(c) : send(c, await notes.hideComment(c.get("user")!, cid, (await readObject(c)).reason));
        }),

        "DELETE /api/comments/:id/hide": endpoint({ use: [mod] }, async ({ id }, c) => {
            const cid = parseId(id);
            return cid === null ? badId(c) : send(c, await notes.unhideComment(cid));
        }),

        // ---- admin: 凍結する・解く ----

        "POST /api/admin/users/:handle/suspend": endpoint({ use: [admin] }, async ({ handle }, c) => {
            const result = await users.setSuspended(c.get("user")!.id, handle, true);
            return result === "ok" ? c.json({ suspended: true }) : targetError(c, result);
        }),

        "DELETE /api/admin/users/:handle/suspend": endpoint({ use: [admin] }, async ({ handle }, c) => {
            const result = await users.setSuspended(c.get("user")!.id, handle, false);
            return result === "ok" ? c.json({ suspended: false }) : targetError(c, result);
        }),
    });
}

/** web の型付きクライアントに渡す型 */
export type Api = ReturnType<typeof makeRoutes>;
