import { describe, expect, test } from "vitest";
import { clampCrop, drawSize } from "../avatar";

describe("アイコンの切り抜き", () => {
    test("zoom 1 で、短い辺が枠にちょうど入る", () => {
        expect(drawSize(800, 400, 200, 1)).toEqual({ width: 400, height: 200 });
        expect(drawSize(300, 600, 200, 2)).toEqual({ width: 400, height: 800 });
    });

    test("枠の外に空きが出ないように、ずれと大きさを抑える", () => {
        // 横長(400×200 で置く)なら、左右に 100 まで動かせる。上下には動かせない
        expect(clampCrop(800, 400, 200, { zoom: 1, x: 500, y: 50 })).toEqual({ zoom: 1, x: 100, y: 0 });
        expect(clampCrop(800, 400, 200, { zoom: 1, x: -500, y: -50 })).toEqual({ zoom: 1, x: -100, y: -0 });
        expect(clampCrop(100, 100, 200, { zoom: 0.5, x: 0, y: 0 }).zoom).toBe(1);
        expect(clampCrop(100, 100, 200, { zoom: 9, x: 0, y: 0 }).zoom).toBe(4);
    });
});
