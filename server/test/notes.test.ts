import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { codeOf, normalizeTags, parseCode, watchDays } from "../src/notes";
import { Browser, createTestEnv, resetDb, signIn, truncateAll, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
    await resetDb();
    env = await createTestEnv();
});
afterAll(() => env.close());
beforeEach(() => truncateAll(env.db));

const anon = () => new Browser(env);

type NoteBody = { kind?: string; title?: string; body?: string; status?: string; tags?: string[]; draft?: boolean; link?: unknown };

/** 公開したノートを作って、返ってきた中身を返す */
async function post(b: Browser, body: NoteBody = {}) {
    const res = await b.api("POST", "/api/notes", { kind: "experiment", title: "実験", body: "本文", draft: false, ...body });
    if (res.status !== 200) throw new Error(`作れませんでした: ${JSON.stringify(res)}`);
    return res.data;
}

const ids = (items: { id: string }[]) => items.map((n) => n.id);

describe("ノートを作る・読む", () => {
    test("作ると通し番号が付き、HTML と抜き書きができる", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki, { title: "最初の実験", body: "## 目的\n\nはやくする。`code` も。", tags: ["Senri", "#bench"] });
        expect(n).toMatchObject({
            code: "EXP-001",
            kind: "experiment",
            number: 1,
            title: "最初の実験",
            status: "watch",
            draft: false,
            tags: ["bench", "senri"],
            excerpt: "はやくする。code も。",
            watchDays: 1,
            author: { handle: "aki", displayName: "aki さん", avatar: null },
            viewer: { canEdit: true, liked: false },
        });
        expect(n.html).toContain('<h2 id="h-目的">目的</h2>');
        expect(n.toc).toEqual([{ depth: 2, id: "h-目的", text: "目的" }]);
        expect(n.body).toBe("## 目的\n\nはやくする。`code` も。");

        // 他人には Markdown のままの本文は返さない
        const seen = await anon().api("GET", `/api/notes/${n.id}`);
        expect(seen.status).toBe(200);
        expect(seen.data.body).toBeUndefined();
        expect(seen.data.viewer).toEqual({ liked: false, canEdit: false, canModerate: false, canInteract: false });

        // /@aki/EXP-001 の形でも引ける(大文字・小文字は問わない)
        expect((await anon().api("GET", "/api/users/AKI/notes/exp-001")).data.id).toBe(n.id);
        expect((await anon().api("GET", "/api/users/aki/notes/EXP-002")).status).toBe(404);
        expect((await anon().api("GET", "/api/users/aki/notes/XYZ-001")).status).toBe(404);
        expect((await anon().api("GET", "/api/notes/abc")).status).toBe(404);
    });

    test("通し番号は、作者・種類ごと。表示は EXP・POST・MEMO", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        expect((await post(aki)).code).toBe("EXP-001");
        expect((await post(aki)).code).toBe("EXP-002");
        expect((await post(aki, { kind: "article" })).code).toBe("POST-001");
        expect((await post(aki, { kind: "memo" })).code).toBe("MEMO-001");
        expect((await post(sora)).code).toBe("EXP-001");
    });

    test("通し番号は、同時に作っても重ならない", async () => {
        const aki = await signIn(env, "s1", "aki");
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => post(aki, { title: `同時 ${i}` })));
        const numbers = results.map((n) => n.number).sort((a, b) => a - b);
        expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    test("消したノートの番号は詰めない", async () => {
        const aki = await signIn(env, "s1", "aki");
        const first = await post(aki);
        expect((await aki.api("DELETE", `/api/notes/${first.id}`)).status).toBe(200);
        expect((await post(aki)).code).toBe("EXP-002");
    });

    test("入力の確かめ", async () => {
        const aki = await signIn(env, "s1", "aki");
        const bad = async (body: NoteBody) => (await aki.api("POST", "/api/notes", { kind: "experiment", title: "t", ...body })).data.error;
        expect(await bad({ kind: "diary" })).toBe("invalid_kind");
        expect(await bad({ title: "   " })).toBe("title_required");
        expect(await bad({ title: "あ".repeat(101) })).toBe("title_too_long");
        expect(await bad({ body: "a".repeat(50_001) })).toBe("body_too_long");
        expect(await bad({ status: "maybe" })).toBe("invalid_status");
        expect(await bad({ kind: "memo", status: "pass" })).toBe("status_only_for_experiments");
        expect(await bad({ tags: ["a b"] })).toBe("invalid_tag");
        expect(await bad({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toBe("too_many_tags");
        // 10 個までは通る。大文字・# は整えて、重なりは 1 つに
        const ok = await post(aki, { tags: [...Array.from({ length: 10 }, (_, i) => `T${i}`), "#t0"] });
        expect(ok.tags).toHaveLength(10);
        // 記事とメモは状態を持たない
        expect((await post(aki, { kind: "article" })).status).toBeNull();
    });

    test("ログインしていなければ 401、ハンドルがなければ 403", async () => {
        expect((await anon().api("POST", "/api/notes", { kind: "memo", title: "x" })).status).toBe(401);
        env.fake!.state.user = { sub: "s9", name: "名無し" };
        const b = new Browser(env);
        await b.login("/");
        expect((await b.api("POST", "/api/notes", { kind: "memo", title: "x" })).data).toEqual({ error: "no_handle" });
    });
});

describe("本人だけができること", () => {
    test("他人は編集・削除・公開ができない(403)。ログインなしは 401", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const n = await post(aki);
        expect((await sora.api("PATCH", `/api/notes/${n.id}`, { title: "乗っ取り" })).status).toBe(403);
        expect((await sora.api("DELETE", `/api/notes/${n.id}`)).status).toBe(403);
        expect((await sora.api("POST", `/api/notes/${n.id}/publish`)).status).toBe(403);
        expect((await anon().api("PATCH", `/api/notes/${n.id}`, { title: "x" })).status).toBe(401);
        expect((await anon().api("DELETE", `/api/notes/${n.id}`)).status).toBe(401);
        expect((await aki.api("GET", `/api/notes/${n.id}`)).data.title).toBe("実験");

        // 本人はできる
        expect((await aki.api("PATCH", `/api/notes/${n.id}`, { title: "直した" })).data.title).toBe("直した");
        expect((await aki.api("DELETE", `/api/notes/${n.id}`)).status).toBe(200);
        expect((await aki.api("GET", `/api/notes/${n.id}`)).status).toBe(404);
    });

    test("種類はあとから変えられない", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki);
        expect((await aki.api("PATCH", `/api/notes/${n.id}`, { kind: "memo" })).data).toEqual({ error: "kind_is_fixed" });
    });
});

