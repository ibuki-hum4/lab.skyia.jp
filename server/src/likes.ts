import type { Db } from "./db";
import type { LikeStore } from "./types";

/** いいねの数を PostgreSQL(post_likes)に保存する */
export function createLikeStore(db: Db): LikeStore {
    return {
        get: async (slug) => (await db.postLike.findUnique({ where: { slug } }))?.count ?? 0,
        // 1 つの文で「なければ 1、あれば +1」をして、増えたあとの数を返す
        increment: async (slug) =>
            (await db.postLike.upsert({ where: { slug }, create: { slug, count: 1 }, update: { count: { increment: 1 } } })).count,
    };
}
