// server の API を型付きで呼ぶ。
// `import type` なので、server のコードは画面のバンドルに入らない(型だけ借りる)。
import type { Api } from "@lab/server/api";
import { client } from "@senrijs/senri/client";

/**
 * 使い方:
 *   const res = await api("GET /api/posts/:slug", { params: { slug } });
 *   if (res.ok) res.data.title;        // 型が付く
 *   else if (res.status === 404) ...   // 見つからない
 *
 * 2xx でなくても例外にはならない。`res.ok` で分ける。
 * 開発中は Vite が /api と /auth を Senri へ回すので、同じオリジンでよい。
 * 書き込みは同じオリジンからなので、ブラウザが Sec-Fetch-Site: same-origin を付け、server の csrf() を通る。
 */
export const api = client<Api>(window.location.origin);

/** フォローする・外す */
export const setFollow = (handle: string, on: boolean) =>
    api(on ? "POST /api/users/:handle/follow" : "DELETE /api/users/:handle/follow", { params: { handle } });

/** ブロックする・外す */
export const setBlock = (handle: string, on: boolean) =>
    api(on ? "POST /api/users/:handle/block" : "DELETE /api/users/:handle/block", { params: { handle } });

/** ログインの入口(HoshID へ)。ログインのあと next に戻る */
export const loginUrl = (next: string) => `/auth/login?next=${encodeURIComponent(next)}`;

/** いいねを付ける・外す */
export const setLike = (id: string, on: boolean) =>
    api(on ? "POST /api/notes/:id/like" : "DELETE /api/notes/:id/like", { params: { id } });

// 画面で使う型。server の型をそのまま使う
export type {
    Author,
    CommentItem,
    ExperimentStatus,
    HandleProblem,
    Lineage,
    LineageNode,
    LinkKind,
    Me,
    Member,
    NoteCounts,
    NoteDetail,
    NoteKind,
    NoteRef,
    NoteStatus,
    NoteSummary,
    Page,
    PostMeta,
    PostType,
    Profile,
    Role,
    StatusChange,
    TagCount,
    TocItem,
    UserSummary,
} from "@lab/server/types";
export { LIMITS } from "@lab/server/limits";
