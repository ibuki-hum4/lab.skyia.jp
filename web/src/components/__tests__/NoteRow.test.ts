import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import type { NoteSummary } from "../../api";
import NoteRow from "../NoteRow.vue";

const base: NoteSummary = {
    id: "1",
    code: "EXP-006",
    kind: "experiment",
    number: 6,
    title: "app.fetch を同期で返せば速くなるか",
    status: "watch",
    author: { handle: "yahari", displayName: "やーはり", avatar: null },
    excerpt: "Promise に包むのをやめても、差は見えなかった。",
    draft: false,
    tags: ["senri", "bench"],
    likeCount: 4,
    commentCount: 3,
    replicationCount: 0,
    watchDays: 1,
    createdAt: "2026-11-15T01:00:00Z",
    updatedAt: "2026-11-15T01:00:00Z",
    publishedAt: "2026-11-15T01:00:00Z",
    origin: null,
    hidden: false,
};

const render = (note: Partial<NoteSummary>, variant: "feed" | "notebook" = "feed") =>
    mount(NoteRow, { props: { note: { ...base, ...note }, variant }, global: { stubs: { RouterLink: RouterLinkStub } } });

describe("NoteRow", () => {
    test("WATCH は「観察 ◯ 日目」。14 日までは薄くしない", () => {
        const w = render({ watchDays: 14 });
        expect(w.get("[data-testid=stamp-day]").text()).toBe("観察 14 日目");
        expect(w.get("[data-testid=stamp]").classes()).not.toContain("opacity-45");
    });

    test("WATCH が 14 日を超えたら薄くし、「そろそろ結果を」と出す", () => {
        const w = render({ watchDays: 19 });
        expect(w.get("[data-testid=stamp-day]").text()).toContain("観察 19 日目");
        expect(w.get("[data-testid=stamp-day]").text()).toContain("そろそろ結果を");
        expect(w.get("[data-testid=stamp]").classes()).toContain("opacity-45");
    });

    test("PASS と FAIL には日数を出さない", () => {
        const w = render({ status: "fail", watchDays: null });
        expect(w.get("[data-testid=stamp]").text()).toBe("FAIL");
        expect(w.find("[data-testid=stamp-day]").exists()).toBe(false);
    });

    test("追試があれば、数のチップを出す", () => {
        expect(render({ replicationCount: 0 }).find("[data-testid=replication-chip]").exists()).toBe(false);
        expect(render({ replicationCount: 2 }).get("[data-testid=replication-chip]").text()).toBe("追試 2");
    });

    test("リンクは /@ハンドル/コード", () => {
        const links = render({}).findAllComponents(RouterLinkStub).map((l) => l.props("to"));
        expect(links).toContain("/@yahari/EXP-006");
        expect(links).toContain("/tags/senri");
    });

    test("メモは付箋で出す。下書きは点線の印", () => {
        const memo = render({ kind: "memo", status: null, watchDays: null, code: "MEMO-003" });
        expect(memo.find("article").exists()).toBe(false);
        expect(memo.text()).toContain("MEMO");
        const draft = render({ draft: true }, "notebook");
        expect(draft.get("[data-testid=stamp-draft]").text()).toBe("下書き");
        expect(draft.text()).toContain("EXP-006");
    });
});
