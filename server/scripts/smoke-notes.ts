// CI の起動確認(image.yml)。立ち上げたアプリに、ニセの HoshID(interactive)でログインして、
// ハンドルを決め、ノートを作って、1 件・一覧で読めることを確かめる。
//   bun server/scripts/smoke-notes.ts http://127.0.0.1:3927
const base = (process.argv[2] ?? "http://127.0.0.1:3927").replace(/\/$/, "");
const cookies = new Map<string, string>();

function fail(message: string): never {
    console.error(`::error::${message}`);
    process.exit(1);
}

async function call(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (url.startsWith(base)) {
        headers.set("sec-fetch-site", "same-origin");
        headers.set("origin", base);
        if (cookies.size > 0) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await fetch(url, { ...init, headers, redirect: "manual" });
    if (url.startsWith(base)) {
        for (const line of res.headers.getSetCookie()) {
            const [pair] = line.split(";");
            const i = pair!.indexOf("=");
            cookies.set(pair!.slice(0, i).trim(), pair!.slice(i + 1).trim());
        }
    }
    return res;
}

// ログイン: /auth/login → HoshID(ユーザーを選ぶ)→ /auth/callback → /auth/after
const start = await call(`${base}/auth/login?next=/`);
const authorize = new URL(start.headers.get("location") ?? fail("/auth/login がリダイレクトしません"));
for (const [k, v] of Object.entries({ pick: "ci-smoke", name: "CI", nickname: "ci_smoke", roles: "一般" })) authorize.searchParams.set(k, v);
const granted = await fetch(authorize, { redirect: "manual" });
let loc: string | null = granted.headers.get("location") ?? fail("HoshID がコールバックへ戻しません");
// アプリの /auth/ の下だけリダイレクトを追う(/welcome などの画面には行かない)
for (let i = 0; i < 5 && loc; i++) {
    const url = new URL(loc, base);
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith("/auth/")) break;
    loc = (await call(url.toString())).headers.get("location");
}

const json = async (method: string, path: string, body?: unknown) => {
    const res = await call(`${base}${path}`, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
};

const me = await json("GET", "/api/me");
if (!me.data) fail(`ログインできませんでした: ${JSON.stringify(me)}`);
if (!me.data.handle) {
    const h = await json("POST", "/api/me/handle", { handle: "ci_smoke" });
    if (h.status !== 200) fail(`ハンドルを決められません: ${JSON.stringify(h)}`);
}

const created = await json("POST", "/api/notes", {
    kind: "experiment",
    title: "起動の確認",
    body: "## 目的\n\nノートが作れて読めること。`<script>` は文字のまま。",
    tags: ["ci"],
    status: "pass",
    draft: false,
});
if (created.status !== 200) fail(`ノートを作れません: ${JSON.stringify(created)}`);
const code = String(created.data!.code);

const shown = await json("GET", `/api/users/ci_smoke/notes/${code}`);
if (shown.status !== 200 || shown.data!.title !== "起動の確認") fail(`ノートを読めません: ${JSON.stringify(shown)}`);
if (String(shown.data!.html).includes("<script>")) fail("生の HTML が通っています");

const list = await (await fetch(`${base}/api/notes?tag=ci`)).json() as { items: { code: string }[] };
if (!list.items.some((n) => n.code === code)) fail("一覧に出ません");

console.log(`ok: ${code} を作って読めました`);
