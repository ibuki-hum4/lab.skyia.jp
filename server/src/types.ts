// server と web の両方から読む型。
// web は routes.ts を経由してこのファイルの型を使うので、ここでは Bun 専用の import をしない。

export type PostType = "post" | "experiment";
export type ExperimentStatus = "success" | "failure" | "observing";

/** frontmatter から作る、1 本ぶんの情報(一覧で返す形) */
export type PostMeta = {
    slug: string;
    title: string;
    /** YYYY-MM-DD */
    date: string;
    tags: string[];
    type: PostType;
    /** 実験(type: experiment)のときだけ入る */
    status?: ExperimentStatus;
    summary: string;
};

/** 目次の 1 行 */
export type TocItem = {
    /** 見出しのレベル(2 なら ##) */
    depth: number;
    /** 見出しに付けた id。`#id` で飛べる */
    id: string;
    text: string;
};

/** 起動時に読み込んで、メモリーに持っておく 1 本ぶん */
export type LoadedPost = PostMeta & {
    /** HTML にした本文 */
    html: string;
    toc: TocItem[];
    /** 検索に使う、Markdown のままの本文 */
    source: string;
};

/** いいねの保存先(本番は SQLite、テストではメモリー上の SQLite) */
export type LikeStore = {
    get(slug: string): number;
    increment(slug: string): number;
};