describe("下書き", () => {
    test("下書きは本人にしか見えない(1 件・一覧・検索・タグ・番号で引いても)", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const draft = await post(aki, { title: "ひみつの下書き", tags: ["draftonly"], draft: true });
        expect(draft).toMatchObject({ draft: true, publishedAt: null });

        for (const b of [sora, anon()]) {
            expect((await b.api("GET", `/api/notes/${draft.id}`)).status).toBe(404);
            expect((await b.api("GET", `/api/users/aki/notes/${draft.code}`)).status).toBe(404);
            expect((await b.api("GET", "/api/notes")).data.items).toEqual([]);
            expect((await b.api("GET", "/api/notes?author=aki")).data.items).toEqual([]);
            expect((await b.api("GET", "/api/search?q=ひみつ")).data.notes.items).toEqual([]);
            expect((await b.api("GET", "/api/notes/tags")).data).toEqual([]);
            expect((await b.api("GET", `/api/notes/${draft.id}/comments`)).status).toBe(404);
        }
        // 他人の下書きの一覧は 403
        expect((await sora.api("GET", "/api/notes?author=aki&drafts=1")).status).toBe(403);

        // 本人には見える
        expect((await aki.api("GET", `/api/notes/${draft.id}`)).data.title).toBe("ひみつの下書き");
        expect(ids((await aki.api("GET", "/api/notes?author=aki&drafts=1")).data.items)).toEqual([draft.id]);
        // 公開の一覧には、本人にも出ない
        expect((await aki.api("GET", "/api/notes?author=aki")).data.items).toEqual([]);
    });

    test("下書きにはコメント・いいね・追試ができない", async () => {
        const aki = await signIn(env, "s1", "aki");
        const draft = await post(aki, { draft: true });
        expect((await aki.api("POST", `/api/notes/${draft.id}/comments`, { body: "x" })).status).toBe(403);
        expect((await aki.api("POST", `/api/notes/${draft.id}/like`)).status).toBe(403);
        expect((await aki.api("POST", "/api/notes", { kind: "experiment", title: "r", link: { kind: "replication", sourceId: draft.id } })).status).toBe(403);
    });

    test("公開すると、公開した時刻が入り、一覧に出る", async () => {
        const aki = await signIn(env, "s1", "aki");
        const draft = await post(aki, { draft: true });
        const res = await aki.api("POST", `/api/notes/${draft.id}/publish`);
        expect(res.data.draft).toBe(false);
        expect(res.data.publishedAt).not.toBeNull();
        expect(ids((await anon().api("GET", "/api/notes")).data.items)).toEqual([draft.id]);
        // PATCH の draft: false でも公開できる
        const d2 = await post(aki, { draft: true });
        expect((await aki.api("PATCH", `/api/notes/${d2.id}`, { draft: false })).data.draft).toBe(false);
    });
});

