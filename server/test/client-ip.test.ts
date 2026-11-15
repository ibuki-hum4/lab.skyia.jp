import { describe, expect, test } from "bun:test";
import { createApp } from "@senrijs/senri";
import { request } from "@senrijs/senri/testing";
import { clientIpFromEnv } from "../src/client-ip";

/** 接続元 peer から、X-Forwarded-For を xff にして来たときに、アプリが見る IP */
async function seen(env: string | undefined, peer: string, xff?: string) {
    const clientIp = clientIpFromEnv(env);
    const app = createApp();
    app.get("/ip", (_, c) => clientIp(c) ?? "null");
    const res = await request(app, "GET /ip", { headers: xff ? { "X-Forwarded-For": xff } : {} }, { ip: peer });
    return res.text();
}

describe("TRUSTED_PROXIES", () => {
    test("未設定なら接続元をそのまま使い、ヘッダーは読まない", async () => {
        expect(await seen(undefined, "203.0.113.5", "198.51.100.1")).toBe("203.0.113.5");
        expect(await seen("", "203.0.113.5", "198.51.100.1")).toBe("203.0.113.5");
    });

    test("Traefik(範囲の中)から来たら、X-Forwarded-For の右端のクライアントを使う", async () => {
        expect(await seen("10.1.0.0/16", "10.1.4.7", "198.51.100.1")).toBe("198.51.100.1");
        // 左側はクライアントが好きに書けるので、信じない
        expect(await seen("10.1.0.0/16", "10.1.4.7", "1.2.3.4, 198.51.100.1")).toBe("198.51.100.1");
    });

    test("範囲の外から直接来たら、ヘッダーを信じない", async () => {
        expect(await seen("10.1.0.0/16", "10.152.0.9", "198.51.100.1")).toBe("10.152.0.9");
    });

    test("カンマ区切りで複数書ける。IP でも CIDR でもないものは起動時に止める", async () => {
        expect(await seen("10.1.0.0/16, 192.0.2.1", "192.0.2.1", "198.51.100.1")).toBe("198.51.100.1");
        expect(() => clientIpFromEnv("traefik")).toThrow("TRUSTED_PROXIES");
    });
});
