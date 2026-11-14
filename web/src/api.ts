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
 * 開発中は Vite が /api を Senri へ回すので、同じオリジンでよい。
 */
export const api = client<Api>(window.location.origin);

// 画面で使う型。server の型をそのまま使う
export type { ExperimentStatus, PostMeta, PostType, TocItem } from "@lab/server/types";
