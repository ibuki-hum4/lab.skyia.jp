// ログイン(BFF)。Better Auth の genericOAuth で HoshID(OIDC)につなぐ。
//
// トークン(ID トークン・アクセストークン)はサーバーの DB(accounts)にだけ置き、ブラウザには
// セッションの Cookie(__Host-lab_session)しか渡さない。
//
// Better Auth のエンドポイントのうち、外に出すのは HoshID から戻ってくる /auth/callback/hoshid だけ。
// ログイン・ログアウト・ログイン後の振り分けは、このファイルの Senri のルートから auth.api を呼ぶ。
// (update-user などの Better Auth の書き込みのエンドポイントは、どこからも呼べない)
//
// Better Auth がしてくれること:
//   - state・nonce・PKCE(S256)を作って auth_flows に置き、コールバックで 1 回だけ使って消す
//   - コードを client_secret_basic と verifier で交換する
//   - ID トークンの署名(discovery の JWKS)・iss・aud・exp・nonce を確かめる(中は jose)
//   - (provider_id, account_id) = (hoshid, sub) でユーザーを探し、いなければ作る
//   - セッションを作って Cookie に入れる。使うたびに期限を延ばす
//   - ログアウトで、セッションを消し、end_session の URL(id_token_hint つき)を作る
import type { App, Context, Middleware } from "@senrijs/senri";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { decodeJwt } from "jose";
import { createHash } from "node:crypto";
import { roleFromClaims, type HoshIdConfig, type LabConfig } from "./config";
import { LIMITS } from "./limits";
import type { Db } from "./db";
import { suggestHandle } from "./handle";
import { safeNext } from "./next";
import type { Role, User } from "./types";
import { cleanDisplayName } from "./users";

export const PROVIDER_ID = "hoshid";
export const SESSION_COOKIE = "__Host-lab_session";
const DAY = 60 * 60 * 24;

export type AuthOptions = {
    config: LabConfig;
    db: Db;
    /** Traefik の CIDR。Better Auth がセッションに残す IP と、Better Auth のレート制限に使う */
    trustedProxies: string[];
};

/** OIDC のクレームを、Better Auth の「ユーザーの情報」に変える */
function profileFromClaims(claims: Record<string, unknown>, hoshid: HoshIdConfig) {
    const sub = String(claims.sub);
    const displayName = claims[hoshid.claims.displayName] ?? claims[hoshid.claims.nickname] ?? "";
    return {
        // 表示名の上限に合わせて切る(初回のログインのときだけ使う。あとは本人が変える)
        name: cleanDisplayName(String(displayName)).slice(0, LIMITS.displayName),
        role: roleFromClaims(claims, hoshid.claims),
        // Better Auth は email を必ず要る。scope に email を入れていないので、sub から作った仮の値にする。
        // issuer ごとに分けるので、HoshID をつなぎ替えても混ざらない
        email: `${createHash("sha256").update(`${hoshid.issuer}|${sub}`).digest("hex").slice(0, 32)}@hoshid.invalid`,
        emailVerified: true,
        image: undefined,
    };
}

