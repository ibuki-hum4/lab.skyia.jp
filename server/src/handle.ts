// @ のハンドルの決まり。
import type { HandleProblem } from "./types";

/** 3〜20 文字。小文字の英数字と _ - だけ */
export const HANDLE_PATTERN = /^[a-z0-9_-]{3,20}$/;

/**
 * 使えない名前。URL(/@handle のほか、将来 /handle の形にしても困らないように)や、
 * 運営と紛らわしいものを入れておく。
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
    "about", "admin", "administrator", "api", "assets", "auth", "callback", "config", "dashboard", "dev",
    "edit", "explore", "favicon", "feed", "following", "followers", "healthz", "help", "home", "hoshid",
    "lab", "login", "logout", "me", "members", "moderator", "mod", "new", "notifications", "null",
    "official", "posts", "readyz", "root", "search", "settings", "signin", "signout", "signup", "skyia",
    "staff", "static", "support", "system", "tags", "undefined", "user", "users", "welcome", "www",
]);

/** 前後の空白を取って小文字にする。大文字と小文字は区別しない */
export const normalizeHandle = (value: string) => value.trim().toLowerCase();

/** 形と予約語だけを見る(使われているかは DB で見る) */
export function checkHandleShape(handle: string): Exclude<HandleProblem, "taken"> | null {
    if (!HANDLE_PATTERN.test(handle)) return "invalid";
    if (RESERVED_HANDLES.has(handle)) return "reserved";
    return null;
}

/** HoshID のニックネームから、最初に入れておくハンドルを作る。英数字でなければ空 */
export function suggestHandle(nickname: unknown): string {
    if (typeof nickname !== "string") return "";
    const value = normalizeHandle(nickname);
    return checkHandleShape(value) === null ? value : "";
}