describe("一覧", () => {
    test("新しい順。種類・状態・タグ・作者・フォロー中で絞れる。カーソルでページを送る", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const e1 = await post(aki, { status: "pass", tags: ["k8s"] });
        const a1 = await post(aki, { kind: "article", title: "記事" });
        const m1 = await post(sora, { kind: "memo", title: "メモ", tags: ["k8s"] });
        const e2 = await post(sora, { status: "fail" });

        const list = async (q: string, b: Browser = anon()) => ids((await b.api("GET", `/api/notes${q}`)).data.items);
        expect(await list("")).toEqual([e2.id, m1.id, a1.id, e1.id]);
        expect(await list("?kind=experiment")).toEqual([e2.id, e1.id]);
        expect(await list("?status=pass")).toEqual([e1.id]);
        expect(await list("?tag=K8S")).toEqual([m1.id, e1.id]);
        expect(await list("?author=sora")).toEqual([e2.id, m1.id]);
        expect((await anon().api("GET", "/api/notes?author=nobody")).status).toBe(404);
        expect((await anon().api("GET", "/api/notes?kind=diary")).status).toBe(400);

        await aki.api("POST", "/api/users/sora/follow");
        expect(await list("?following=1", aki)).toEqual([e2.id, m1.id]);
        expect((await anon().api("GET", "/api/notes?following=1")).status).toBe(403);

        // 2 件ずつ
        const p1 = (await anon().api("GET", "/api/notes?limit=2")).data;
        expect(ids(p1.items)).toEqual([e2.id, m1.id]);
        const p2 = (await anon().api("GET", `/api/notes?limit=2&cursor=${p1.nextCursor}`)).data;
        expect(ids(p2.items)).toEqual([a1.id, e1.id]);
        expect(p2.nextCursor).toBeNull();
    });

    test("タグの一覧は数つき(多い順)。メンバーはハンドルのある人", async () => {
        const aki = await signIn(env, "s1", "aki");
        await post(aki, { tags: ["k8s", "raspi"] });
        await post(aki, { tags: ["k8s"] });
        expect((await anon().api("GET", "/api/notes/tags")).data).toEqual([
            { tag: "k8s", count: 2 },
            { tag: "raspi", count: 1 },
        ]);
        await signIn(env, "s2", "sora");
        const members = (await anon().api("GET", "/api/members?sort=active")).data;
        expect(members.map((m: { handle: string; noteCount: number }) => [m.handle, m.noteCount])).toEqual([
            ["aki", 2],
            ["sora", 0],
        ]);
    });

    test("プロフィールに数の欄(公開したものだけ)", async () => {
        const aki = await signIn(env, "s1", "aki");
        await post(aki, { status: "pass" });
        await post(aki, { status: "fail" });
        await post(aki, { status: "watch" });
        await post(aki, { kind: "article" });
        await post(aki, { kind: "memo", draft: true });
        expect((await anon().api("GET", "/api/users/aki")).data.counts).toEqual({ experiment: 3, pass: 1, fail: 1, watch: 1, article: 1, memo: 0 });
    });
});

describe("検索", () => {
    test("タイトルと本文から探す(大文字・小文字は問わない)。% と _ は文字として扱う", async () => {
        const aki = await signIn(env, "s1", "aki");
        const t = await post(aki, { title: "Raspberry Pi で k3s", body: "電源が足りない" });
        const b = await post(aki, { title: "別の話", body: "CPU を 100% 使う" });
        const q = async (s: string) => ids((await anon().api("GET", `/api/search?q=${encodeURIComponent(s)}`)).data.notes.items);
        expect(await q("raspberry")).toEqual([t.id]);
        expect(await q("電源")).toEqual([t.id]);
        expect(await q("100%")).toEqual([b.id]);
        expect(await q("1_0")).toEqual([]);
        expect(await q("%")).toEqual([b.id]);
        expect(await q("")).toEqual([]);
        // タグとメンバーも
        await post(aki, { tags: ["raspi"] });
        const all = (await anon().api("GET", "/api/search?q=AK")).data;
        expect(all.members.map((m: { handle: string }) => m.handle)).toEqual(["aki"]);
        expect((await anon().api("GET", "/api/search?q=rasp")).data.tags).toEqual([{ tag: "raspi", count: 1 }]);
    });
});

describe("実験の状態", () => {
    test("状態を変えると履歴が残る。WATCH にした時刻から日数を数える", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki);
        expect(n.history.map((h: { from: string | null; to: string }) => [h.from, h.to])).toEqual([[null, "watch"]]);

        await aki.api("PATCH", `/api/notes/${n.id}`, { status: "fail" });
        await aki.api("PATCH", `/api/notes/${n.id}`, { status: "fail" }); // 変わらなければ残さない
        await aki.api("PATCH", `/api/notes/${n.id}`, { title: "題だけ" }); // 状態に触れなければ残さない
        const after = (await aki.api("PATCH", `/api/notes/${n.id}`, { status: "watch" })).data;
        expect(after.history.map((h: { from: string | null; to: string }) => [h.from, h.to])).toEqual([
            [null, "watch"],
            ["watch", "fail"],
            ["fail", "watch"],
        ]);
        expect(await env.db.noteStatusHistory.count()).toBe(3);

        // 20 日前に WATCH にしたことにする
        await env.db.note.update({ where: { id: BigInt(n.id) }, data: { watchSince: new Date(Date.now() - 20 * 86_400_000) } });
        expect((await anon().api("GET", `/api/notes/${n.id}`)).data.watchDays).toBe(21);
        // WATCH でなくなれば日数は出ない
        expect((await aki.api("PATCH", `/api/notes/${n.id}`, { status: "pass" })).data.watchDays).toBeNull();
    });

    test("今週の FAIL: 直近 7 日に FAIL になって、今も FAIL のもの", async () => {
        const aki = await signIn(env, "s1", "aki");
        const recent = await post(aki, { status: "fail" });
        const old = await post(aki, { status: "fail" });
        const back = await post(aki);
        await aki.api("PATCH", `/api/notes/${back.id}`, { status: "fail" });
        await aki.api("PATCH", `/api/notes/${back.id}`, { status: "pass" });
        await env.db.noteStatusHistory.updateMany({ where: { noteId: BigInt(old.id) }, data: { changedAt: new Date(Date.now() - 8 * 86_400_000) } });
        expect(ids((await anon().api("GET", "/api/notes/fails")).data)).toEqual([recent.id]);
    });
});

