// クライアントの IP の取り方を、環境変数から決める。
import type { Context } from "@senrijs/senri";
import { getIp, trustProxy } from "@senrijs/senri/ip";

/**
 * TRUSTED_PROXIES は、アプリの手前にあるプロキシ(本番では Traefik の Pod)の IP か CIDR を、カンマで区切ったもの。
 * - 接続元がこの範囲のときだけ X-Forwarded-For を読み、右から見て範囲の外にある最初の値をクライアントとする
 * - 未設定・空なら、接続元の IP をそのまま使う(手元で直接つなぐとき)
 *
 * 段数(hops)で指定しないのは、Service 経由でクラスター内のほかの Pod からも直接つなげるため。
 * 段数だと、そういう接続が書いた X-Forwarded-For もそのまま信じてしまう。
 *
 * プライベート帯を丸ごと(10.0.0.0/8 など)書かないこと。利用者がそこに含まれると、詐称されたヘッダーを信じることになる。
 */
export function clientIpFromEnv(value: string | undefined): (c: Context) => string | null {
    const proxies = parseProxies(value);
    if (proxies.length === 0) return getIp;
    try {
        return trustProxy({ proxies });
    } catch {
        throw new Error(`TRUSTED_PROXIES に IP か CIDR でないものがあります: ${value}`);
    }
}

/** カンマ区切りを配列に(空は捨てる) */
export const parseProxies = (value: string | undefined) =>
    (value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
