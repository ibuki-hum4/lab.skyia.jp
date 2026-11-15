import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";

// API はニセにする(押したときの見た目だけを見る)
const setFollow = vi.fn();
vi.mock("../../api", () => ({
    setFollow: (...args: unknown[]) => setFollow(...args),
    loginUrl: (next: string) => `/auth/login?next=${encodeURIComponent(next)}`,
}));

const { default: FollowButton } = await import("../FollowButton.vue");

describe("FollowButton", () => {
    beforeEach(() => setFollow.mockReset());

    test("押したらすぐ「フォロー中」になり、成功したらそのまま", async () => {
        let resolve!: (v: unknown) => void;
        setFollow.mockReturnValue(new Promise((r) => (resolve = r)));
        const w = mount(FollowButton, { props: { handle: "sora", following: false, loggedIn: true } });
        await w.get("button").trigger("click");
        // API の返事を待たずに変わっている
        expect(w.get("button").text()).toBe("フォロー中");
        expect(w.get("button").attributes("aria-pressed")).toBe("true");
        resolve({ ok: true, status: 200 });
        await flushPromises();
        expect(w.get("button").text()).toBe("フォロー中");
        expect(w.emitted("change")).toEqual([[true]]);
        expect(setFollow).toHaveBeenCalledWith("sora", true);
    });

    test("失敗したら元に戻る", async () => {
        let resolve!: (v: unknown) => void;
        setFollow.mockReturnValue(new Promise((r) => (resolve = r)));
        const w = mount(FollowButton, { props: { handle: "sora", following: false, loggedIn: true } });
        await w.get("button").trigger("click");
        expect(w.get("button").text()).toBe("フォロー中");
        resolve({ ok: false, status: 403 });
        await flushPromises();
        expect(w.get("button").text()).toBe("フォローする");
        expect(w.emitted("error")).toEqual([["フォローできませんでした"]]);
    });

    test("外すときも、失敗したら元に戻る", async () => {
        let resolve!: (v: unknown) => void;
        setFollow.mockReturnValue(new Promise((r) => (resolve = r)));
        const w = mount(FollowButton, { props: { handle: "sora", following: true, loggedIn: true } });
        await w.get("button").trigger("click");
        expect(w.get("button").text()).toBe("フォローする");
        resolve({ ok: false, status: 500 });
        await flushPromises();
        expect(w.get("button").text()).toBe("フォロー中");
    });

    test("ログイン前に押したら、ログインへ送る", async () => {
        const assign = vi.fn();
        vi.stubGlobal("location", { ...window.location, pathname: "/@sora", assign });
        const w = mount(FollowButton, { props: { handle: "sora", following: false, loggedIn: false } });
        await w.get("button").trigger("click");
        expect(assign).toHaveBeenCalledWith("/auth/login?next=%2F%40sora");
        expect(setFollow).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