describe("追試と派生", () => {
    test("追試を作ると、元の実験の追試の一覧と数に出る。結果は追試した側が持つ", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const src = await post(aki, { status: "fail" });
        const r1 = await post(sora, { status: "fail", link: { kind: "replication", sourceId: src.id } });
        const r2 = await post(aki, { status: "pass", link: { kind: "replication", sourceId: src.id } });
        await post(sora, { draft: true, link: { kind: "replication", sourceId: src.id } }); // 下書きは数えない

        expect(r1.origin).toMatchObject({ kind: "replication", note: { id: src.id, code: "EXP-001", author: { handle: "aki" } } });
        const list = (await anon().api("GET", `/api/notes/${src.id}/replications`)).data;
        expect(list.map((n: { id: string; status: string }) => [n.id, n.status])).toEqual([
            [r1.id, "fail"],
            [r2.id, "pass"],
        ]);
        expect((await anon().api("GET", `/api/notes/${src.id}`)).data.replicationCount).toBe(2);
        // 元の状態は変わらない
        expect((await anon().api("GET", `/api/notes/${src.id}`)).data.status).toBe("fail");
    });

    test("追試・派生は実験から、実験としてだけ作れる", async () => {
        const aki = await signIn(env, "s1", "aki");
        const memo = await post(aki, { kind: "memo" });
        const exp = await post(aki);
        const create = (body: NoteBody) => aki.api("POST", "/api/notes", { title: "t", ...body });
        expect((await create({ kind: "experiment", link: { kind: "replication", sourceId: memo.id } })).data.error).toBe("source_not_experiment");
        expect((await create({ kind: "memo", link: { kind: "derivation", sourceId: exp.id } })).data.error).toBe("link_only_for_experiments");
        expect((await create({ kind: "experiment", link: { kind: "fork", sourceId: exp.id } })).data.error).toBe("invalid_link");
        expect((await create({ kind: "experiment", link: { kind: "derivation", sourceId: "999999" } })).status).toBe(404);
    });

    test("系譜: 派生をたどって、祖先と子孫を返す(数段まで)", async () => {
        const aki = await signIn(env, "s1", "aki");
        const derive = (sourceId: string, title: string) => post(aki, { title, link: { kind: "derivation", sourceId } });
        // a → b → c → d → e、a → f。g は a の追試(系譜には入らない)
        const a = await post(aki, { title: "a" });
        const b = await derive(a.id, "b");
        const c = await derive(b.id, "c");
        const d = await derive(c.id, "d");
        const e = await derive(d.id, "e");
        const f = await derive(a.id, "f");
        await post(aki, { title: "g", link: { kind: "replication", sourceId: a.id } });

        type Node = { title: string; children: Node[] };
        const tree = (nodes: Node[]): unknown => nodes.map((n) => [n.title, tree(n.children)]);

        const la = (await anon().api("GET", `/api/notes/${a.id}/lineage`)).data;
        expect(la.ancestors).toEqual([]);
        expect(la.self.title).toBe("a");
        expect(tree(la.children)).toEqual([
            ["b", [["c", [["d", []]]]]],
            ["f", []],
        ]); // 3 段まで(e は入らない)

        const lc = (await anon().api("GET", `/api/notes/${c.id}/lineage`)).data;
        expect(lc.ancestors.map((n: { title: string }) => n.title)).toEqual(["a", "b"]);
        expect(tree(lc.children)).toEqual([["d", [["e", []]]]]);

        const le = (await anon().api("GET", `/api/notes/${e.id}/lineage`)).data;
        expect(le.ancestors.map((n: { title: string }) => n.title)).toEqual(["b", "c", "d"]); // 3 段まで

        // 途中が下書きになったら、そこで切れる
        await env.db.note.update({ where: { id: BigInt(b.id) }, data: { draft: true } });
        expect((await anon().api("GET", `/api/notes/${c.id}/lineage`)).data.ancestors).toEqual([]);
        expect(tree((await anon().api("GET", `/api/notes/${a.id}/lineage`)).data.children)).toEqual([["f", []]]);
        void f;
    });

    test("関係するもの: 同じタグの公開したノート", async () => {
        const aki = await signIn(env, "s1", "aki");
        const a = await post(aki, { tags: ["vue"] });
        const b = await post(aki, { tags: ["vue", "ts"] });
        await post(aki, { tags: ["go"] });
        await post(aki, { tags: ["vue"], draft: true });
        expect(ids((await anon().api("GET", `/api/notes/${a.id}/related`)).data)).toEqual([b.id]);
    });
});

