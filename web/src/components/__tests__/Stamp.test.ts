import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import Stamp from "../Stamp.vue";

describe("Stamp", () => {
    test("WATCH は 14 日までは薄くしない", () => {
        const w = mount(Stamp, { props: { result: "watch", day: 14 } });
        expect(w.get("[data-testid=stamp]").classes()).not.toContain("opacity-45");
        expect(w.get("[data-testid=stamp-day]").text()).toBe("観察 14 日目");
    });

    test("14 日を超えると薄くなり、「そろそろ結果を」と出る", () => {
        const w = mount(Stamp, { props: { result: "watch", day: 15 } });
        expect(w.get("[data-testid=stamp]").classes()).toContain("opacity-45");
        expect(w.get("[data-testid=stamp-day]").text()).toContain("そろそろ結果を");
    });

    test("WATCH は破線、PASS と FAIL は実線", () => {
        expect(mount(Stamp, { props: { result: "watch" } }).get("[data-testid=stamp]").classes()).toContain("border-dashed");
        expect(mount(Stamp, { props: { result: "pass" } }).get("[data-testid=stamp]").text()).toBe("PASS");
        expect(mount(Stamp, { props: { result: "fail" } }).get("[data-testid=stamp]").classes()).toContain("border-solid");
    });
});
