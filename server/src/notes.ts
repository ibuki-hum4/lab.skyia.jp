// ノート(実験・記事・メモ)・追試と派生・コメント・タグ・いいね(PostgreSQL、Prisma)。
//
// 見え方の決まり:
//   - 下書きは作者にしか見えない(ほかの人には 404)
//   - moderator が隠したものは、作者と moderator 以上にしか見えない(ほかの人には 404 の "hidden")
//   - ブロック: blocker の一覧・検索・コメント欄・追試の一覧・系譜から、blocked のノートとコメントを外す。
//     ノートそのものは公開のままで、URL を開けば誰でも読める
//   - ブロックし合っている 2 人のあいだでは、コメント・追試・いいね・派生ができない(どちらがブロックしたかは言わない)
import { avatarUrl } from "./avatar";
import type { Db } from "./db";
import { Prisma } from "./generated/prisma/client";
import { atLeast } from "./guards";
import { parseId } from "./ids";
import { LIMITS } from "./limits";
import type { Renderer } from "./markdown";
import type {
    Author,
    CommentItem,
    LineageNode,
    Lineage,
    LinkKind,
    Member,
    NoteCounts,
    NoteDetail,
    NoteKind,
    NoteRef,
    NoteStatus,
    NoteSummary,
    Page,
    SocialStore,
    StatusChange,
    TagCount,
    TocItem,
    User,
} from "./types";

type Tx = Prisma.TransactionClient;
export type Viewer = Pick<User, "id" | "role" | "handle"> | null;

export const NOTE_KINDS: readonly NoteKind[] = ["experiment", "article", "memo"];
export const NOTE_STATUSES: readonly NoteStatus[] = ["pass", "fail", "watch"];
export const LINK_KINDS: readonly LinkKind[] = ["replication", "derivation"];

/** 表示の前置き。記事は POST(モックの RELATED に合わせる) */
const PREFIX: Record<NoteKind, string> = { experiment: "EXP", article: "POST", memo: "MEMO" };
const KIND_OF_PREFIX = new Map(Object.entries(PREFIX).map(([k, v]) => [v, k as NoteKind]));

/** EXP-006 のように 3 桁(1000 からは桁が増える) */
export const codeOf = (kind: NoteKind, number: number) => `${PREFIX[kind]}-${String(number).padStart(3, "0")}`;

export function parseCode(code: string): { kind: NoteKind; number: number } | null {
    const m = /^([A-Za-z]+)-(\d{1,9})$/.exec(code);
    const kind = m ? KIND_OF_PREFIX.get(m[1]!.toUpperCase()) : undefined;
    if (!m || !kind) return null;
    const number = Number(m[2]);
    return number > 0 ? { kind, number } : null;
}

/** タグを 1 つ整える。先頭の # を取り、NFKC にそろえて小文字に */
export function normalizeTag(raw: string): string | null {
    const tag = raw.normalize("NFKC").trim().replace(/^#+/, "").toLowerCase();
    if (tag.length < 1 || tag.length > LIMITS.tag) return null;
    // 文字・数字と _ - . + だけ(空白や / を入れると URL が分かりにくくなる)
    return /^[\p{L}\p{N}_.+-]+$/u.test(tag) ? tag : null;
}

/** タグの配列を整える。重なりは 1 つにする。10 個を超えたら "too_many_tags" */
export function normalizeTags(raw: unknown): string[] | "invalid_tag" | "too_many_tags" {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some((t) => typeof t !== "string")) return "invalid_tag";
    const tags: string[] = [];
    for (const t of raw as string[]) {
        const tag = normalizeTag(t);
        if (tag === null) return "invalid_tag";
        if (!tags.includes(tag)) tags.push(tag);
    }
    return tags.length > LIMITS.tagsPerNote ? "too_many_tags" : tags;
}

// ---- 結果の形 ----

export type Fail<E extends string = string, S extends 400 | 403 | 404 | 409 = 400 | 403 | 404 | 409> = { ok: false; error: E; status: S };
export type Result<T> = { ok: true; value: T } | Fail;

const ok = <T>(value: T) => ({ ok: true as const, value });
const notFound = { ok: false, error: "not_found", status: 404 } as const;
const hiddenNote = { ok: false, error: "hidden", status: 404 } as const;
const forbidden = { ok: false, error: "forbidden", status: 403 } as const;
/** ブロックし合っている(どちらがしたかは言わない) */
const cannotInteract = { ok: false, error: "cannot_interact", status: 403 } as const;
const invalid = <E extends string>(error: E) => ({ ok: false as const, error, status: 400 as const });

