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

/** いいねの保存先(PostgreSQL の post_likes) */
export type LikeStore = {
    get(slug: string): Promise<number>;
    increment(slug: string): Promise<number>;
};

/** ロール。HoshID の「一般 / 役員 / 管理者」に当たる */
export type Role = "member" | "moderator" | "admin";

/** DB の users の 1 行 */
export type User = {
    /** Better Auth が作るランダムな文字列 */
    id: string;
    handle: string | null;
    displayName: string;
    bio: string;
    role: Role;
    suspendedAt: string | null;
};

/** GET /api/me が返す形 */
export type Me = {
    handle: string | null;
    displayName: string;
    role: Role;
};

/** 一覧(フォロワーなど)の 1 行 */
export type UserSummary = {
    handle: string;
    displayName: string;
};

/** GET /api/users/:handle が返す形 */
export type Profile = UserSummary & {
    bio: string;
    followingCount: number;
    followerCount: number;
    /** ログイン中だけ入る。自分のページでは 3 つとも false */
    viewer?: {
        /** 自分がこの人をフォローしている */
        following: boolean;
        /** この人が自分をフォローしている */
        followedBy: boolean;
        /** 自分がこの人をブロックしている */
        blocking: boolean;
    };
};

/** ハンドルが使えないわけ */
export type HandleProblem = "invalid" | "reserved" | "taken";

export type FollowResult = "ok" | "self" | "not_found" | "blocked";

/** ユーザー・フォロー・ブロックの保存先(PostgreSQL。実装は social.ts) */
export type SocialStore = {
    /** ハンドルが使えるか。使えなければわけを返す */
    handleProblem(handle: string): Promise<HandleProblem | null>;
    /** 初回だけハンドルを決める。もう決まっていたら "already" */
    setHandle(userId: string, handle: string): Promise<"ok" | "already" | HandleProblem>;
    profile(handle: string, viewerId: string | null): Promise<Profile | null>;
    follow(viewerId: string, handle: string): Promise<FollowResult>;
    unfollow(viewerId: string, handle: string): Promise<Exclude<FollowResult, "blocked">>;
    /** ブロックしたら、お互いのフォローを同じトランザクションで消す */
    block(viewerId: string, handle: string): Promise<Exclude<FollowResult, "blocked">>;
    unblock(viewerId: string, handle: string): Promise<Exclude<FollowResult, "blocked">>;
    followers(handle: string): Promise<UserSummary[] | null>;
    following(handle: string): Promise<UserSummary[] | null>;
    blocks(viewerId: string): Promise<UserSummary[]>;
    /** どちらかがどちらかをブロックしているか。次の PR でコメントや追試を止めるのに使う */
    isBlockedBetween(a: string, b: string): Promise<boolean>;
};
