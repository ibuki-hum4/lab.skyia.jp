import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Browser, createTestEnv, resetDb, truncateAll, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
    await resetDb();
    env = await createTestEnv();
});
afterAll(() => env.close());
beforeEach(() => truncateAll(env.db));

/** sub の人でログインして、ハンドルを決めたブラウザ */
async function member(sub: string, handle: string) {
    env.fake!.state.user = { sub, name: `${handle} さん`, roles: "一般" };
    const b = new Browser(env);
    await b.login("/");
    const res = await b.api("POST", "/api/me/handle", { handle });
    expect(res.status).toBe(200);
    return b;
}

describe("ハンドル", () => {
    test("決められるのは 1 回だけ。大文字は小文字にする", async () => {
        env.fake!.state.user = { sub: "s1", name: "あき" };
        const b = new Browser(env);
        await b.login("/");
        expect(await b.api("POST", "/api/me/handle", { handle: "Aki_01" })).toEqual({ status: 200, data: { handle: "aki_01" } });
        expect((await b.api("GET", "/api/me")).data).toMatchObject({ handle: "aki_01" });
        expect((await b.api("POST", "/api/me/handle", { handle: "other" })).status).toBe(409);
    });

    test("重複は拒否する(大文字と小文字を区別しない)", async () => {
        await member("s1", "aki");
        env.fake!.state.user = { sub: "s2", name: "そら" };
        const b = new Browser(env);
        await b.login("/");
        expect(await b.api("POST", "/api/me/handle", { handle: "AKI" })).toEqual({ status: 409, data: { error: "taken" } });
        expect((await b.api("GET", "/api/handles/Aki/available")).data).toEqual({ available: false, reason: "taken" });
    });

    test("予約語は拒否する", async () => {
        env.fake!.state.user = { sub: "s1" };
        const b = new Browser(env);
        await b.login("/");
        for (const handle of ["admin", "api", "auth", "welcome", "new", "settings", "tags", "search"]) {
            expect(await b.api("POST", "/api/me/handle", { handle })).toEqual({ status: 400, data: { error: "reserved" } });
        }
        expect((await b.api("GET", "/api/handles/admin/available")).data).toEqual({ available: false, reason: "reserved" });
    });

    test("使えない文字・長さは拒否する", async () => {
        env.fake!.state.user = { sub: "s1" };
        const b = new Browser(env);
        await b.login("/");
        for (const handle of ["ab", "a".repeat(21), "あいう", "a b", "a.b", "a@b", ""]) {
            expect((await b.api("POST", "/api/me/handle", { handle })).data).toEqual({ error: "invalid" });
        }
        expect((await b.api("POST", "/api/me/handle", { nope: 1 })).status).toBe(400);
        expect((await b.api("GET", "/api/handles/ok_name-1/available")).data).toEqual({ available: true });
    });
});

