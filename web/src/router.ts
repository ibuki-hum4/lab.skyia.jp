import { createRouter, createWebHistory } from "vue-router";
import { loadMe, useMe } from "./composables/useMe";

const NotYet = () => import("./views/NotYetView.vue");

// ページは `() => import(...)` で書いて、開いたときに読み込む(最初の読み込みを軽くする)
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
        { path: "/posts/:slug", name: "post", component: () => import("./views/PostView.vue"), props: true },
        { path: "/tags/:tag", name: "tag", component: () => import("./views/TagView.vue"), props: true },
        { path: "/about", name: "about", component: () => import("./views/AboutView.vue") },
        { path: "/welcome", name: "welcome", component: () => import("./views/WelcomeView.vue") },
        { path: "/login/error", name: "login-error", component: () => import("./views/LoginErrorView.vue") },
        { path: "/@:handle", name: "user", component: () => import("./views/UserView.vue"), props: true },
        // 部品の確認用(リンクは張っていない)
        { path: "/_components", name: "components", component: () => import("./views/ComponentsView.vue") },
        // ナビから行ける、次の PR で作るページ
        { path: "/new", name: "new", component: NotYet, props: { page: "新規作成" } },
        { path: "/following", name: "following", component: NotYet, props: { page: "フォロー中" } },
        { path: "/tags", name: "tags", component: NotYet, props: { page: "タグ" } },
        { path: "/members", name: "members", component: NotYet, props: { page: "メンバー" } },
        { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("./views/NotFoundView.vue") },
    ],
    // ページを移ったら一番上へ。#見出し があればそこへ(目次から飛ぶとき)
    scrollBehavior(to) {
        if (to.hash) return { el: decodeURIComponent(to.hash), behavior: "smooth" };
        return { top: 0 };
    },
});

// ログインしたのにハンドルを決めていない人は、/welcome へ(ログインのあとは server がすでに送っている)
router.beforeEach(async (to) => {
    await loadMe();
    const { me } = useMe();
    if (me.value && !me.value.handle && to.name !== "welcome" && to.name !== "login-error" && to.name !== "about") {
        return { name: "welcome", query: { next: to.fullPath } };
    }
});