// ---- 読み出しの形 ----

const authorSelect = { handle: true, name: true, avatarHash: true } satisfies Prisma.userSelect;
const refSelect = {
    id: true,
    kind: true,
    number: true,
    title: true,
    status: true,
    author: { select: authorSelect },
} satisfies Prisma.noteSelect;

/** 公開していて、隠されていないもの */
const publicWhere = { draft: false, hiddenAt: null } satisfies Prisma.noteWhereInput;

const summarySelect = {
    ...refSelect,
    authorId: true,
    excerpt: true,
    draft: true,
    watchSince: true,
    createdAt: true,
    updatedAt: true,
    publishedAt: true,
    hiddenAt: true,
    tags: { select: { tag: { select: { name: true } } } },
    linkAsTarget: { select: { kind: true, source: { select: refSelect } } },
    _count: {
        select: {
            likes: true,
            comments: { where: { deletedAt: null, hiddenAt: null } },
            linksAsSource: { where: { kind: "replication", target: publicWhere } },
        },
    },
} satisfies Prisma.noteSelect;

type AuthorRow = Prisma.userGetPayload<{ select: typeof authorSelect }>;
type RefRow = Prisma.noteGetPayload<{ select: typeof refSelect }>;
type SummaryRow = Prisma.noteGetPayload<{ select: typeof summarySelect }>;

const DAY = 24 * 60 * 60 * 1000;

export const toAuthor = (a: AuthorRow): Author => ({
    handle: a.handle ?? "",
    displayName: a.name,
    avatar: avatarUrl(a.handle, a.avatarHash),
});

const toRef = (r: RefRow): NoteRef => ({
    id: r.id.toString(),
    code: codeOf(r.kind as NoteKind, r.number),
    kind: r.kind as NoteKind,
    title: r.title,
    status: (r.status as NoteStatus | null) ?? null,
    author: toAuthor(r.author),
});

/** 観察 ◯ 日目(WATCH にした日を 1 日目とする) */
export const watchDays = (since: Date | null, now = new Date()) =>
    since ? Math.max(1, Math.floor((now.getTime() - since.getTime()) / DAY) + 1) : null;

function toSummary(r: SummaryRow, now: Date): NoteSummary {
    return {
        ...toRef(r),
        number: r.number,
        excerpt: r.excerpt,
        draft: r.draft,
        tags: r.tags.map((t) => t.tag.name).sort(),
        likeCount: r._count.likes,
        commentCount: r._count.comments,
        replicationCount: r._count.linksAsSource,
        watchDays: r.status === "watch" ? watchDays(r.watchSince, now) : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        publishedAt: r.publishedAt?.toISOString() ?? null,
        origin: r.linkAsTarget ? { kind: r.linkAsTarget.kind as LinkKind, note: toRef(r.linkAsTarget.source) } : null,
        hidden: r.hiddenAt !== null,
    };
}

// ---- カーソル ----

/** 並べる時刻と id を、URL に載せられる形に */
const encodeCursor = (at: Date, id: bigint) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");

function decodeCursor(cursor: string | undefined): { at: Date; id: bigint } | null {
    if (!cursor) return null;
    const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const date = new Date(at ?? "");
    const parsed = parseId(id);
    return Number.isNaN(date.getTime()) || parsed === null ? null : { at: date, id: parsed };
}

// ---- 入力 ----

export type NoteInput = {
    kind?: unknown;
    title?: unknown;
    body?: unknown;
    status?: unknown;
    tags?: unknown;
    draft?: unknown;
    /** 追試・派生として作るとき */
    link?: unknown;
};

export type ListFilter = {
    kind?: string;
    status?: string;
    tag?: string;
    /** 作者のハンドル */
    author?: string;
    /** フォロー中の人だけ(ログイン中だけ) */
    following?: boolean;
    /** 自分の下書き(author が自分のときだけ) */
    drafts?: boolean;
    /** タイトルと本文から探す */
    q?: string;
    cursor?: string;
    limit?: number;
};

