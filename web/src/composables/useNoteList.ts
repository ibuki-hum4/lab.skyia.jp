// ノートの一覧(GET /api/notes)を読む。条件が変われば最初から読み直し、「もっと見る」で続きを読む。
import { ref, watch, type Ref } from "vue";
import { api, type NoteSummary } from "../api";

export type NoteQuery = {
    kind?: string;
    status?: string;
    tag?: string;
    author?: string;
    following?: "1";
    drafts?: "1";
    q?: string;
    limit?: string;
};

export function useNoteList(query: () => NoteQuery | null, opts: { enabled?: Ref<boolean> } = {}) {
    const items = ref<NoteSummary[]>([]);
    const nextCursor = ref<string | null>(null);
    const state = ref<"loading" | "ok" | "error">("loading");
    const loadingMore = ref(false);
    /** 古い読み込みの結果で上書きしないための番号 */
    let seq = 0;

    async function fetchPage(cursor: string | null) {
        const q = query();
        if (!q) return null;
        const clean = Object.fromEntries(Object.entries({ ...q, cursor: cursor ?? undefined }).filter(([, v]) => v !== undefined && v !== ""));
        return api("GET /api/notes", { query: clean });
    }

    async function reload() {
        const mine = ++seq;
        // 読み直しのあいだは前の中身を出しておく(最初だけ「読み込み中」)
        if (items.value.length === 0) state.value = "loading";
        const res = await fetchPage(null);
        if (mine !== seq || !res) return;
        if (res.ok) {
            items.value = res.data.items;
            nextCursor.value = res.data.nextCursor;
            state.value = "ok";
        } else {
            items.value = [];
            nextCursor.value = null;
            state.value = "error";
        }
    }

    async function loadMore() {
        if (!nextCursor.value || loadingMore.value) return;
        const mine = seq;
        loadingMore.value = true;
        try {
            const res = await fetchPage(nextCursor.value);
            if (mine !== seq || !res?.ok) return;
            items.value = [...items.value, ...res.data.items];
            nextCursor.value = res.data.nextCursor;
        } finally {
            loadingMore.value = false;
        }
    }

    watch(
        [query, () => opts.enabled?.value ?? true],
        ([, enabled]) => {
            if (enabled) void reload();
        },
        { immediate: true, deep: true },
    );

    return { items, nextCursor, state, loadingMore, loadMore, reload };
}
