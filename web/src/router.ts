import { createRouter, createWebHistory } from "vue-router";

// ページは `() => import(...)` で書いて、開いたときに読み込む(最初の読み込みを軽くする)
export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
        { path: "/posts/:slug", name: "post", component: () => import("./views/PostView.vue"), props: true },
        { path: "/tags/:tag", name: "tag", component: () => import("./views/TagView.vue"), props: true },
        { path: "/about", name: "about", component: () => import("./views/AboutView.vue") },
        { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("./views/NotFoundView.vue") },
    ],
    // ページを移ったら一番上へ。#見出し があればそこへ(目次から飛ぶとき)
    scrollBehavior(to) {
        if (to.hash) return { el: decodeURIComponent(to.hash), behavior: "smooth" };
        return { top: 0 };
    },
});