describe("コメント", () => {
    test("書く・直す・消す(本人だけ)。消したら「削除されました」用の印", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const n = await post(aki);
        const c1 = (await sora.api("POST", `/api/notes/${n.id}/comments`, { body: "**いいね**" })).data;
        expect((await anon().api("POST", `/api/notes/${n.id}/comments`, { body: "x" })).status).toBe(401);
        expect((await sora.api("POST", `/api/notes/${n.id}/comments`, { body: "  " })).data.error).toBe("body_required");
        expect((await sora.api("POST", `/api/notes/${n.id}/comments`, { body: "a".repeat(2001) })).data.error).toBe("body_too_long");

        let list = (await sora.api("GET", `/api/notes/${n.id}/comments`)).data;
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({ html: "<p><strong>いいね</strong></p>\n", body: "**いいね**", deleted: false, viewer: { canEdit: true } });
        // 他人には Markdown のままの本文は返さない
        expect((await aki.api("GET", `/api/notes/${n.id}/comments`)).data[0].body).toBeUndefined();

        expect((await aki.api("PATCH", `/api/comments/${c1.id}`, { body: "書き換え" })).status).toBe(403);
        expect((await aki.api("DELETE", `/api/comments/${c1.id}`)).status).toBe(403);
        expect((await sora.api("PATCH", `/api/comments/${c1.id}`, { body: "直した" })).status).toBe(200);
        expect((await anon().api("GET", `/api/notes/${n.id}/comments`)).data[0].html).toBe("<p>直した</p>\n");

        expect((await sora.api("DELETE", `/api/comments/${c1.id}`)).status).toBe(200);
        list = (await anon().api("GET", `/api/notes/${n.id}/comments`)).data;
        expect(list[0]).toMatchObject({ deleted: true, html: null });
        expect((await env.db.comment.findFirst())!.body).toBe(""); // 中身は残さない
        expect((await sora.api("PATCH", `/api/comments/${c1.id}`, { body: "生き返り" })).status).toBe(404);
        // 一覧の数には入れない
        expect((await anon().api("GET", `/api/notes/${n.id}`)).data.commentCount).toBe(0);
    });
});

describe("いいね", () => {
    test("付ける・外す。数を返す。2 回押しても 1 つ", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const n = await post(aki);
        expect((await sora.api("POST", `/api/notes/${n.id}/like`)).data).toEqual({ liked: true, likes: 1 });
        expect((await sora.api("POST", `/api/notes/${n.id}/like`)).data).toEqual({ liked: true, likes: 1 });
        expect((await aki.api("POST", `/api/notes/${n.id}/like`)).data).toEqual({ liked: true, likes: 2 });
        expect((await sora.api("GET", `/api/notes/${n.id}`)).data.viewer.liked).toBe(true);
        expect((await sora.api("DELETE", `/api/notes/${n.id}/like`)).data).toEqual({ liked: false, likes: 1 });
        expect((await anon().api("POST", `/api/notes/${n.id}/like`)).status).toBe(401);
    });
});

describe("ブロックの効き方", () => {
    /** aki(blocker)が sora(blocked)をブロックしている */
    async function blocked() {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const riku = await signIn(env, "s3", "riku");
        const akiNote = await post(aki, { title: "aki の実験", tags: ["shared"] });
        const soraNote = await post(sora, { title: "sora の実験", tags: ["shared"] });
        // ブロックの前に、sora が aki のノートにコメントと追試をしていた
        await sora.api("POST", `/api/notes/${akiNote.id}/comments`, { body: "前のコメント" });
        await riku.api("POST", `/api/notes/${akiNote.id}/comments`, { body: "riku のコメント" });
        const rep = await post(sora, { title: "sora の追試", link: { kind: "replication", sourceId: akiNote.id } });
        const der = await post(sora, { title: "sora の派生", link: { kind: "derivation", sourceId: akiNote.id } });
        expect((await aki.api("POST", "/api/users/sora/block")).status).toBe(200);
        return { aki, sora, riku, akiNote, soraNote, rep, der };
    }

    test("blocked は、blocker のノートにコメント・追試・いいね・派生ができない", async () => {
        const { sora, akiNote } = await blocked();
        const no = { error: "cannot_interact" };
        expect(await sora.api("POST", `/api/notes/${akiNote.id}/comments`, { body: "x" })).toEqual({ status: 403, data: no });
        expect(await sora.api("POST", `/api/notes/${akiNote.id}/like`)).toEqual({ status: 403, data: no });
        for (const kind of ["replication", "derivation"]) {
            expect(await sora.api("POST", "/api/notes", { kind: "experiment", title: "t", link: { kind, sourceId: akiNote.id } })).toEqual({ status: 403, data: no });
        }
        expect((await sora.api("GET", `/api/notes/${akiNote.id}`)).data.viewer.canInteract).toBe(false);
    });

    test("逆向き(blocker から blocked のノート)にもできない", async () => {
        const { aki, soraNote } = await blocked();
        expect((await aki.api("POST", `/api/notes/${soraNote.id}/comments`, { body: "x" })).status).toBe(403);
        expect((await aki.api("POST", `/api/notes/${soraNote.id}/like`)).status).toBe(403);
    });

    test("blocker の画面から、blocked のノートとコメントが外れる(一覧・検索・タグ・コメント欄・追試の一覧・系譜)", async () => {
        const { aki, riku, akiNote, soraNote, rep } = await blocked();
        const titles = (items: { title: string }[]) => items.map((n) => n.title).sort();

        expect(titles((await aki.api("GET", "/api/notes")).data.items)).toEqual(["aki の実験"]);
        expect((await aki.api("GET", "/api/notes?author=sora")).data.items).toEqual([]);
        expect((await aki.api("GET", "/api/search?q=sora")).data.notes.items).toEqual([]);
        expect((await aki.api("GET", "/api/notes/tags")).data).toEqual([{ tag: "shared", count: 1 }]);
        expect((await aki.api("GET", `/api/notes/${akiNote.id}/comments`)).data.map((c: { author: { handle: string } }) => c.author.handle)).toEqual(["riku"]);
        expect((await aki.api("GET", `/api/notes/${akiNote.id}/replications`)).data).toEqual([]);
        expect((await aki.api("GET", `/api/notes/${akiNote.id}/lineage`)).data.children).toEqual([]);

        // ほかの人(riku)とログインしていない人には、全部見える
        for (const b of [riku, anon()]) {
            expect(titles((await b.api("GET", "/api/notes")).data.items)).toEqual(["aki の実験", "sora の実験", "sora の派生", "sora の追試"]);
            expect((await b.api("GET", `/api/notes/${akiNote.id}/comments`)).data).toHaveLength(2);
            expect(ids((await b.api("GET", `/api/notes/${akiNote.id}/replications`)).data)).toEqual([rep.id]);
        }
        // ノート自体は公開のまま。blocker も URL を開けば読める
        expect((await aki.api("GET", `/api/notes/${soraNote.id}`)).status).toBe(200);
        expect((await anon().api("GET", `/api/notes/${soraNote.id}`)).status).toBe(200);
    });

    test("ブロックを外すと、元に戻る", async () => {
        const { aki, sora, akiNote } = await blocked();
        await aki.api("DELETE", "/api/users/sora/block");
        expect((await sora.api("POST", `/api/notes/${akiNote.id}/like`)).status).toBe(200);
        expect((await aki.api("GET", "/api/notes")).data.items).toHaveLength(4);
    });
});