/** ILIKE の % と _ と \ を文字として扱う */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export function createNoteStore(db: Db, render: Renderer, social: SocialStore) {
    /** viewer がブロックしている人のノートを外す条件 */
    const notBlockedBy = (viewer: Viewer): Prisma.noteWhereInput =>
        viewer ? { author: { blockedBy: { none: { blockerId: viewer.id } } } } : {};

    const canModerate = (viewer: Viewer) => !!viewer && atLeast(viewer.role, "moderator");

    /** 見えるか。見えなければ 404 の理由 */
    const visibility = (
        note: { authorId: string; draft: boolean; hiddenAt: Date | null },
        viewer: Viewer,
    ): typeof notFound | typeof hiddenNote | null => {
        const isAuthor = viewer?.id === note.authorId;
        if (note.draft && !isAuthor) return notFound;
        if (note.hiddenAt && !isAuthor && !canModerate(viewer)) return hiddenNote;
        return null;
    };

    /** タグを入れ直す(なければ作る) */
    async function setTags(tx: Tx, noteId: bigint, tags: string[]) {
        await tx.noteTag.deleteMany({ where: { noteId } });
        if (tags.length === 0) return;
        await tx.tag.createMany({ data: tags.map((name) => ({ name })), skipDuplicates: true });
        const rows = await tx.tag.findMany({ where: { name: { in: tags } }, select: { id: true } });
        await tx.noteTag.createMany({ data: rows.map((t) => ({ noteId, tagId: t.id })) });
    }

    /** 通し番号を 1 つもらう。1 つの文なので、同時に作っても重ならない */
    async function nextNumber(tx: Tx, authorId: string, kind: NoteKind): Promise<number> {
        const rows = await tx.$queryRaw<{ last: number }[]>`
            INSERT INTO note_counters (author_id, kind, last) VALUES (${authorId}, ${kind}, 1)
            ON CONFLICT (author_id, kind) DO UPDATE SET last = note_counters.last + 1
            RETURNING last`;
        return rows[0]!.last;
    }

    const rendered = (body: string) => {
        const r = render(body);
        return { bodyHtml: r.html, toc: r.toc as unknown as Prisma.InputJsonValue, excerpt: r.excerpt };
    };

    async function summaries(where: Prisma.noteWhereInput, orderBy: Prisma.noteOrderByWithRelationInput[], take?: number) {
        const now = new Date();
        const rows = await db.note.findMany({ where, orderBy, take, select: summarySelect });
        return rows.map((r) => toSummary(r, now));
    }

    async function detail(id: bigint, viewer: Viewer): Promise<Result<NoteDetail>> {
        const row = await db.note.findUnique({
            where: { id },
            select: {
                ...summarySelect,
                body: true,
                bodyHtml: true,
                toc: true,
                hiddenReason: true,
                history: { orderBy: [{ changedAt: "asc" }, { id: "asc" }], select: { fromStatus: true, toStatus: true, changedAt: true } },
            },
        });
        if (!row) return notFound;
        const hidden = visibility(row, viewer);
        if (hidden) return hidden;

        const isAuthor = viewer?.id === row.authorId;
        const mod = canModerate(viewer);
        const [liked, blocked] = viewer
            ? await Promise.all([
                  db.noteLike.count({ where: { userId: viewer.id, noteId: id } }).then((n) => n > 0),
                  isAuthor ? false : social.isBlockedBetween(viewer.id, row.authorId),
              ])
            : [false, false];
        const history: StatusChange[] = row.history.map((h) => ({
            from: (h.fromStatus as NoteStatus | null) ?? null,
            to: h.toStatus as NoteStatus,
            at: h.changedAt.toISOString(),
        }));
        return ok({
            ...toSummary(row, new Date()),
            html: row.bodyHtml,
            toc: row.toc as unknown as TocItem[],
            ...(isAuthor ? { body: row.body } : {}),
            history,
            ...(row.hiddenReason && (isAuthor || mod) ? { hiddenReason: row.hiddenReason } : {}),
            viewer: {
                liked,
                canEdit: isAuthor,
                canModerate: mod,
                canInteract: !!viewer && !row.draft && !row.hiddenAt && !blocked,
            },
        });
    }

    /** コメント・追試・いいね・派生の前に: 公開していて、隠されておらず、ブロックし合っていないこと */
    async function interactable(viewer: User, id: bigint) {
        const note = await db.note.findUnique({ where: { id }, select: { authorId: true, kind: true, draft: true, hiddenAt: true } });
        if (!note) return notFound;
        const hidden = visibility(note, viewer);
        if (hidden) return hidden;
        if (note.draft || note.hiddenAt) return forbidden;
        if (note.authorId !== viewer.id && (await social.isBlockedBetween(viewer.id, note.authorId))) return cannotInteract;
        return ok(note);
    }

    /** 編集・削除・公開の前に: 作者であること */
    async function ownNote(viewer: User, id: bigint) {
        const note = await db.note.findUnique({ where: { id }, select: { id: true, authorId: true, kind: true, status: true, draft: true, publishedAt: true, hiddenAt: true } });
        if (!note || visibility(note, viewer)) return notFound;
        if (note.authorId !== viewer.id) return forbidden;
        return ok(note);
    }

    /** タイトル・本文・状態・タグを読んで確かめる(作るとき・直すとき) */
    function readFields(input: NoteInput, kind: NoteKind, partial: boolean) {
        const out: { title?: string; body?: string; status?: NoteStatus; tags?: string[] } = {};
        if (input.title !== undefined || !partial) {
            if (typeof input.title !== "string") return invalid("title_required");
            const title = input.title.trim();
            if (title.length === 0) return invalid("title_required");
            if (title.length > LIMITS.title) return invalid("title_too_long");
            out.title = title;
        }
        if (input.body !== undefined || !partial) {
            const body = input.body ?? "";
            if (typeof body !== "string") return invalid("invalid");
            if (body.length > LIMITS.noteBody) return invalid("body_too_long");
            out.body = body;
        }
        if (input.status !== undefined && input.status !== null) {
            if (kind !== "experiment") return invalid("status_only_for_experiments");
            if (!NOTE_STATUSES.includes(input.status as NoteStatus)) return invalid("invalid_status");
            out.status = input.status as NoteStatus;
        } else if (!partial && kind === "experiment") {
            out.status = "watch";
        }
        if (input.tags !== undefined || !partial) {
            const tags = normalizeTags(input.tags);
            if (typeof tags === "string") return invalid(tags);
            out.tags = tags;
        }
        return ok(out);
    }

    return {
        /** ノートを作る(下書きも)。追試・派生は link: { kind, sourceId } */
        async create(viewer: User, input: NoteInput): Promise<Result<NoteDetail>> {
            if (!viewer.handle) return { ok: false, error: "no_handle", status: 403 };
            if (!NOTE_KINDS.includes(input.kind as NoteKind)) return invalid("invalid_kind");
            const kind = input.kind as NoteKind;
            const fields = readFields(input, kind, false);
            if (!fields.ok) return fields;
            const { title, body, status, tags } = fields.value as Required<typeof fields.value>;
            const draft = input.draft !== false;

            // 追試・派生の元
            let link: { kind: LinkKind; sourceId: bigint } | null = null;
            if (input.link !== undefined && input.link !== null) {
                const l = input.link as { kind?: unknown; sourceId?: unknown };
                const sourceId = parseId(typeof l.sourceId === "string" ? l.sourceId : undefined);
                if (!LINK_KINDS.includes(l.kind as LinkKind) || sourceId === null) return invalid("invalid_link");
                if (kind !== "experiment") return invalid("link_only_for_experiments");
                const source = await interactable(viewer, sourceId);
                if (!source.ok) return source;
                if (source.value.kind !== "experiment") return invalid("source_not_experiment");
                link = { kind: l.kind as LinkKind, sourceId };
            }

            const now = new Date();
            const id = await db.$transaction(async (tx) => {
                const number = await nextNumber(tx, viewer.id, kind);
                const note = await tx.note.create({
                    data: {
                        authorId: viewer.id,
                        kind,
                        number,
                        title,
                        body,
                        ...rendered(body),
                        draft,
                        status: status ?? null,
                        watchSince: status === "watch" ? now : null,
                        createdAt: now,
                        updatedAt: now,
                        publishedAt: draft ? null : now,
                    },
                    select: { id: true },
                });
                if (status) await tx.noteStatusHistory.create({ data: { noteId: note.id, fromStatus: null, toStatus: status, changedAt: now } });
                await setTags(tx, note.id, tags);
                if (link) await tx.noteLink.create({ data: { kind: link.kind, sourceId: link.sourceId, targetId: note.id } });
                return note.id;
            });
            return detail(id, viewer);
        },

        /** 直す(下書きの保存も)。種類は変えられない。状態が変われば履歴に残す */
        async update(viewer: User, id: bigint, input: NoteInput): Promise<Result<NoteDetail>> {
            const own = await ownNote(viewer, id);
            if (!own.ok) return own;
            const note = own.value;
            if (input.kind !== undefined && input.kind !== note.kind) return invalid("kind_is_fixed");
            const fields = readFields(input, note.kind as NoteKind, true);
            if (!fields.ok) return fields;
            const { title, body, status, tags } = fields.value;
            const now = new Date();
            await db.$transaction(async (tx) => {
                const data: Prisma.noteUpdateInput = { updatedAt: now };
                if (title !== undefined) data.title = title;
                if (body !== undefined) Object.assign(data, { body }, rendered(body));
                if (status !== undefined && status !== note.status) {
                    data.status = status;
                    data.watchSince = status === "watch" ? now : null;
                    await tx.noteStatusHistory.create({ data: { noteId: id, fromStatus: note.status, toStatus: status, changedAt: now } });
                }
                if (input.draft === false && note.draft) {
                    data.draft = false;
                    data.publishedAt = note.publishedAt ?? now;
                }
                await tx.note.update({ where: { id }, data });
                if (tags !== undefined) await setTags(tx, id, tags);
            });
            return detail(id, viewer);
        },

        /** 下書きを公開する(もう公開していれば、そのまま) */
        async publish(viewer: User, id: bigint): Promise<Result<NoteDetail>> {
            const own = await ownNote(viewer, id);
            if (!own.ok) return own;
            if (own.value.draft) {
                const now = new Date();
                await db.note.update({ where: { id }, data: { draft: false, publishedAt: own.value.publishedAt ?? now, updatedAt: now } });
            }
            return detail(id, viewer);
        },

        async remove(viewer: User, id: bigint): Promise<Result<{ deleted: true }>> {
            const own = await ownNote(viewer, id);
            if (!own.ok) return own;
            await db.note.delete({ where: { id } });
            return ok({ deleted: true as const });
        },

        get: (viewer: Viewer, id: bigint) => detail(id, viewer),

        /** /@handle/EXP-006 */
        async getByCode(viewer: Viewer, handle: string, code: string): Promise<Result<NoteDetail>> {
            const parsed = parseCode(code);
            if (!parsed) return notFound;
            const row = await db.note.findFirst({
                where: { kind: parsed.kind, number: parsed.number, author: { handle: { equals: handle, mode: "insensitive" } } },
                select: { id: true },
            });
            return row ? detail(row.id, viewer) : notFound;
        },

        /** 一覧。新しい順で、カーソルでページを送る */
        async list(viewer: Viewer, f: ListFilter): Promise<Result<Page<NoteSummary>>> {
            const limit = Math.min(Math.max(Math.trunc(f.limit ?? 20) || 20, 1), 50);
            const where: Prisma.noteWhereInput[] = [];
            let own = false;

            if (f.author) {
                const author = await db.user.findFirst({ where: { handle: { equals: f.author, mode: "insensitive" } }, select: { id: true } });
                if (!author) return notFound;
                own = viewer?.id === author.id;
                where.push({ authorId: author.id });
            }
            if (f.drafts) {
                // 下書きは本人だけ
                if (!own) return forbidden;
                where.push({ draft: true });
            } else if (own) {
                // 自分の一覧には、隠されたものも出す(印を付けて)
                where.push({ draft: false });
            } else {
                where.push(publicWhere, notBlockedBy(viewer));
            }
            if (f.kind) {
                if (!NOTE_KINDS.includes(f.kind as NoteKind)) return invalid("invalid_kind");
                where.push({ kind: f.kind });
            }
            if (f.status) {
                if (!NOTE_STATUSES.includes(f.status as NoteStatus)) return invalid("invalid_status");
                where.push({ status: f.status });
            }
            if (f.tag) {
                const tag = normalizeTag(f.tag);
                if (!tag) return ok({ items: [], nextCursor: null });
                where.push({ tags: { some: { tag: { name: tag } } } });
            }
            if (f.following) {
                if (!viewer) return { ok: false, error: "unauthorized", status: 403 };
                where.push({ author: { followers: { some: { followerId: viewer.id } } } });
            }
            if (f.q !== undefined) {
                const q = f.q.trim().slice(0, LIMITS.query);
                if (!q) return ok({ items: [], nextCursor: null });
                // pg_trgm の GIN が効く(3 文字以上の語)。Prisma の contains は % と _ をそのまま渡すので、ここでエスケープする
                const pattern = escapeLike(q);
                where.push({ OR: [{ title: { contains: pattern, mode: "insensitive" } }, { body: { contains: pattern, mode: "insensitive" } }] });
            }

            // 下書きは直した順、ほかは公開した順
            const key = f.drafts ? "updatedAt" : "publishedAt";
            const cursor = decodeCursor(f.cursor);
            if (cursor) where.push({ OR: [{ [key]: { lt: cursor.at } }, { [key]: cursor.at, id: { lt: cursor.id } }] });

            const items = await summaries({ AND: where }, [{ [key]: "desc" }, { id: "desc" }], limit + 1);
            const more = items.length > limit;
            const page = items.slice(0, limit);
            const last = page.at(-1);
            const lastAt = last && (f.drafts ? last.updatedAt : last.publishedAt);
            return ok({ items: page, nextCursor: more && last && lastAt ? encodeCursor(new Date(lastAt), BigInt(last.id)) : null });
        },

        /** 追試の一覧(公開したもの、古い順) */
        async replications(viewer: Viewer, id: bigint): Promise<Result<NoteSummary[]>> {
            const note = await db.note.findUnique({ where: { id }, select: { authorId: true, draft: true, hiddenAt: true } });
            if (!note) return notFound;
            const hidden = visibility(note, viewer);
            if (hidden) return hidden;
            return ok(
                await summaries(
                    { linkAsTarget: { kind: "replication", sourceId: id }, ...publicWhere, ...notBlockedBy(viewer) },
                    [{ publishedAt: "asc" }, { id: "asc" }],
                ),
            );
        },

        /** 系譜。派生(derivation)を、上へ depth 段、下へ depth 段たどる */
        async lineage(viewer: Viewer, id: bigint, depth = 3): Promise<Result<Lineage>> {
            const self = await db.note.findUnique({ where: { id }, select: { ...refSelect, authorId: true, draft: true, hiddenAt: true } });
            if (!self) return notFound;
            const hidden = visibility(self, viewer);
            if (hidden) return hidden;
            const visible = { ...publicWhere, ...notBlockedBy(viewer) };

            // 上へ。見えないもの(下書き・隠された・ブロックした人の)に当たったら、そこで止める
            const ancestors: NoteRef[] = [];
            let current = id;
            for (let i = 0; i < depth; i++) {
                const link = await db.noteLink.findFirst({
                    where: { targetId: current, kind: "derivation", source: visible },
                    select: { source: { select: refSelect } },
                });
                if (!link) break;
                ancestors.unshift(toRef(link.source));
                current = link.source.id;
            }

            // 下へ。1 段ずつまとめて引く
            const root: LineageNode[] = [];
            let level: { id: bigint; children: LineageNode[] }[] = [{ id, children: root }];
            for (let i = 0; i < depth && level.length > 0; i++) {
                const links = await db.noteLink.findMany({
                    where: { kind: "derivation", sourceId: { in: level.map((n) => n.id) }, target: visible },
                    orderBy: { createdAt: "asc" },
                    select: { sourceId: true, target: { select: refSelect } },
                });
                const next: typeof level = [];
                for (const l of links) {
                    const node: LineageNode = { ...toRef(l.target), children: [] };
                    level.find((n) => n.id === l.sourceId)!.children.push(node);
                    next.push({ id: l.target.id, children: node.children });
                }
                level = next;
            }
            return ok({ ancestors, self: toRef(self), children: root });
        },

        /** 同じタグのノート(関係するもの) */
        async related(viewer: Viewer, id: bigint, limit = 5): Promise<Result<NoteSummary[]>> {
            const note = await db.note.findUnique({ where: { id }, select: { authorId: true, draft: true, hiddenAt: true, tags: { select: { tagId: true } } } });
            if (!note) return notFound;
            const hidden = visibility(note, viewer);
            if (hidden) return hidden;
            if (note.tags.length === 0) return ok([]);
            return ok(
                await summaries(
                    { id: { not: id }, tags: { some: { tagId: { in: note.tags.map((t) => t.tagId) } } }, ...publicWhere, ...notBlockedBy(viewer) },
                    [{ publishedAt: "desc" }, { id: "desc" }],
                    limit,
                ),
            );
        },

        /** 直近 7 日に FAIL になった実験(今も FAIL のもの) */
        async failsThisWeek(viewer: Viewer, limit = 5): Promise<NoteSummary[]> {
            const since = new Date(Date.now() - 7 * DAY);
            return summaries(
                { kind: "experiment", status: "fail", history: { some: { toStatus: "fail", changedAt: { gte: since } } }, ...publicWhere, ...notBlockedBy(viewer) },
                [{ updatedAt: "desc" }, { id: "desc" }],
                limit,
            );
        },

        /** 使われているタグと数(公開していて見えるノートだけ数える) */
        async tags(viewer: Viewer, limit = 100): Promise<TagCount[]> {
            const block = viewer ? Prisma.sql`AND n.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ${viewer.id})` : Prisma.empty;
            return db.$queryRaw<TagCount[]>`
                SELECT t.name AS tag, count(*)::int AS count
                FROM note_tags nt
                JOIN tags t ON t.id = nt.tag_id
                JOIN notes n ON n.id = nt.note_id
                WHERE NOT n.draft AND n.hidden_at IS NULL ${block}
                GROUP BY t.name
                ORDER BY count DESC, t.name
                LIMIT ${limit}`;
        },

        /** メンバー(ハンドルのある、凍結されていない人)。sort=active で書いた数の多い順 */
        async members(sort: "handle" | "active", limit = 200): Promise<Member[]> {
            const rows = await db.user.findMany({
                where: { handle: { not: null }, suspendedAt: null },
                select: { ...authorSelect, bio: true, _count: { select: { notes: { where: publicWhere } } } },
                orderBy: { handle: "asc" },
                take: 1000,
            });
            const members = rows.map((r) => ({ ...toAuthor(r), bio: r.bio, noteCount: r._count.notes }));
            if (sort === "active") members.sort((a, b) => b.noteCount - a.noteCount || a.handle.localeCompare(b.handle));
            return members.slice(0, limit);
        },

        // ---- いいね ----

        async like(viewer: User, id: bigint, on: boolean): Promise<Result<{ liked: boolean; likes: number }>> {
            if (on) {
                const note = await interactable(viewer, id);
                if (!note.ok) return note;
                await db.noteLike.createMany({ data: { userId: viewer.id, noteId: id }, skipDuplicates: true });
            } else {
                // 外すのは、ブロックのあとでもできる
                const note = await db.note.findUnique({ where: { id }, select: { authorId: true, draft: true, hiddenAt: true } });
                if (!note || visibility(note, viewer)) return notFound;
                await db.noteLike.deleteMany({ where: { userId: viewer.id, noteId: id } });
            }
            return ok({ liked: on, likes: await db.noteLike.count({ where: { noteId: id } }) });
        },

        // ---- コメント ----

        async comments(viewer: Viewer, noteId: bigint): Promise<Result<CommentItem[]>> {
            const note = await db.note.findUnique({ where: { id: noteId }, select: { authorId: true, draft: true, hiddenAt: true } });
            if (!note) return notFound;
            const hidden = visibility(note, viewer);
            if (hidden) return hidden;
            const mod = canModerate(viewer);
            const rows = await db.comment.findMany({
                where: { noteId, ...(viewer ? { author: { blockedBy: { none: { blockerId: viewer.id } } } } : {}) },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    authorId: true,
                    body: true,
                    bodyHtml: true,
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                    hiddenAt: true,
                    hiddenReason: true,
                    author: { select: authorSelect },
                },
            });
            return ok(
                rows.map((r): CommentItem => {
                    const mine = viewer?.id === r.authorId;
                    const deleted = r.deletedAt !== null;
                    const isHidden = r.hiddenAt !== null;
                    // 隠したものは、moderator と書いた本人にだけ中身を見せる
                    const showBody = !deleted && (!isHidden || mod || mine);
                    return {
                        id: r.id.toString(),
                        author: toAuthor(r.author),
                        html: showBody ? r.bodyHtml : null,
                        ...(mine && !deleted && !isHidden ? { body: r.body } : {}),
                        createdAt: r.createdAt.toISOString(),
                        updatedAt: r.updatedAt.toISOString(),
                        deleted,
                        hidden: isHidden,
                        ...(isHidden && (mod || mine) && r.hiddenReason ? { hiddenReason: r.hiddenReason } : {}),
                        viewer: { canEdit: mine && !deleted && !isHidden, canModerate: mod && !deleted },
                    };
                }),
            );
        },

        async addComment(viewer: User, noteId: bigint, input: { body?: unknown }): Promise<Result<{ id: string }>> {
            const body = readComment(input.body);
            if (typeof body !== "string") return body;
            const note = await interactable(viewer, noteId);
            if (!note.ok) return note;
            const now = new Date();
            const row = await db.comment.create({
                data: { noteId, authorId: viewer.id, body, bodyHtml: render(body).html, createdAt: now, updatedAt: now },
                select: { id: true },
            });
            return ok({ id: row.id.toString() });
        },

        async editComment(viewer: User, id: bigint, input: { body?: unknown }): Promise<Result<{ id: string }>> {
            const body = readComment(input.body);
            if (typeof body !== "string") return body;
            const row = await db.comment.findUnique({ where: { id }, select: { authorId: true, deletedAt: true, hiddenAt: true } });
            if (!row || row.deletedAt) return notFound;
            if (row.authorId !== viewer.id || row.hiddenAt) return forbidden;
            await db.comment.update({ where: { id }, data: { body, bodyHtml: render(body).html, updatedAt: new Date() } });
            return ok({ id: id.toString() });
        },

        /** 消す。本文を空にして、「削除されました」と出す */
        async deleteComment(viewer: User, id: bigint): Promise<Result<{ deleted: true }>> {
            const row = await db.comment.findUnique({ where: { id }, select: { authorId: true, deletedAt: true } });
            if (!row || row.deletedAt) return notFound;
            if (row.authorId !== viewer.id) return forbidden;
            await db.comment.update({ where: { id }, data: { body: "", bodyHtml: "", deletedAt: new Date() } });
            return ok({ deleted: true as const });
        },

        // ---- moderator ----

        async hideNote(viewer: User, id: bigint, reason: unknown): Promise<Result<{ hidden: boolean }>> {
            const r = readReason(reason);
            if (typeof r !== "string") return r;
            const res = await db.note.updateMany({ where: { id }, data: { hiddenAt: new Date(), hiddenBy: viewer.id, hiddenReason: r } });
            return res.count === 0 ? notFound : ok({ hidden: true });
        },

        async unhideNote(id: bigint): Promise<Result<{ hidden: boolean }>> {
            const res = await db.note.updateMany({ where: { id }, data: { hiddenAt: null, hiddenBy: null, hiddenReason: null } });
            return res.count === 0 ? notFound : ok({ hidden: false });
        },

        async hideComment(viewer: User, id: bigint, reason: unknown): Promise<Result<{ hidden: boolean }>> {
            const r = readReason(reason);
            if (typeof r !== "string") return r;
            const res = await db.comment.updateMany({ where: { id, deletedAt: null }, data: { hiddenAt: new Date(), hiddenBy: viewer.id, hiddenReason: r } });
            return res.count === 0 ? notFound : ok({ hidden: true });
        },

        async unhideComment(id: bigint): Promise<Result<{ hidden: boolean }>> {
            const res = await db.comment.updateMany({ where: { id }, data: { hiddenAt: null, hiddenBy: null, hiddenReason: null } });
            return res.count === 0 ? notFound : ok({ hidden: false });
        },

        /** エディタのプレビュー(保存はしない) */
        preview(body: unknown): Result<{ html: string; toc: TocItem[] }> {
            if (typeof body !== "string") return invalid("invalid");
            if (body.length > LIMITS.noteBody) return invalid("body_too_long");
            const r = render(body);
            return ok({ html: r.html, toc: r.toc });
        },
    };
}

function readComment(value: unknown): string | Fail<string, 400> {
    if (typeof value !== "string" || value.trim() === "") return invalid("body_required");
    if (value.length > LIMITS.comment) return invalid("body_too_long");
    return value.trim();
}

function readReason(value: unknown): string | Fail<string, 400> {
    if (typeof value !== "string" || value.trim() === "") return invalid("reason_required");
    if (value.trim().length > LIMITS.hideReason) return invalid("reason_too_long");
    return value.trim();
}

/** プロフィールの数の欄(公開していて、隠されていないもの) */
export async function countNotes(db: Db, authorId: string): Promise<NoteCounts> {
    const rows = await db.note.groupBy({ by: ["kind", "status"], where: { authorId, ...publicWhere }, _count: { _all: true } });
    const counts: NoteCounts = { experiment: 0, pass: 0, fail: 0, watch: 0, article: 0, memo: 0 };
    for (const r of rows) {
        counts[r.kind as NoteKind] += r._count._all;
        if (r.status) counts[r.status as NoteStatus] += r._count._all;
    }
    return counts;
}

export type NoteStore = ReturnType<typeof createNoteStore>;
