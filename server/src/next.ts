// ログインのあとの戻り先(?next=...)。外へのリダイレクトに使われないように、サイトの中の相対パスだけにする。

/**
 * `/` で始まるサイト内の相対パスだけを返す。そうでなければ "/"。
 * `//evil.example`(スキームなしの外部)、`/\evil.example`(ブラウザが // と読む)、`https://...` は捨てる。
 */
export function safeNext(value: string | undefined | null): string {
    if (typeof value !== "string" || value === "") return "/";
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
    // 改行やタブなどの制御文字(ブラウザが読み飛ばして // になることがある)
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
    const base = "http://lab.invalid";
    let url: URL;
    try {
        url = new URL(value, base);
    } catch {
        return "/";
    }
    if (url.origin !== base) return "/";
    return url.pathname + url.search + url.hash;
}
