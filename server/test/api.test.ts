import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { request } from "@senrijs/senri/testing";
import { createLabApp } from "../src/app";
import { openDb } from "../src/db";
import { BASE, TEST_DATABASE_URL, resetDb, truncateAll } from "./helpers";

const db = openDb(TEST_DATABASE_URL);
beforeAll(() => resetDb());
afterAll(() => db.$disconnect());

async function setup() {
    await truncateAll(db);
    const { app } = await createLabApp({
        config: { baseUrl: BASE, databaseUrl: TEST_DATABASE_URL, authSecret: "x".repeat(40), hoshid: null },
        db,
    });
    return { app };
}

describe("404", () => {
    test("/api で見つからないものは 404 の JSON", async () => {
        const { app } = await setup();
        const res = await request(app, "GET /api/unknown/path");
        expect(res.status).toBe(404);
        expect(res.headers.get("content-type")).toContain("application/json");
        expect(await res.json()).toEqual({ error: "not_found" });
    });

    test("消した content/ の記事の API は 404", async () => {
        const { app } = await setup();
        for (const path of ["GET /api/posts", "GET /api/posts/hello-lab", "GET /api/tags"] as const) {
            expect((await request(app, path)).status).toBe(404);
        }
        expect((await request(app, "POST /api/posts/hello-lab/like", { headers: { "sec-fetch-site": "same-origin" } })).status).toBe(404);
    });

    test("/healthz は 200", async () => {
        const { app } = await setup();
        const res = await request(app, "GET /healthz");
        expect(res.status).toBe(200);
    });
});

describe("post_likes", () => {
    test("記事のいいねの表は消え、ノートのいいねの表は残る", async () => {
        const rows = await db.$queryRaw<{ name: string }[]>`
            SELECT table_name AS name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name IN ('post_likes', 'note_likes')`;
        expect(rows.map((r) => r.name)).toEqual(["note_likes"]);
    });
});
