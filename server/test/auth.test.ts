import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "@senrijs/senri";
import { request } from "@senrijs/senri/testing";
import { requireRole } from "../src/guards";
import { safeNext } from "../src/next";
import type { User } from "../src/types";
import { Browser, createTestEnv, resetDb, truncateAll, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
    await resetDb();
    env = await createTestEnv();
});
afterAll(() => env.close());
beforeEach(async () => {
    await truncateAll(env.db);
    env.fake!.state.tamper = {};
    env.fake!.state.user = { sub: "user-1", name: "テスト 太郎", nickname: "taro", roles: "一般" };
});

const sessionCount = () => env.db.session.count();

describe("ログイン", () => {
    test("成功する。ハンドルがまだなら /welcome へ(ニックネームを初期値に)", async () => {
        const b = new Browser(env);
        const landed = await b.login("/tags/bun");
        expect(landed).toBe("/welcome?next=%2Ftags%2Fbun&suggest=taro");
        expect(b.sessionCookie).toBeDefined();
        expect(await sessionCount()).toBe(1);

        const me = await b.api("GET", "/api/me");
        expect(me.data).toEqual({ handle: null, displayName: "テスト 太郎", role: "member", avatar: null });
    });

    test("Cookie は __Host-lab_session、HttpOnly・Secure・SameSite=Lax・Path=/(Domain なし)", async () => {
        const b = new Browser(env);
        const start = await b.fetch("/auth/login?next=/");
        const authorize = await fetch(start.headers.get("location")!, { redirect: "manual" });
        const cb = new URL(authorize.headers.get("location")!);
        const res = await b.fetch(cb.pathname + cb.search);
        const line = res.headers.getSetCookie().find((l) => l.startsWith("__Host-lab_session="))!;
        expect(line).toBeDefined();
        expect(line).toMatch(/HttpOnly/i);
        expect(line).toMatch(/Secure/i);
        expect(line).toMatch(/SameSite=Lax/i);
        expect(line).toMatch(/Path=\//i);
        expect(line).not.toMatch(/Domain=/i);
        // DB にトークンはあるが、Cookie の値(署名つき)とは別物
        const row = await env.db.session.findFirstOrThrow({ select: { token: true } });
        expect(decodeURIComponent(line.split(";")[0]!.split("=")[1]!)).not.toBe(row.token);
    });

    test("認可のリクエストは scope=openid profile、PKCE は S256、state と nonce つき", async () => {
        const b = new Browser(env);
        const start = await b.fetch("/auth/login?next=/");
        const url = new URL(start.headers.get("location")!);
        expect(url.origin).toBe(env.fake!.issuer);
        expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["openid", "profile"]);
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("state")).toBeTruthy();
        expect(url.searchParams.get("nonce")).toBeTruthy();
    });

    test("ハンドルがある人は next へ", async () => {
        const b = new Browser(env);
        await b.login("/");
        expect((await b.api("POST", "/api/me/handle", { handle: "taro" })).status).toBe(200);
        const again = new Browser(env);
        expect(await again.login("/@taro")).toBe("/@taro");
    });

    test("ロールはログインのたびに上書きされる。表示名は初回だけ HoshID から取る", async () => {
        env.fake!.state.user = { sub: "user-1", name: "最初の名前", roles: "管理者" };
        const b = new Browser(env);
        await b.login("/");
        expect((await b.api("GET", "/api/me")).data).toMatchObject({ role: "admin", displayName: "最初の名前" });

        env.fake!.state.user = { sub: "user-1", name: "HoshID で変えた名前", roles: ["一般", "役員"] };
        const b2 = new Browser(env);
        await b2.login("/");
        expect((await b2.api("GET", "/api/me")).data).toMatchObject({ role: "moderator", displayName: "最初の名前" });
        // 同じ人(sub)なので、ユーザーは 1 人のまま
        expect(await env.db.user.count()).toBe(1);
    });

    test("自分で変えた表示名は、次のログインでも残る", async () => {
        env.fake!.state.user = { sub: "user-1", name: "HoshID の名前", roles: "一般" };
        const b = new Browser(env);
        await b.login("/");
        await b.api("POST", "/api/me/handle", { handle: "taro" });
        expect((await b.api("PATCH", "/api/me/profile", { displayName: "自分で決めた名前" })).status).toBe(200);

        env.fake!.state.user = { sub: "user-1", name: "HoshID の名前 2", roles: "管理者" };
        const b2 = new Browser(env);
        await b2.login("/");
        expect((await b2.api("GET", "/api/me")).data).toMatchObject({ role: "admin", displayName: "自分で決めた名前" });
    });

    test("初回の表示名は、長さの上限で切る", async () => {
        env.fake!.state.user = { sub: "user-1", name: "あ".repeat(80), roles: "一般" };
        const b = new Browser(env);
        await b.login("/");
        expect((await b.api("GET", "/api/me")).data.displayName).toBe("あ".repeat(50));
    });

    test("ロールのクレームがなければ member", async () => {
        env.fake!.state.user = { sub: "user-2", name: "なし" };
        const b = new Browser(env);
        await b.login("/");
        expect((await b.api("GET", "/api/me")).data).toMatchObject({ role: "member" });
    });

    test("ログイン前の /api/me は null", async () => {
        expect((await new Browser(env).api("GET", "/api/me")).data).toBeNull();
    });
});

