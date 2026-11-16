import { createRouter, createWebHistory } from "vue-router";
import { loginUrl } from "./api";
import { loadMe, useMe } from "./composables/useMe";

declare module "vue-router" {
    interface RouteMeta {
        /** ログインが要るページ。ログイン前ならログインへ送る */
        auth?: boolean;
        /** サイトのヘッダーとフッターを出さない(エディタは自分の上の帯を持つ) */
        bare?: boolean;
    }
}

const Editor = () => import("./views/EditorView.vue");

// ページは `() => import(...)` で書いて、開いたときに読み込む(最初の読み込みを軽くする)
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", name: "home", component: () => import("./views/HomeView.vue"), props: { feed: "new" } },
        { path: "/following", name: "following", component: () => import("./views/HomeView.vue"), props: { feed: "following" } },
        { path: "/new", name: "new", component: Editor, meta: { auth: true, bare: true } },
        { path: "/@:handle/:code/edit", name: "edit", component: Editor, props: true, meta: { auth: true, bare: true } },
        { path: "/@:handle/:code", name: "note", component: () => import("./views/NoteView.vue"), props: true },
        { path: "/@:handle", name: "user", component: () => import("./views/UserView.vue"), props: true },
        { path: "/tags", name: "tags", component: () => import("./views/TagsView.vue") },
        { path: "/tags/:tag", name: "tag", component: () => import("./views/TagView.vue"), props: true },
        { path: "/search", name: "search", component: () => import("./views/SearchView.vue") },
        { path: "/members", name: "members", component: () => import("./views/MembersView.vue") },
        { path: "/settings/profile", name: "settings-profile", component: () => import("./views/SettingsProfileView.vue"), meta: { auth: true } },
        // content/ の記事(以前の記事)
        { path: "/posts/:slug", name: "post", component: () => import("./views/PostView.vue"), props: true },
        { path: "/about", name: "about", component: () => import("./views/AboutView.vue") },
        { path: "/welcome", name: "welcome", component: () => import("./views/WelcomeView.vue") },
        { path: "/login/error", name: "login-error", component: () => import("./views/LoginErrorView.vue") },
        // 部品の確認用(リンクは張っていない)
        { path: "/_components", name: "components", component: () => import("./views/ComponentsView.vue") },
        { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("./views/NotFoundView.vue") },
    ],
    // ページを移ったら一番上へ。#見出し があればそこへ(目次から飛ぶとき)
    scrollBehavior(to, from) {
        if (to.hash) return { el: decodeURIComponent(to.hash), behavior: "smooth" };
        // タブの切り替え(?kind= など、同じページの中)では動かさない
        if (to.path === from.path) return false;
        return { top: 0 };
    },
});

router.beforeEach(async (to) => {
    await loadMe();
    const { me } = useMe();
    // ログインが要るページ
    if (to.meta.auth && !me.value) {
        window.location.assign(loginUrl(to.fullPath));
        return false;
    }
    // ログインしたのにハンドルを決めていない人は、/welcome へ(ログインのあとは server がすでに送っている)
    if (me.value && !me.value.handle && to.name !== "welcome" && to.name !== "login-error" && to.name !== "about") {
        return { name: "welcome", query: { next: to.fullPath } };
    }
});
