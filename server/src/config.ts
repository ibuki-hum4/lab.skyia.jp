// 環境変数から設定を読む。値の意味は .env.example に書いてある。
import type { Role } from "./types";

export type HoshIdConfig = {
    /** HoshID の issuer(例: https://hoshid.skyia.jp/api/auth)。discovery はこの下の /.well-known/openid-configuration */
    issuer: string;
    clientId: string;
    clientSecret: string;
    /** HoshID に登録したリダイレクト URI。既定は `<LAB_BASE_URL>/auth/callback/hoshid` */
    redirectUri: string;
    claims: ClaimConfig;
};

export type ClaimConfig = {
    /** ロールが入るクレームの名前 */
    roles: string;
    /** クレームの値 → ロール */
    roleMap: ReadonlyMap<string, Role>;
    /** 表示名のクレームの名前 */
    displayName: string;
    /** ニックネームのクレームの名前(ハンドルの初期値に使う) */
    nickname: string;
};

const ROLES: readonly Role[] = ["member", "moderator", "admin"];

/** "一般:member,役員:moderator,管理者:admin" を読む */
export function parseRoleMap(value: string): Map<string, Role> {
    const map = new Map<string, Role>();
    for (const pair of value.split(",")) {
        if (pair.trim() === "") continue;
        const i = pair.lastIndexOf(":");
        const claim = pair.slice(0, i).trim();
        const role = pair.slice(i + 1).trim() as Role;
        if (i <= 0 || claim === "" || !ROLES.includes(role)) {
            throw new Error(`HOSHID_ROLE_MAP の書き方が違います(「値:member」をカンマで並べる): ${pair}`);
        }
        map.set(claim, role);
    }
    return map;
}

/**
 * クレームからロールを決める。値は文字列でも配列でもよく、対応するものが複数あれば一番強いものにする。
 * クレームがない・どれも対応しないときは member。
 */
export function roleFromClaims(claims: Record<string, unknown>, config: ClaimConfig): Role {
    const raw = claims[config.roles];
    const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
    let best = 0;
    for (const v of values) {
        const role = config.roleMap.get(String(v));
        if (role) best = Math.max(best, ROLES.indexOf(role));
    }
    return ROLES[best]!;
}

export const defaultClaimConfig = (): ClaimConfig => ({
    roles: "roles",
    roleMap: parseRoleMap("一般:member,役員:moderator,管理者:admin"),
    displayName: "name",
    nickname: "nickname",
});

export type LabConfig = {
    /** このサイトの URL(例: https://lab.skyia.jp)。開発中は http://localhost:5173 */
    baseUrl: string;
    databaseUrl: string;
    /** Better Auth が Cookie の署名などに使う。32 文字以上のランダムな値 */
    authSecret: string;
    /** HoshID の設定がそろっていなければ null(ログインのボタンを押すと 503 になる) */
    hoshid: HoshIdConfig | null;
};

export function readConfig(env: Record<string, string | undefined>): LabConfig {
    const need = (name: string) => {
        const value = env[name];
        if (!value) throw new Error(`${name} がありません(.env.example を見てください)`);
        return value;
    };
    const baseUrl = need("LAB_BASE_URL").replace(/\/$/, "");
    const claims: ClaimConfig = {
        roles: env.HOSHID_ROLES_CLAIM || "roles",
        roleMap: parseRoleMap(env.HOSHID_ROLE_MAP || "一般:member,役員:moderator,管理者:admin"),
        displayName: env.HOSHID_DISPLAY_NAME_CLAIM || "name",
        nickname: env.HOSHID_NICKNAME_CLAIM || "nickname",
    };
    const { HOSHID_ISSUER: issuer, HOSHID_CLIENT_ID: clientId, HOSHID_CLIENT_SECRET: clientSecret } = env;
    return {
        baseUrl,
        databaseUrl: need("DATABASE_URL"),
        authSecret: need("BETTER_AUTH_SECRET"),
        hoshid:
            issuer && clientId && clientSecret
                ? {
                      issuer: issuer.replace(/\/$/, ""),
                      clientId,
                      clientSecret,
                      redirectUri: env.HOSHID_REDIRECT_URI || `${baseUrl}/auth/callback/hoshid`,
                      claims,
                  }
                : null,
    };
}