describe("ログインで拒否されるもの", () => {
    /** 拒否されたら /login/error へ行き、セッションはできない */
    const expectRejected = async (b: Browser, landed: string) => {
        expect(landed).toStartWith("/login/error");
        expect(b.sessionCookie).toBeUndefined();
        expect(await sessionCount()).toBe(0);
    };

    test("state の使い回し", async () => {
        const b = new Browser(env);
        let callback = "";
        await b.login("/", (cb) => {
            callback = cb.pathname + cb.search;
        });
        expect(await sessionCount()).toBe(1);
        // 同じ state・同じコードで、もう一度コールバックを叩く(state の Cookie はそのまま、セッションの Cookie だけ消して)
        b.cookies.delete("__Host-lab_session");
        const landed = await b.follow(callback);
        expect(landed).toStartWith("/login/error");
        expect(b.sessionCookie).toBeUndefined();
        expect(await sessionCount()).toBe(1); // 最初の 1 つだけ
    });

    test("state を書き換えたもの", async () => {
        const b = new Browser(env);
        await expectRejected(b, await b.login("/", (cb) => void cb.searchParams.set("state", "forged")));
    });

    test("nonce が違う ID トークン", async () => {
        env.fake!.state.tamper = { nonce: "other-nonce" };
        const b = new Browser(env);
        await expectRejected(b, await b.login("/"));
    });

    test("署名が違う ID トークン(JWKS にない鍵)", async () => {
        env.fake!.state.tamper = { otherKey: true };
        const b = new Browser(env);
        await expectRejected(b, await b.login("/"));
    });

    test("aud が違う ID トークン", async () => {
        env.fake!.state.tamper = { aud: "someone-else" };
        const b = new Browser(env);
        await expectRejected(b, await b.login("/"));
    });

    test("iss が違う ID トークン", async () => {
        env.fake!.state.tamper = { iss: "https://evil.example" };
        const b = new Browser(env);
        await expectRejected(b, await b.login("/"));
    });

    test("期限切れの ID トークン", async () => {
        env.fake!.state.tamper = { expired: true };
        const b = new Browser(env);
        await expectRejected(b, await b.login("/"));
    });

    test("凍結中のユーザー", async () => {
        const b = new Browser(env);
        await b.login("/");
        await env.db.user.updateMany({ data: { suspendedAt: new Date() } });
        // いまのセッションも、もうログイン中とはみなさない
        expect((await b.api("GET", "/api/me")).data).toBeNull();
        await env.db.session.deleteMany();

        const again = new Browser(env);
        const landed = await again.login("/");
        expect(landed).toStartWith("/login/error");
        expect(landed).toContain("account_suspended");
        expect(again.sessionCookie).toBeUndefined();
        expect(await sessionCount()).toBe(0);
    });

    test("外へのリダイレクト(next)は / にする", async () => {
        for (const next of ["//evil.example/x", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/%0a/evil"]) {
            const b = new Browser(env);
            await b.login("/");
            await b.api("POST", "/api/me/handle", { handle: "taro" });
            const c = new Browser(env);
            const landed = await c.login(next);
            expect(landed.startsWith("/")).toBe(true);
            expect(landed.startsWith("//")).toBe(false);
            await truncateAll(env.db);
        }
    });

    test("csrf() のない書き込み(よそのサイトから)は 403", async () => {
        const b = new Browser(env);
        await b.login("/");
        const res = await b.api("POST", "/api/me/handle", { handle: "taro" }, "cross-site");
        expect(res.status).toBe(403);
        const logout = await b.fetch("/auth/logout", { method: "POST", site: "cross-site" });
        expect(logout.status).toBe(403);
        expect(await sessionCount()).toBe(1);
    });

    test("ログインなしの書き込みは 401", async () => {
        const res = await new Browser(env).api("POST", "/api/me/handle", { handle: "taro" });
        expect(res.status).toBe(401);
    });
});

describe("ログアウト", () => {
    test("セッションが消え、HoshID の end_session へ id_token_hint つきで送る", async () => {
        const b = new Browser(env);
        await b.login("/");
        expect(await sessionCount()).toBe(1);
        const res = await b.fetch("/auth/logout", { method: "POST" });
        expect(res.status).toBe(303);
        const to = new URL(res.headers.get("location")!);
        expect(to.origin + to.pathname).toBe(`${env.fake!.issuer}/end_session`);
        expect(to.searchParams.get("id_token_hint")).toBeTruthy();
        expect(to.searchParams.get("post_logout_redirect_uri")).toBe("http://lab.test/");
        expect(await sessionCount()).toBe(0);
        expect(b.sessionCookie).toBeUndefined();
        expect((await b.api("GET", "/api/me")).data).toBeNull();
    });
});

describe("safeNext", () => {
    test("サイト内の相対パスだけ", () => {
        expect(safeNext("/@aki?tab=1#x")).toBe("/@aki?tab=1#x");
        expect(safeNext("//evil.example")).toBe("/");
        expect(safeNext("/\\evil.example")).toBe("/");
        expect(safeNext("https://evil.example/")).toBe("/");
        expect(safeNext("evil")).toBe("/");
        expect(safeNext("/\tevil")).toBe("/");
        expect(safeNext(undefined)).toBe("/");
    });
});

describe("requireRole", () => {
    const user = (role: User["role"]): User => ({ id: "u", handle: "u", displayName: "", bio: "", role, suspendedAt: null, avatarHash: null });

    test("ロールが足りなければ 403、ログインしていなければ 401", async () => {
        const mw = requireRole("moderator");
        const run = async (u: User | null) => {
            const app = createApp<{ user: User | null }>();
            app.use(async (c, next) => {
                c.set("user", u);
                await next();
            });
            app.use(mw);
            app.get("/x", () => "ok");
            return (await request(app, "GET /x")).status;
        };
        expect(await run(null)).toBe(401);
        expect(await run(user("member"))).toBe(403);
        expect(await run(user("moderator"))).toBe(200);
        expect(await run(user("admin"))).toBe(200);
    });
});