describe("フォローとブロック", () => {
    test("フォローして外せる。数と「フォローされています」が出る", async () => {
        const aki = await member("s1", "aki");
        const sora = await member("s2", "sora");

        expect(await aki.api("POST", "/api/users/sora/follow")).toEqual({ status: 200, data: { following: true } });
        expect((await aki.api("POST", "/api/users/sora/follow")).status).toBe(200); // 2 回目も同じ

        const seen = await sora.api("GET", "/api/users/aki");
        expect(seen.data).toEqual({
            handle: "aki",
            displayName: "aki さん",
            bio: "",
            avatar: null,
            counts: { experiment: 0, pass: 0, fail: 0, watch: 0, article: 0, memo: 0 },
            followingCount: 1,
            followerCount: 0,
            viewer: { following: false, followedBy: true, blocking: false },
        });
        // ログイン前は viewer がない
        expect((await new Browser(env).api("GET", "/api/users/sora")).data).toEqual({
            handle: "sora",
            displayName: "sora さん",
            bio: "",
            avatar: null,
            counts: { experiment: 0, pass: 0, fail: 0, watch: 0, article: 0, memo: 0 },
            followingCount: 0,
            followerCount: 1,
        });
        expect((await new Browser(env).api("GET", "/api/users/sora/followers")).data).toEqual([{ handle: "aki", displayName: "aki さん" }]);
        expect((await new Browser(env).api("GET", "/api/users/aki/following")).data).toEqual([{ handle: "sora", displayName: "sora さん" }]);

        expect(await aki.api("DELETE", "/api/users/sora/follow")).toEqual({ status: 200, data: { following: false } });
        expect((await new Browser(env).api("GET", "/api/users/sora")).data).toMatchObject({ followerCount: 0 });
    });

    test("自分自身はフォローもブロックもできない", async () => {
        const aki = await member("s1", "aki");
        expect(await aki.api("POST", "/api/users/aki/follow")).toEqual({ status: 400, data: { error: "self" } });
        expect(await aki.api("POST", "/api/users/AKI/block")).toEqual({ status: 400, data: { error: "self" } });
    });

    test("いない人は 404", async () => {
        const aki = await member("s1", "aki");
        expect((await aki.api("POST", "/api/users/nobody/follow")).status).toBe(404);
        expect((await aki.api("GET", "/api/users/nobody")).status).toBe(404);
    });

    test("ブロックすると、お互いのフォローが消える", async () => {
        const aki = await member("s1", "aki");
        const sora = await member("s2", "sora");
        await aki.api("POST", "/api/users/sora/follow");
        await sora.api("POST", "/api/users/aki/follow");

        expect(await aki.api("POST", "/api/users/sora/block")).toEqual({ status: 200, data: { blocking: true } });
        expect(await env.db.follow.count()).toBe(0);
        expect((await aki.api("GET", "/api/users/sora")).data.viewer).toEqual({ following: false, followedBy: false, blocking: true });
        // 相手には知らせない(相手から見た自分のページに、ブロックの印は出ない)
        expect((await sora.api("GET", "/api/users/aki")).data.viewer).toEqual({ following: false, followedBy: false, blocking: false });
    });

    test("ブロック中はフォローできない(どちらの向きでも)", async () => {
        const aki = await member("s1", "aki");
        const sora = await member("s2", "sora");
        await aki.api("POST", "/api/users/sora/block");
        expect(await aki.api("POST", "/api/users/sora/follow")).toEqual({ status: 403, data: { error: "cannot_follow" } });
        expect(await sora.api("POST", "/api/users/aki/follow")).toEqual({ status: 403, data: { error: "cannot_follow" } });

        expect(await env.social.isBlockedBetween(...(await ids("aki", "sora")))).toBe(true);
        expect(await aki.api("DELETE", "/api/users/sora/block")).toEqual({ status: 200, data: { blocking: false } });
        expect(await env.social.isBlockedBetween(...(await ids("sora", "aki")))).toBe(false);
        expect((await sora.api("POST", "/api/users/aki/follow")).status).toBe(200);
    });

    test("ブロックの一覧は本人だけが見られる", async () => {
        const aki = await member("s1", "aki");
        await member("s2", "sora");
        await aki.api("POST", "/api/users/sora/block");
        expect((await aki.api("GET", "/api/me/blocks")).data).toEqual([{ handle: "sora", displayName: "sora さん" }]);
        // 他人のブロックの一覧を見る道はない。ログイン前は 401、ほかの人は自分の(空の)一覧だけ
        expect((await new Browser(env).api("GET", "/api/me/blocks")).status).toBe(401);
        const riku = await member("s3", "riku");
        expect((await riku.api("GET", "/api/me/blocks")).data).toEqual([]);
        expect((await riku.api("GET", "/api/users/aki/blocks")).status).toBe(404);
    });

    test("書き込みはログインが要る", async () => {
        await member("s1", "aki");
        const anon = new Browser(env);
        for (const [m, p] of [["POST", "/api/users/aki/follow"], ["DELETE", "/api/users/aki/follow"], ["POST", "/api/users/aki/block"], ["DELETE", "/api/users/aki/block"]] as const) {
            expect((await anon.api(m, p)).status).toBe(401);
        }
    });
});

async function ids(a: string, b: string): Promise<[string, string]> {
    const row = async (h: string) => (await env.db.user.findFirstOrThrow({ where: { handle: h } })).id;
    return [await row(a), await row(b)];
}