export function createAuth({ config, db, trustedProxies }: AuthOptions) {
    const hoshid = config.hoshid;

    /** discovery の userinfo_endpoint(一度だけ取りに行く) */
    let userInfoEndpoint: Promise<string | undefined> | undefined;
    const getUserInfoEndpoint = (h: HoshIdConfig) =>
        (userInfoEndpoint ??= fetch(`${h.issuer}/.well-known/openid-configuration`)
            .then((r) => (r.ok ? (r.json() as Promise<{ userinfo_endpoint?: string }>) : ({} as { userinfo_endpoint?: string })))
            .then((d) => d.userinfo_endpoint)
            .catch(() => {
                userInfoEndpoint = undefined; // 次のログインでもう一度
                return undefined;
            }));

    const auth = betterAuth({
        appName: "lab",
        baseURL: config.baseUrl,
        basePath: "/auth",
        secret: config.authSecret,
        trustedOrigins: [config.baseUrl],
        telemetry: { enabled: false },
        database: prismaAdapter(db, { provider: "postgresql" }),

        user: {
            additionalFields: {
                // HoshID のクレームから決める。ログインのたびに上書きする(overrideUserInfo)。
                // 表示名(name)は初回だけ(下の databaseHooks.user.update で上書きを止める)。
                // input: true でないとクレームから入らない。利用者が書き換えられないように、
                // Better Auth の update-user は外に出していない
                role: { type: "string", required: false, defaultValue: "member", input: true },
            },
        },
        session: {
            expiresIn: 30 * DAY,
            // 使うたびに延ばす。毎回 DB に書かないように、前に延ばしてから 1 時間たっていたら延ばす
            updateAge: 60 * 60,
        },
        account: {
            // HoshID のアカウントは HoshID のアカウントとしかつなげない(メールでほかとまとめない)
            accountLinking: { enabled: false },
            // state などは DB(auth_flows)に置く
            storeStateStrategy: "database",
        },
        verification: {
            // state はハッシュにして置く
            storeIdentifier: "hashed",
        },

        advanced: {
            // Cookie の名前と属性を決める。__Host- は「Secure・Path=/・Domain なし」のときだけ
            // ブラウザが受け取る名前。Better Auth の __Secure- の前置きは付けない
            useSecureCookies: false,
            cookies: { session_token: { name: SESSION_COOKIE } },
            defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: "lax", path: "/" },
            ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies },
        },

        // コールバックでの失敗(state の使い回し、ID トークンの不正、凍結中など)は、ここへ ?error=... で送る
        onAPIError: { errorURL: "/login/error" },

        databaseHooks: {
            user: {
                update: {
                    // ログインのたびの上書き(overrideUserInfo)から、表示名を外す。ロールは上書きする。
                    // 表示名を変えるのは /settings/profile(Prisma で直接書く。Better Auth の update-user は外に出していない)。
                    // Better Auth はここで返したものを元のデータに重ねるので、キーを消すのではなく undefined を重ねる
                    // (Prisma は undefined の項目を書かない)
                    before: async (data) => ({ data: { ...data, name: undefined } }),
                },
            },
            session: {
                create: {
                    // 凍結中の人には、セッションを作らない
                    before: async (session) => {
                        const user = await db.user.findUnique({ where: { id: session.userId }, select: { suspendedAt: true } });
                        if (user?.suspendedAt) {
                            throw new APIError("FORBIDDEN", { code: "account_suspended", message: "account suspended" });
                        }
                        await db.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
                    },
                },
            },
        },

        plugins: hoshid
            ? [
                  genericOAuth({
                      config: [
                          {
                              providerId: PROVIDER_ID,
                              name: "HoshID",
                              discoveryUrl: `${hoshid.issuer}/.well-known/openid-configuration`,
                              clientId: hoshid.clientId,
                              clientSecret: hoshid.clientSecret,
                              authentication: "basic",
                              redirectURI: hoshid.redirectUri,
                              scopes: ["openid", "profile"],
                              pkce: true,
                              // discovery に jwks_uri がなければ、HoshID を使わない(検証しない ID トークンは受けない)
                              requireIdTokenVerification: true,
                              // ロールは、ログインのたびに上書きする(表示名は上の databaseHooks で外す)
                              overrideUserInfo: true,
                              // ここに来る前に、Better Auth が ID トークンを検証している。
                              // profile のクレームは userinfo にしか入らないことがあるので、それも合わせる
                              getUserInfo: async (tokens) => {
                                  if (!tokens.idToken) return null;
                                  const claims = decodeJwt(tokens.idToken) as Record<string, unknown>;
                                  let info: Record<string, unknown> = {};
                                  const endpoint = await getUserInfoEndpoint(hoshid);
                                  if (endpoint && tokens.accessToken) {
                                      const res = await fetch(endpoint, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
                                      if (res.ok) info = (await res.json()) as Record<string, unknown>;
                                      // 別の人の userinfo を混ぜない
                                      if (info.sub !== undefined && info.sub !== claims.sub) return null;
                                  }
                                  const merged = { ...info, ...claims };
                                  return { ...merged, id: String(claims.sub), sub: String(claims.sub), ...profileFromClaims(merged, hoshid) };
                              },
                              mapProfileToUser: (profile) => profileFromClaims(profile as Record<string, unknown>, hoshid),
                          },
                      ],
                  }),
              ]
            : [],
    });

    return auth;
}

export type Auth = ReturnType<typeof createAuth>;

