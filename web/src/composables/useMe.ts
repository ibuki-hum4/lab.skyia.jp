// ログイン状態。/api/me を 1 回だけ読んで、どの画面からも同じものを見る。
import { computed, readonly, ref } from "vue";
import { api, type Me } from "../api";

const me = ref<Me | null>(null);
/** 読み終わったら true(それまでは、ログイン前かどうか分からない) */
const loaded = ref(false);
let pending: Promise<void> | null = null;

async function refresh() {
    const res = await api("GET /api/me");
    me.value = res.ok ? res.data : null;
    loaded.value = true;
}

/** 最初の 1 回の読み込みを待つ(ルーターのガードで使う) */
export function loadMe() {
    pending ??= refresh().catch(() => {
        loaded.value = true;
    });
    return pending;
}

export function useMe() {
    void loadMe();
    return {
        me: readonly(me),
        loaded: readonly(loaded),
        loggedIn: computed(() => me.value !== null),
        /** ハンドルを決めたあとなどに読み直す */
        refresh: () => (pending = refresh()),
    };
}
