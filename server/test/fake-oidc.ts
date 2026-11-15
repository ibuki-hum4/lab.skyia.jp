// 手元で立てるニセの OIDC プロバイダー(HoshID の代わり)。テストと、手元の開発(bun run dev:oidc)で使う。
//
// - /.well-known/openid-configuration・/authorize・/token・/userinfo・/jwks・/end_session を返す
// - /token は client_secret_basic と PKCE(S256)を確かめる
// - テストでは `tamper` で、nonce・aud・iss を違えた ID トークンや、別の鍵で署名したものを出せる
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { createHash, randomBytes } from "node:crypto";

export type FakeUser = {
    sub: string;
    name?: string;
    nickname?: string;
    roles?: string | string[];
};

export type Tamper = {
    nonce?: string;
    aud?: string;
    iss?: string;
    /** JWKS に載っていない鍵で署名する */
    otherKey?: boolean;
    /** 期限切れにする */
    expired?: boolean;
};

export type FakeOidcOptions = {
    clientId: string;
    clientSecret: string;
    port?: number;
    /** true なら /authorize で画面を出して、ユーザーを選ばせる(手元の開発用)。false ならすぐ user で戻す */
    interactive?: boolean;
};

type Grant = { user: FakeUser; nonce?: string; challenge?: string; redirectUri: string };

const b64url = (buf: Buffer) => buf.toString("base64url");

