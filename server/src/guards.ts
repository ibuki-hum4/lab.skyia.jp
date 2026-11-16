// ルートに付ける守り。routes.ts から読むので、Bun 専用のものや DB は import しない。
import type { Middleware } from "@senrijs/senri";
import type { Role, User } from "./types";

const RANK: Record<Role, number> = { member: 0, moderator: 1, admin: 2 };

/** ログインしていなければ 401。書き込みのルートに付ける(csrf() はアプリ全体に付けてある) */
export const requireUser: Middleware<{ user: User | null }> = async (c, next) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    await next();
};

/** そのロール以上でなければ 403(admin は moderator の分もできる)。ログインしていなければ 401 */
export function requireRole(role: Role): Middleware<{ user: User | null }> {
    return async (c, next) => {
        const user = c.get("user");
        if (!user) return c.json({ error: "unauthorized" }, 401);
        if (RANK[user.role] < RANK[role]) return c.json({ error: "forbidden" }, 403);
        await next();
    };
}

/** そのロール以上か(admin は moderator の分もできる) */
export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min];
