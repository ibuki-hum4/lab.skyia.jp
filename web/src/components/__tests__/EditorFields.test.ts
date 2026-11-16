import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { ref } from "vue";
import type { NoteKind, NoteStatus } from "../../api";
import EditorFields from "../EditorFields.vue";

/** v-model を本物の ref につないで組み立てる */
function setup(initial: NoteKind = "experiment", opts: { kindLocked?: boolean; watchDays?: number | null } = {}) {
    const title = ref("t");
    const kind = ref<NoteKind>(initial);
    const status = ref<NoteStatus>("watch");
    const tags = ref<string[]>([]);
    const w = mount(EditorFields, {
        props: {
            ...opts,
            title: title.value,
            "onUpdate:title": (v: string) => (title.value = v),
            kind: kind.value,
            "onUpdate:kind": async (v: NoteKind) => {
                kind.value = v;
                await w.setProps({ kind: v });
            },
            status: status.value,
            "onUpdate:status": async (v: NoteStatus) => {
                status.value = v;
                await w.setProps({ status: v });
            },
            tags: tags.value,
            "onUpdate:tags": (v: string[]) => (tags.value = v),
        },
    });
    return { w, kind, status };
}

describe("EditorFields", () => {
    test("種類を変えると、状態の欄が出たり消えたりする", async () => {
        const { w, kind } = setup("experiment");
        expect(w.find("[data-testid=status-field]").exists()).toBe(true);

        await w.get("[data-testid=kind-article]").setValue(true);
        expect(kind.value).toBe("article");
        expect(w.find("[data-testid=status-field]").exists()).toBe(false);

        await w.get("[data-testid=kind-memo]").setValue(true);
        expect(w.find("[data-testid=status-field]").exists()).toBe(false);

        await w.get("[data-testid=kind-experiment]").setValue(true);
        expect(w.find("[data-testid=status-field]").exists()).toBe(true);
    });

    test("スタンプのプレビューは、種類と状態に合わせて変わる", async () => {
        const { w } = setup("experiment");
        const preview = () => w.get("[data-testid=stamp-preview]").text();
        expect(preview()).toContain("WATCH");
        expect(preview()).toContain("観察 1 日目");

        await w.get("[data-testid=status-fail]").setValue(true);
        expect(preview()).toContain("FAIL");
        expect(preview()).not.toContain("観察");

        await w.get("[data-testid=kind-memo]").setValue(true);
        expect(preview()).toContain("メモ");
    });

    test("編集のときは種類を変えられない", () => {
        const { w } = setup("memo", { kindLocked: true });
        expect(w.get("[data-testid=kind-experiment]").attributes("disabled")).toBeDefined();
        expect(w.text()).toContain("あとから変えられません");
    });

    test("WATCH の日数を渡すと、プレビューにも出る(14 日を超えたら薄く)", () => {
        const { w } = setup("experiment", { watchDays: 20 });
        expect(w.get("[data-testid=stamp-day]").text()).toContain("観察 20 日目");
        expect(w.get("[data-testid=stamp-day]").text()).toContain("そろそろ結果を");
        expect(w.get("[data-testid=stamp]").classes()).toContain("opacity-45");
    });
});
