import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { LikeStore } from "./types";

/**
 * いいねの数を SQLite に保存する。
 * path に ":memory:" を渡すと、ファイルを作らずメモリー上で動く(テスト用)。
 */
export function openLikeStore(path: string): LikeStore & { close(): void } {
    if (path !== ":memory:") {
        path = resolve(path);
        // Windows の Bun では、すでにあるフォルダーに recursive の mkdir をすると EEXIST になることがあるので、先に確かめる
        if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
    }
    const db = new Database(path, { create: true, strict: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE IF NOT EXISTS likes (slug TEXT PRIMARY KEY, count INTEGER NOT NULL)");

    const select = db.query<{ count: number }, [string]>("SELECT count FROM likes WHERE slug = ?");
    // 1 つの文で「なければ 1、あれば +1」をして、増えたあとの数を返す
    const upsert = db.query<{ count: number }, [string]>(
        "INSERT INTO likes (slug, count) VALUES (?, 1) ON CONFLICT (slug) DO UPDATE SET count = count + 1 RETURNING count",
    );

    return {
        get: (slug) => select.get(slug)?.count ?? 0,
        increment: (slug) => upsert.get(slug)!.count,
        close: () => db.close(),
    };
}