/** Better Auth が返したヘッダーの Set-Cookie を、Senri のレスポンスに移す */
function forwardCookies(c: Context, headers: Headers | undefined) {
    for (const cookie of headers?.getSetCookie() ?? []) c.header("set-cookie", cookie);
}

/** DB の users の行を、アプリの User に */
async function loadUserRow(db: Db, id: string): Promise<User | null> {
    const row = await db.user.findUnique({
        where: { id },
        select: { id: true, handle: true, name: true, bio: true, role: true, suspendedAt: true, avatarHash: true },
    });
    if (!row) return null;
    return {
        id: row.id,
        handle: row.handle,
        displayName: row.name,
        bio: row.bio,
        role: row.role as Role,
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        avatarHash: row.avatarHash,
    };
}

/**
 * Cookie からログイン中の人を読んで、c.get("user") に入れる(いなければ null)。
 * 凍結中の人はログインしていないものとして扱う。
 */
export function sessionLoader(auth: Auth, db: Db): Middleware<{ user: User | null }> {
    return async (c, next) => {
        let user: User | null = null;
        if (c.req.headers.get("cookie")?.includes(SESSION_COOKIE)) {
            const result = await auth.api.getSession({ headers: c.req.headers, returnHeaders: true });
            forwardCookies(c, result.headers);
            if (result.response) {
                user = await loadUserRow(db, result.response.user.id);
                if (user?.suspendedAt) user = null;
            }
        }
        c.set("user", user);
        await next();
    };
}

/** /auth の下の Senri のルートを足す */
export function mountAuth(
    app: App<{ user: User | null }>,
    { auth, db, config }: { auth: Auth; db: Db; config: LabConfig },
) {
    const notConfigured = (c: Context) => {
        c.status(503);
        return "HoshID の設定がありません(HOSHID_ISSUER・HOSHID_CLIENT_ID・HOSHID_CLIENT_SECRET)";
    };

    // ログインを始める。HoshID の認可エンドポイントへ送る
    app.get("/auth/login", async (_, c) => {
        if (!config.hoshid) return notConfigured(c);
        const next = safeNext(c.query("next"));
        const result = await auth.api.signInSocial({
            body: {
                provider: PROVIDER_ID,
                // ログインのあと、ハンドルを決めたかで振り分ける(下の /auth/after)
                callbackURL: `/auth/after?next=${encodeURIComponent(next)}`,
                errorCallbackURL: "/login/error",
            },
            headers: c.req.headers,
            returnHeaders: true,
        });
        forwardCookies(c, result.headers);
        if (!result.response.url) throw new Error("HoshID の認可エンドポイントの URL が作れませんでした");
        return c.redirect(result.response.url, 302);
    });

    // HoshID から戻ってくるところ。Better Auth がそのまま受ける
    app.get("/auth/callback/:provider", (_, c) => auth.handler(c.req));

    // ログインのあと。ハンドルがまだなら /welcome へ、あれば next へ
    app.get("/auth/after", async (_, c) => {
        const user = c.get("user");
        const next = safeNext(c.query("next"));
        if (!user) return c.redirect("/login/error?error=no_session", 302);
        if (user.handle) return c.redirect(next, 302);

        // ハンドルの初期値は、HoshID のニックネーム(英数字のときだけ)
        const account = await db.account.findFirst({
            where: { userId: user.id, providerId: PROVIDER_ID },
            select: { idToken: true },
        });
        let suggest = "";
        if (account?.idToken && config.hoshid) {
            const claims = decodeJwt(account.idToken) as Record<string, unknown>;
            suggest = suggestHandle(claims[config.hoshid.claims.nickname]);
        }
        const query = new URLSearchParams({ next });
        if (suggest) query.set("suggest", suggest);
        return c.redirect(`/welcome?${query}`, 302);
    });

    // ログアウト。csrf() はアプリ全体に付けてある。セッションを消して、HoshID の end_session へ送る
    app.post("/auth/logout", async (_, c) => {
        const result = await auth.api.signOut({
            headers: c.req.headers,
            body: { callbackURL: "/" },
            returnHeaders: true,
        });
        forwardCookies(c, result.headers);
        const url = (result.response as { url?: string }).url;
        return c.redirect(url ?? "/", 303);
    });
}