describe("moderator の非表示", () => {
    test("member は隠せない。moderator は理由を付けて隠す・戻す", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const mod = await signIn(env, "s3", "kuma", "役員");
        const n = await post(aki, { title: "隠される" });

        expect((await sora.api("POST", `/api/notes/${n.id}/hide`, { reason: "x" })).status).toBe(403);
        expect((await anon().api("POST", `/api/notes/${n.id}/hide`, { reason: "x" })).status).toBe(401);
        expect((await mod.api("POST", `/api/notes/${n.id}/hide`, {})).data.error).toBe("reason_required");
        expect((await mod.api("POST", `/api/notes/${n.id}/hide`, { reason: "ガイドラインに反する" })).data).toEqual({ hidden: true });

        // ほかの人には 404 の hidden。一覧からも外れる
        expect(await sora.api("GET", `/api/notes/${n.id}`)).toEqual({ status: 404, data: { error: "hidden" } });
        expect((await anon().api("GET", "/api/notes")).data.items).toEqual([]);
        expect((await sora.api("POST", `/api/notes/${n.id}/like`)).status).toBe(404);
        // 作者と moderator には見える(理由つき)。作者の一覧には印つきで出る
        expect((await aki.api("GET", `/api/notes/${n.id}`)).data).toMatchObject({ hidden: true, hiddenReason: "ガイドラインに反する" });
        expect((await mod.api("GET", `/api/notes/${n.id}`)).data).toMatchObject({ hidden: true, viewer: { canModerate: true, canInteract: false } });
        expect((await aki.api("GET", "/api/notes?author=aki")).data.items[0].hidden).toBe(true);
        // 消してはいない
        expect(await env.db.note.count()).toBe(1);

        expect((await mod.api("DELETE", `/api/notes/${n.id}/hide`)).data).toEqual({ hidden: false });
        expect((await sora.api("GET", `/api/notes/${n.id}`)).status).toBe(200);
    });

    test("コメントを隠すと、ほかの人には中身が出ない(moderator と本人には出る)", async () => {
        const aki = await signIn(env, "s1", "aki");
        const sora = await signIn(env, "s2", "sora");
        const admin = await signIn(env, "s3", "boss", "管理者");
        const n = await post(aki);
        const c1 = (await sora.api("POST", `/api/notes/${n.id}/comments`, { body: "ひどいこと" })).data;

        expect((await aki.api("POST", `/api/comments/${c1.id}/hide`, { reason: "x" })).status).toBe(403);
        // admin は moderator の分もできる
        expect((await admin.api("POST", `/api/comments/${c1.id}/hide`, { reason: "攻撃的" })).status).toBe(200);

        expect((await aki.api("GET", `/api/notes/${n.id}/comments`)).data[0]).toMatchObject({ hidden: true, html: null });
        expect((await aki.api("GET", `/api/notes/${n.id}/comments`)).data[0].hiddenReason).toBeUndefined();
        expect((await admin.api("GET", `/api/notes/${n.id}/comments`)).data[0]).toMatchObject({ hidden: true, html: "<p>ひどいこと</p>\n", hiddenReason: "攻撃的" });
        expect((await sora.api("GET", `/api/notes/${n.id}/comments`)).data[0]).toMatchObject({ hidden: true, viewer: { canEdit: false } });
        // 隠されたものは直せない
        expect((await sora.api("PATCH", `/api/comments/${c1.id}`, { body: "言い換え" })).status).toBe(403);

        expect((await admin.api("DELETE", `/api/comments/${c1.id}/hide`)).status).toBe(200);
        expect((await aki.api("GET", `/api/notes/${n.id}/comments`)).data[0].html).toBe("<p>ひどいこと</p>\n");
    });
});

