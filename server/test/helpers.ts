// テストの土台。テスト用の PostgreSQL(TEST_DATABASE_URL)を毎回まっさらにして、マイグレーションを当てる。
//
// 手元: `podman compose up -d` で立てた DB の lab_test を使う(既定の URL)。マイグレーションは prisma/migrations
// CI: ci.yml の services の postgres を使う。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { createLabApp } from "../src/app";
import type { LabConfig } from "../src/config";
import type { RateLimits } from "../src/limits";
import { defaultClaimConfig } from "../src/config";
import { openDb, type Db } from "../src/db";
import { startFakeOidc, type FakeOidc } from "./fake-oidc";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://lab:lab@127.0.0.1:5432/lab_test";
export const BASE = "http://lab.test";

/** public スキーマを消して作り直し、マイグレーションを当てる */
export async function resetDb() {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    try {
        await client.connect();
    } catch (err) {
        throw new Error(
            `テスト用の PostgreSQL(${TEST_DATABASE_URL.replace(/:[^:@/]+@/, ":***@")})につながりません。` +
                `\`podman compose up -d\` で立てるか、TEST_DATABASE_URL を設定してください: ${(err as Error).message}`,
        );
    }
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    // prisma/migrations の SQL を名前の順に当てる(`prisma migrate deploy` と同じ中身。CLI を呼ぶより速い)
    const dir = join(import.meta.dir, "../prisma/migrations");
    for (const name of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
        await client.query(readFileSync(join(dir, name, "migration.sql"), "utf8"));
    }
    await client.end();
}

/** テストのたびに中身を空にする(スキーマは残す) */
export async function truncateAll(db: Db) {
    await db.$executeRawUnsafe("TRUNCATE users, accounts, sessions, auth_flows, follows, blocks, user_avatars, notes, note_counters, note_status_history, note_links, comments, tags, note_tags, note_likes CASCADE");
}

export type TestEnv = Awaited<ReturnType<typeof createTestEnv>>;

const NO = { windowMs: 60_000, limit: 100_000 };
const NO_LIMITS: RateLimits = { note: NO, comment: NO, like: NO, avatar: NO, preview: NO };

/** sub の人でログインして、ハンドルを決めたブラウザ。roles は HoshID のロールのクレーム */
export async function signIn(env: TestEnv, sub: string, handle: string, roles: string | string[] = "一般") {
    env.fake!.state.user = { sub, name: `${handle} さん`, roles };
    const b = new Browser(env);
    await b.login("/");
    const res = await b.api("POST", "/api/me/handle", { handle });
    if (res.status !== 200) throw new Error(`ハンドルを決められませんでした: ${JSON.stringify(res)}`);
    return b;
}

/** ニセの HoshID と、アプリと、DB をまとめて作る */
export async function createTestEnv(opts: { hoshid?: boolean; rateLimits?: Partial<RateLimits> } = {}) {
    const fake: FakeOidc | null = opts.hoshid === false ? null : await startFakeOidc({ clientId: "lab-test", clientSecret: "s3cret:with/odd chars" });
    const config: LabConfig = {
        baseUrl: BASE,
        databaseUrl: TEST_DATABASE_URL,
        authSecret: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
        hoshid: fake
            ? {
                  issuer: fake.issuer,
                  clientId: "lab-test",
                  clientSecret: "s3cret:with/odd chars",
                  redirectUri: `${BASE}/auth/callback/hoshid`,
                  claims: defaultClaimConfig(),
              }
            : null,
    };
    const db = openDb(TEST_DATABASE_URL);
    const { app, auth, social } = await createLabApp({
        config,
        db,
        // テストでは、連打の制限は数えるテストだけで効かせる
        rateLimits: opts.rateLimits ?? NO_LIMITS,
    });
    return {
        app,
        auth,
        social,
        db,
        fake,
        config,
        async close() {
            fake?.stop();
            await db.$disconnect();
        },
    };
}

/**
 * Cookie を持つ、ニセのブラウザ。同じサイトからのリクエストとして Sec-Fetch-Site: same-origin を付ける。
 * リダイレクトは自分で追う(follow)。
 */
export class Browser {
    cookies = new Map<string, string>();
    constructor(private env: TestEnv) {}

    private store(res: Response) {
        for (const line of res.headers.getSetCookie()) {
            const [pair, ...attrs] = line.split(";");
            const i = pair!.indexOf("=");
            const name = pair!.slice(0, i).trim();
            const value = pair!.slice(i + 1).trim();
            const gone =
                value === "" ||
                attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) ||
                attrs.some((a) => /^\s*expires=/i.test(a) && new Date(a.split("=")[1]!) < new Date());
            if (gone) this.cookies.delete(name);
            else this.cookies.set(name, value);
        }
    }

    /** アプリへのリクエスト */
    async fetch(path: string, init: RequestInit & { site?: string } = {}) {
        const headers = new Headers(init.headers);
        headers.set("sec-fetch-site", init.site ?? "same-origin");
        if (this.cookies.size > 0) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
        const res = await this.env.app.fetch(new Request(new URL(path, BASE).toString(), { ...init, headers, redirect: "manual" } as RequestInit));
        this.store(res);
        return res;
    }

    /** JSON の API を呼ぶ */
    async api(method: string, path: string, body?: unknown, site?: string) {
        const res = await this.fetch(path, {
            method,
            site,
            headers: body === undefined ? {} : { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const json = res.headers.get("content-type")?.includes("json");
        return { status: res.status, data: text && json ? JSON.parse(text) : text || null };
    }

    /**
     * /auth/login から始めて、HoshID(ニセ)を通って戻ってくるまで。最後の Location(アプリの中のパス)を返す。
     * `before` で、コールバックの前に何かできる(state を控えるなど)。
     */
    async login(next = "/", before?: (callback: URL) => void | Promise<void>) {
        const start = await this.fetch(`/auth/login?next=${encodeURIComponent(next)}`);
        if (start.status !== 302) throw new Error(`/auth/login が ${start.status}: ${await start.text()}`);
        const authorize = await fetch(start.headers.get("location")!, { redirect: "manual" });
        const callback = new URL(authorize.headers.get("location")!);
        await before?.(callback);
        return this.follow(callback.pathname + callback.search);
    }

    /** アプリの中でリダイレクトを追い、外へ出るか、リダイレクトでなくなるまで。最後のパス(か外の URL)を返す */
    async follow(path: string): Promise<string> {
        let current = path;
        for (let i = 0; i < 5; i++) {
            const res = await this.fetch(current);
            const location = res.headers.get("location");
            if (res.status < 300 || res.status >= 400 || !location) return current;
            const url = new URL(location, BASE);
            if (url.origin !== BASE) return url.toString();
            current = url.pathname + url.search;
            // SPA のページ(/welcome など)はアプリの API ではないので、そこで止める
            if (!current.startsWith("/auth/") && !current.startsWith("/api/")) return current;
        }
        return current;
    }

    get sessionCookie() {
        return this.cookies.get("__Host-lab_session");
    }
}