export async function startFakeOidc(options: FakeOidcOptions) {
    const keys = await generateKeyPair("RS256", { extractable: true });
    const other = await generateKeyPair("RS256", { extractable: true });
    const jwk: JWK = { ...(await exportJWK(keys.publicKey)), kid: "fake-1", alg: "RS256", use: "sig" };

    const grants = new Map<string, Grant>();
    const tokens = new Map<string, FakeUser>();
    const state = {
        /** 次にログインする人(interactive でないとき) */
        user: { sub: "user-1", name: "テスト 太郎", nickname: "taro", roles: "一般" } as FakeUser,
        tamper: {} as Tamper,
        /** /end_session に来たクエリ(テストで確かめる) */
        endSessions: [] as URLSearchParams[],
        /** /token に来た回数 */
        tokenRequests: 0,
    };

    let issuer = "";
    const idToken = async (grant: Grant) => {
        const t = state.tamper;
        const now = Math.floor(Date.now() / 1000);
        const { sub, ...claims } = grant.user;
        return new SignJWT({ ...claims, nonce: t.nonce ?? grant.nonce })
            .setProtectedHeader({ alg: "RS256", kid: "fake-1" })
            .setIssuer(t.iss ?? issuer)
            .setAudience(t.aud ?? options.clientId)
            .setSubject(sub)
            .setIssuedAt(t.expired ? now - 7200 : now)
            .setExpirationTime(t.expired ? now - 3600 : now + 600)
            .sign(t.otherKey ? other.privateKey : keys.privateKey);
    };

    const grant = (url: URL, user: FakeUser) => {
        const redirectUri = url.searchParams.get("redirect_uri") ?? "";
        const code = b64url(randomBytes(16));
        grants.set(code, {
            user,
            nonce: url.searchParams.get("nonce") ?? undefined,
            challenge: url.searchParams.get("code_challenge") ?? undefined,
            redirectUri,
        });
        const back = new URL(redirectUri);
        back.searchParams.set("code", code);
        const st = url.searchParams.get("state");
        if (st) back.searchParams.set("state", st);
        return Response.redirect(back.toString(), 302);
    };

    const server = Bun.serve({
        port: options.port ?? 0,
        hostname: "127.0.0.1",
        async fetch(req) {
            const url = new URL(req.url);
            switch (url.pathname) {
                case "/.well-known/openid-configuration":
                    return Response.json({
                        issuer,
                        authorization_endpoint: `${issuer}/authorize`,
                        token_endpoint: `${issuer}/token`,
                        userinfo_endpoint: `${issuer}/userinfo`,
                        jwks_uri: `${issuer}/jwks`,
                        end_session_endpoint: `${issuer}/end_session`,
                        response_types_supported: ["code"],
                        subject_types_supported: ["public"],
                        id_token_signing_alg_values_supported: ["RS256"],
                        token_endpoint_auth_methods_supported: ["client_secret_basic"],
                        code_challenge_methods_supported: ["S256"],
                        scopes_supported: ["openid", "profile"],
                    });
                case "/jwks":
                    return Response.json({ keys: [jwk] });
                case "/authorize": {
                    if (url.searchParams.get("client_id") !== options.clientId) return new Response("unknown client", { status: 400 });
                    if (!options.interactive) return grant(url, state.user);
                    // 手元の開発用: ユーザーを選ぶ画面
                    const pick = url.searchParams.get("pick");
                    if (pick) {
                        const roles = url.searchParams.get("roles") ?? "一般";
                        return grant(url, {
                            sub: pick,
                            name: url.searchParams.get("name") || pick,
                            nickname: url.searchParams.get("nickname") ?? "",
                            roles,
                        });
                    }
                    const hidden = [...url.searchParams]
                        .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}">`)
                        .join("");
                    return new Response(
                        `<!doctype html><meta charset="utf-8"><title>ニセの HoshID</title>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto">
<h1>ニセの HoshID(手元の開発用)</h1>
<form method="get" action="/authorize" style="display:grid;gap:8px">${hidden}
<label>sub <input name="pick" value="dev-aki" required></label>
<label>表示名 <input name="name" value="あき"></label>
<label>ニックネーム <input name="nickname" value="aki"></label>
<label>ロール <select name="roles"><option>一般</option><option>役員</option><option>管理者</option></select></label>
<button>この人でログイン</button></form>`,
                        { headers: { "content-type": "text/html; charset=utf-8" } },
                    );
                }
                case "/token": {
                    state.tokenRequests++;
                    // RFC 6749 2.3.1: client_id と client_secret はフォームの形で符号化してから Basic にする
                    const basic = req.headers.get("authorization")?.match(/^Basic (.+)$/)?.[1];
                    const decoded = basic ? Buffer.from(basic, "base64").toString() : "";
                    const i = decoded.indexOf(":");
                    const form = (v: string) => decodeURIComponent(v.replace(/\+/g, " "));
                    if (i < 0 || form(decoded.slice(0, i)) !== options.clientId || form(decoded.slice(i + 1)) !== options.clientSecret) {
                        return Response.json({ error: "invalid_client" }, { status: 401 });
                    }
                    const body = new URLSearchParams(await req.text());
                    const code = body.get("code") ?? "";
                    const g = grants.get(code);
                    grants.delete(code); // コードは 1 回だけ
                    if (!g || body.get("grant_type") !== "authorization_code" || body.get("redirect_uri") !== g.redirectUri) {
                        return Response.json({ error: "invalid_grant" }, { status: 400 });
                    }
                    const verifier = body.get("code_verifier") ?? "";
                    if (!g.challenge || b64url(createHash("sha256").update(verifier).digest()) !== g.challenge) {
                        return Response.json({ error: "invalid_grant", error_description: "PKCE" }, { status: 400 });
                    }
                    const access = b64url(randomBytes(16));
                    tokens.set(access, g.user);
                    return Response.json({ access_token: access, token_type: "Bearer", expires_in: 600, id_token: await idToken(g), scope: "openid profile" });
                }
                case "/userinfo": {
                    const access = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
                    const user = tokens.get(access);
                    if (!user) return new Response(null, { status: 401 });
                    return Response.json(user);
                }
                case "/end_session":
                    state.endSessions.push(url.searchParams);
                    return new Response("ログアウトしました(ニセの HoshID)", { headers: { "content-type": "text/plain; charset=utf-8" } });
            }
            return new Response("not found", { status: 404 });
        },
    });
    issuer = `http://127.0.0.1:${server.port}`;

    return {
        issuer,
        state,
        stop: () => server.stop(true),
    };
}

export type FakeOidc = Awaited<ReturnType<typeof startFakeOidc>>;
