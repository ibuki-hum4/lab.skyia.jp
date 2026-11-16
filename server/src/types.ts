// server と web の両方から読む型。
// web は routes.ts を経由してこのファイルの型を使うので、ここでは Bun 専用の import をしない。

/** 目次の 1 行 */
export type TocItem = {
    /** 見出しのレベル(2 なら ##) */
    depth: number;
    /** 見出しに付けた id。`#id` で飛べる */
    id: string;
    text: string;
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
    /** アイコン画像のハッシュ。なければ null */
    avatarHash: string | null;
};

/** GET /api/me が返す形 */
export type Me = {
    handle: string | null;
    displayName: string;
    role: Role;
    /** アイコン画像の URL。なければ null */
    avatar: string | null;
};

/** 一覧(フォロワーなど)の 1 行 */
export type UserSummary = {
    handle: string;
    displayName: string;
};

/** GET /api/users/:handle が返す形 */
export type Profile = UserSummary & {
    bio: string;
    avatar: string | null;
    /** 公開しているノートの数(本人が見るときも下書きは数えない) */
    counts: NoteCounts;
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
    /** どちらかがどちらかをブロックしているか。コメント・追試・いいね・派生を止めるのに使う */
    isBlockedBetween(a: string, b: string): Promise<boolean>;
};

// ---- ノート(実験・記事・メモ) ----

export type NoteKind = "experiment" | "article" | "memo";
export type NoteStatus = "pass" | "fail" | "watch";
export type LinkKind = "replication" | "derivation";

/** 一覧や本文で、人を出すときの形(アイコンの URL つき) */
export type Author = UserSummary & {
    /** アイコン画像の URL(ハッシュ付き)。なければ null(頭文字の四角を出す) */
    avatar: string | null;
};

/** ほかのノートを指すときの、いちばん小さい形 */
export type NoteRef = {
    id: string;
    /** EXP-006 など */
    code: string;
    kind: NoteKind;
    title: string;
    status: NoteStatus | null;
    author: Author;
};

/** 一覧の 1 行 */
export type NoteSummary = NoteRef & {
    number: number;
    excerpt: string;
    draft: boolean;
    tags: string[];
    likeCount: number;
    commentCount: number;
    /** 公開した追試の数(実験だけ意味がある) */
    replicationCount: number;
    /** WATCH のとき、観察 ◯ 日目(1 日目から) */
    watchDays: number | null;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    /** 追試・派生として作ったとき、元の実験 */
    origin: { kind: LinkKind; note: NoteRef } | null;
    /** moderator が隠したとき(一覧に出るのは作者自身の一覧だけ) */
    hidden: boolean;
};

export type StatusChange = { from: NoteStatus | null; to: NoteStatus; at: string };

/** 1 件ぶん */
export type NoteDetail = NoteSummary & {
    html: string;
    toc: TocItem[];
    /** Markdown のまま。編集できる人(作者)にだけ入る */
    body?: string;
    /** 実験の状態の履歴(古い順) */
    history: StatusChange[];
    /** 隠したわけ(作者と moderator にだけ入る) */
    hiddenReason?: string;
    viewer: {
        liked: boolean;
        /** 編集・削除・公開ができる(作者だけ) */
        canEdit: boolean;
        /** 隠す・戻すができる(moderator 以上) */
        canModerate: boolean;
        /** コメント・追試・いいね・派生ができる(ログイン中で、ブロックし合っていない) */
        canInteract: boolean;
    };
};

/** 系譜の 1 つ。children は派生したもの */
export type LineageNode = NoteRef & { children: LineageNode[] };

export type Lineage = {
    /** 派生元を、遠いほうから順に */
    ancestors: NoteRef[];
    self: NoteRef;
    /** 派生したもの(数段まで) */
    children: LineageNode[];
};

export type CommentItem = {
    id: string;
    author: Author;
    /** 消した・隠したものは null */
    html: string | null;
    /** Markdown のまま。本人にだけ入る(編集に使う) */
    body?: string;
    createdAt: string;
    updatedAt: string;
    deleted: boolean;
    hidden: boolean;
    hiddenReason?: string;
    viewer: { canEdit: boolean; canModerate: boolean };
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type TagCount = { tag: string; count: number };

/** メンバーの一覧の 1 行 */
export type Member = Author & { bio: string; noteCount: number };

/** プロフィールの数の欄 */
export type NoteCounts = { experiment: number; pass: number; fail: number; watch: number; article: number; memo: number };