describe("admin の凍結", () => {
    test("moderator はできない。admin は凍結・解除できる。凍結するとすぐログアウトする", async () => {
        const aki = await signIn(env, "s1", "aki");
        const mod = await signIn(env, "s2", "kuma", "役員");
        const admin = await signIn(env, "s3", "boss", "管理者");

        expect((await mod.api("POST", "/api/admin/users/aki/suspend")).status).toBe(403);
        expect((await aki.api("POST", "/api/admin/users/aki/suspend")).status).toBe(403);
        expect((await admin.api("POST", "/api/admin/users/boss/suspend")).data).toEqual({ error: "self" });
        expect((await admin.api("POST", "/api/admin/users/nobody/suspend")).status).toBe(404);

        expect((await admin.api("POST", "/api/admin/users/aki/suspend")).data).toEqual({ suspended: true });
        expect((await aki.api("GET", "/api/me")).data).toBeNull();
        expect((await aki.api("POST", "/api/notes", { kind: "memo", title: "x" })).status).toBe(401);
        // もう一度ログインしようとしても入れない
        env.fake!.state.user = { sub: "s1", name: "aki さん", roles: "一般" };
        const again = new Browser(env);
        expect(await again.login("/")).toContain("/login/error");
        // メンバーの一覧から外れる
        expect((await anon().api("GET", "/api/members")).data.map((m: { handle: string }) => m.handle)).toEqual(["boss", "kuma"]);

        expect((await admin.api("DELETE", "/api/admin/users/aki/suspend")).data).toEqual({ suspended: false });
        const back = new Browser(env);
        await back.login("/");
        expect((await back.api("GET", "/api/me")).data.handle).toBe("aki");
    });
});

describe("Markdown の安全", () => {
    const evil = [
        "<script>alert(1)</script>",
        '<img src=x onerror="alert(1)">',
        "[a](javascript:alert(1))",
        "[b](JaVaScRiPt:alert(1))",
        "[c](java\tscript:alert(1))",
        "[d](data:text/html;base64,PHNjcmlwdD4=)",
        "[e](vbscript:msgbox(1))",
        "![f](javascript:alert(1))",
        "<a href=\"https://x.example\">raw</a>",
        "[外](https://example.com/) [中](/@aki) [メール](mailto:a@example.com)",
    ].join("\n\n");

    function expectSafe(html: string) {
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<img src=\"x\"");
        expect(html).not.toMatch(/href="\s*(javascript|vbscript|data):/i);
        expect(html).not.toMatch(/src="\s*javascript:/i);
        expect(html).not.toContain("<a href=\"https://x.example\">");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain('<a href="https://example.com/" rel="noopener noreferrer ugc">外</a>');
        expect(html).toContain('<a href="/@aki">中</a>');
        expect(html).toContain('<a href="mailto:a@example.com">メール</a>');
    }

    test("ノートの本文", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki, { body: evil });
        expectSafe(n.html);
        expectSafe((await aki.api("POST", "/api/notes/preview", { body: evil })).data.html);
    });

    test("コメント", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki);
        await aki.api("POST", `/api/notes/${n.id}/comments`, { body: evil });
        expectSafe((await anon().api("GET", `/api/notes/${n.id}/comments`)).data[0].html);
    });

    test("コードは shiki で色が付く", async () => {
        const aki = await signIn(env, "s1", "aki");
        const n = await post(aki, { body: "```ts\nconst a = 1;\n```" });
        expect(n.html).toContain('class="shiki github-dark"');
    });
});

describe("プロフィールの設定", () => {
    test("表示名と自己紹介を変えられる。長さの上限がある", async () => {
        const aki = await signIn(env, "s1", "aki");
        expect((await aki.api("PATCH", "/api/me/profile", { displayName: "  あき\n ", bio: "おうち k8s" })).data).toEqual({
            handle: "aki",
            displayName: "あき",
            bio: "おうち k8s",
            avatar: null,
        });
        expect((await aki.api("PATCH", "/api/me/profile", { displayName: "" })).data.error).toBe("display_name_required");
        expect((await aki.api("PATCH", "/api/me/profile", { displayName: "あ".repeat(51) })).data.error).toBe("display_name_too_long");
        expect((await aki.api("PATCH", "/api/me/profile", { bio: "あ".repeat(301) })).data.error).toBe("bio_too_long");
        expect((await aki.api("PATCH", "/api/me/profile", { displayName: "あ".repeat(50), bio: "あ".repeat(300) })).status).toBe(200);
        expect((await anon().api("PATCH", "/api/me/profile", { bio: "x" })).status).toBe(401);
        expect((await anon().api("GET", "/api/users/aki")).data.displayName).toBe("あ".repeat(50));
    });
});

