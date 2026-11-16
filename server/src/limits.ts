// 長さの上限と、連打の制限。routes.ts(web の型チェックからも読む)と、DB の CHECK 制約(マイグレーション)に合わせる。

export const LIMITS = {
    /** 表示名(文字数) */
    displayName: 50,
    /** 自己紹介(文字数) */
    bio: 300,
    /** ノートのタイトル(文字数) */
    title: 100,
    /** ノートの本文(Markdown の文字数) */
    noteBody: 50_000,
    /** コメント(Markdown の文字数) */
    comment: 2_000,
    /** 1 つのノートのタグの数 */
    tagsPerNote: 10,
    /** タグ 1 つ(文字数) */
    tag: 32,
    /** 非表示にするわけ(文字数) */
    hideReason: 200,
    /** アイコン画像(バイト) */
    avatarBytes: 256 * 1024,
    /** 検索語(文字数) */
    query: 100,
} as const;

export type RateLimitRule = { windowMs: number; limit: number };

/** 連打の制限。どれも「ログイン中の人ごと」に数える */
export type RateLimits = {
    /** ノートを作る(下書きも含む) */
    note: RateLimitRule;
    /** コメントを書く */
    comment: RateLimitRule;
    /** いいねを付ける・外す */
    like: RateLimitRule;
    /** アイコン画像を変える */
    avatar: RateLimitRule;
    /** エディタのプレビュー */
    preview: RateLimitRule;
};

export const DEFAULT_RATE_LIMITS: RateLimits = {
    note: { windowMs: 10 * 60_000, limit: 10 },
    comment: { windowMs: 60_000, limit: 5 },
    like: { windowMs: 60_000, limit: 30 },
    avatar: { windowMs: 60 * 60_000, limit: 10 },
    preview: { windowMs: 60_000, limit: 60 },
};