describe("アイコン画像", () => {
    // いちばん小さい WebP(1x1)と PNG(1x1)
    const webp = Uint8Array.from(atob("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA="), (ch) => ch.charCodeAt(0));
    const png = Uint8Array.from(
        atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
        (ch) => ch.charCodeAt(0),
    );

    const upload = (b: Browser, body: Uint8Array | string, type = "image/webp") =>
        b.fetch("/api/me/avatar", { method: "PUT", headers: { "content-type": type }, body: body as BodyInit });

    test("WebP と PNG を受ける。ハッシュ付きの URL で、nosniff と長いキャッシュで配る", async () => {
        const aki = await signIn(env, "s1", "aki");
        const res = await upload(aki, webp);
        expect(res.status).toBe(200);
        const { avatar } = (await res.json()) as { avatar: string };
        expect(avatar).toMatch(/^\/api\/users\/aki\/avatar\?v=[0-9a-f]{16}$/);
        expect((await aki.api("GET", "/api/me")).data.avatar).toBe(avatar);
        expect((await anon().api("GET", "/api/users/aki")).data.avatar).toBe(avatar);

        const img = await anon().fetch(avatar);
        expect(img.status).toBe(200);
        expect(img.headers.get("content-type")).toBe("image/webp");
        expect(img.headers.get("x-content-type-options")).toBe("nosniff");
        expect(img.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(new Uint8Array(await img.arrayBuffer())).toEqual(webp);
        // v が古い・ないときはキャッシュさせない
        expect((await anon().fetch("/api/users/aki/avatar")).headers.get("cache-control")).toBe("no-cache");

        // PNG に変えると URL も変わる。宣言された Content-Type ではなく中身で決める
        const res2 = await upload(aki, png, "image/webp");
        const { avatar: next } = (await res2.json()) as { avatar: string };
        expect(next).not.toBe(avatar);
        expect((await anon().fetch(next)).headers.get("content-type")).toBe("image/png");

        // 消すと頭文字に戻る
        expect((await aki.api("DELETE", "/api/me/avatar")).data).toEqual({ avatar: null });
        expect((await anon().fetch("/api/users/aki/avatar")).status).toBe(404);
    });

    test("大きすぎるものは 413", async () => {
        const aki = await signIn(env, "s1", "aki");
        const big = new Uint8Array(256 * 1024 + 1);
        big.set(webp);
        expect((await upload(aki, big)).status).toBe(413);
        // ちょうど 256KB は通る
        const max = new Uint8Array(256 * 1024);
        max.set(webp);
        expect((await upload(aki, max)).status).toBe(200);
    });

    test("画像でないものは 415(Content-Type や拡張子だけ画像にしたものも)", async () => {
        const aki = await signIn(env, "s1", "aki");
        for (const [body, type] of [
            ["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml"],
            ["<html><script>alert(1)</script></html>", "image/png"],
            ["GIF89a........", "image/gif"],
            ["RIFF\0\0\0\0WAVEfmt ", "image/webp"],
            ["", "image/png"],
        ] as const) {
            const res = await upload(aki, body, type);
            expect([400, 415]).toContain(res.status);
        }
        // 先頭だけ PNG に見せかけても、PNG のシグネチャ 8 バイトがそろわなければ通さない
        expect((await upload(aki, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x20, 0x20]), "image/png")).status).toBe(415);
        expect((await aki.api("GET", "/api/me")).data.avatar).toBeNull();
        expect((await anon().fetch("/api/me/avatar", { method: "PUT", body: png as BodyInit })).status).toBe(401);
    });
});

describe("連打の制限", () => {
    test("ノートとコメントは、決めた数を超えると 429", async () => {
        const limited = await createTestEnv({
            rateLimits: { note: { windowMs: 60_000, limit: 2 }, comment: { windowMs: 60_000, limit: 2 } },
        });
        try {
            const aki = await signIn(limited, "s1", "aki");
            const make = () => aki.api("POST", "/api/notes", { kind: "memo", title: "m", draft: false });
            const first = await make();
            expect(first.status).toBe(200);
            expect((await make()).status).toBe(200);
            expect((await make()).status).toBe(429);
            const comment = () => aki.api("POST", `/api/notes/${first.data.id}/comments`, { body: "c" });
            expect((await comment()).status).toBe(200);
            expect((await comment()).status).toBe(200);
            expect((await comment()).status).toBe(429);
            // 別の人は別に数える
            const sora = await signIn(limited, "s2", "sora");
            expect((await sora.api("POST", "/api/notes", { kind: "memo", title: "m" })).status).toBe(200);
        } finally {
            await limited.close();
        }
    });
});

describe("小さな関数", () => {
    test("codeOf と parseCode", () => {
        expect(codeOf("experiment", 6)).toBe("EXP-006");
        expect(codeOf("memo", 1234)).toBe("MEMO-1234");
        expect(parseCode("post-002")).toEqual({ kind: "article", number: 2 });
        expect(parseCode("EXP-0")).toBeNull();
        expect(parseCode("NOTE-1")).toBeNull();
    });

    test("normalizeTags", () => {
        expect(normalizeTags(["#Vue", "vue", "ＴＳ", "c++", "日本語"])).toEqual(["vue", "ts", "c++", "日本語"]);
        expect(normalizeTags(["a/b"])).toBe("invalid_tag");
        expect(normalizeTags(["a".repeat(33)])).toBe("invalid_tag");
        expect(normalizeTags("vue")).toBe("invalid_tag");
    });

    test("watchDays: WATCH にした日が 1 日目", () => {
        const now = new Date("2026-11-16T12:00:00Z");
        expect(watchDays(new Date("2026-11-16T00:00:00Z"), now)).toBe(1);
        expect(watchDays(new Date("2026-11-14T12:00:00Z"), now)).toBe(3);
        expect(watchDays(null, now)).toBeNull();
    });
});
