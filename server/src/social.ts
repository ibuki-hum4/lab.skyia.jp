// ユーザー・フォロー・ブロック(PostgreSQL、Prisma)。
import { avatarUrl } from "./avatar";
import type { Db } from "./db";
import { Prisma } from "./generated/prisma/client";
import { checkHandleShape } from "./handle";
import { countNotes } from "./notes";
import type { FollowResult, HandleProblem, Profile, SocialStore, UserSummary } from "./types";

type Tx = Prisma.TransactionClient;

/** 2 人の組でロックを取る(follow と block で同じ鍵。順番をそろえてデッドロックを避ける) */
async function lockPair(tx: Tx, a: string, b: string) {
    const [x, y] = [a, b].sort();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${x}|${y}`}))`;
}

const blockedWhere = (a: string, b: string): Prisma.blockWhereInput => ({
    OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
    ],
});

const summaries = (rows: { handle: string | null; name: string }[]): UserSummary[] =>
    rows.flatMap((r) => (r.handle ? [{ handle: r.handle, displayName: r.name }] : []));

export function createSocialStore(db: Db): SocialStore {
    /** ハンドルからユーザーの id(大文字と小文字は区別しない) */
    const idOf = async (handle: string) =>
        (await db.user.findFirst({ where: { handle: { equals: handle, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;

    /** 相手のハンドルを id にして、自分自身なら "self" */
    const target = async (viewerId: string, handle: string): Promise<{ id: string } | "self" | "not_found"> => {
        const id = await idOf(handle);
        if (id === null) return "not_found";
        if (id === viewerId) return "self";
        return { id };
    };

    const handleProblem = async (handle: string): Promise<HandleProblem | null> => {
        const shape = checkHandleShape(handle);
        if (shape) return shape;
        return (await idOf(handle)) === null ? null : "taken";
    };

    return {
        handleProblem,

        async setHandle(userId, handle) {
            const problem = await handleProblem(handle);
            if (problem) return problem;
            try {
                // handle が null のときだけ入れる(初回だけ)。同時に 2 回来ても 1 回しか入らない
                const res = await db.user.updateMany({ where: { id: userId, handle: null }, data: { handle } });
                return res.count === 0 ? "already" : "ok";
            } catch (err) {
                // 調べたあとに、ほかの人が先に取った(一意制約の違反)
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "taken";
                if ((err as { cause?: { code?: string } })?.cause?.code === "23505") return "taken";
                throw err;
            }
        },

        async profile(handle, viewerId): Promise<Profile | null> {
            const user = await db.user.findFirst({
                where: { handle: { equals: handle, mode: "insensitive" } },
                select: { id: true, handle: true, name: true, bio: true, avatarHash: true, _count: { select: { following: true, followers: true } } },
            });
            if (!user?.handle) return null;

            const profile: Profile = {
                handle: user.handle,
                displayName: user.name,
                bio: user.bio,
                avatar: avatarUrl(user.handle, user.avatarHash),
                counts: await countNotes(db, user.id),
                followingCount: user._count.following,
                followerCount: user._count.followers,
            };
            if (viewerId !== null) {
                const [following, followedBy, blocking] = await Promise.all([
                    db.follow.count({ where: { followerId: viewerId, followeeId: user.id } }),
                    db.follow.count({ where: { followerId: user.id, followeeId: viewerId } }),
                    db.block.count({ where: { blockerId: viewerId, blockedId: user.id } }),
                ]);
                profile.viewer = { following: following > 0, followedBy: followedBy > 0, blocking: blocking > 0 };
            }
            return profile;
        },

        async follow(viewerId, handle): Promise<FollowResult> {
            const t = await target(viewerId, handle);
            if (typeof t === "string") return t;
            // ブロックとの行き違いがないように、確かめてから入れるまでを 1 つのトランザクションにする
            return db.$transaction(async (tx) => {
                await lockPair(tx, viewerId, t.id);
                if ((await tx.block.count({ where: blockedWhere(viewerId, t.id) })) > 0) return "blocked" as const;
                await tx.follow.createMany({ data: { followerId: viewerId, followeeId: t.id }, skipDuplicates: true });
                return "ok" as const;
            });
        },

        async unfollow(viewerId, handle) {
            const t = await target(viewerId, handle);
            if (typeof t === "string") return t;
            await db.follow.deleteMany({ where: { followerId: viewerId, followeeId: t.id } });
            return "ok";
        },

        async block(viewerId, handle) {
            const t = await target(viewerId, handle);
            if (typeof t === "string") return t;
            await db.$transaction(async (tx) => {
                await lockPair(tx, viewerId, t.id);
                await tx.block.createMany({ data: { blockerId: viewerId, blockedId: t.id }, skipDuplicates: true });
                // お互いのフォローを消す
                await tx.follow.deleteMany({
                    where: {
                        OR: [
                            { followerId: viewerId, followeeId: t.id },
                            { followerId: t.id, followeeId: viewerId },
                        ],
                    },
                });
            });
            return "ok";
        },

        async unblock(viewerId, handle) {
            const t = await target(viewerId, handle);
            if (typeof t === "string") return t;
            await db.block.deleteMany({ where: { blockerId: viewerId, blockedId: t.id } });
            return "ok";
        },

        async followers(handle) {
            const id = await idOf(handle);
            if (id === null) return null;
            const rows = await db.follow.findMany({
                where: { followeeId: id },
                orderBy: { createdAt: "desc" },
                select: { follower: { select: { handle: true, name: true } } },
            });
            return summaries(rows.map((r) => r.follower));
        },

        async following(handle) {
            const id = await idOf(handle);
            if (id === null) return null;
            const rows = await db.follow.findMany({
                where: { followerId: id },
                orderBy: { createdAt: "desc" },
                select: { followee: { select: { handle: true, name: true } } },
            });
            return summaries(rows.map((r) => r.followee));
        },

        async blocks(viewerId) {
            const rows = await db.block.findMany({
                where: { blockerId: viewerId },
                orderBy: { createdAt: "desc" },
                select: { blocked: { select: { handle: true, name: true } } },
            });
            return summaries(rows.map((r) => r.blocked));
        },

        async isBlockedBetween(a, b) {
            return (await db.block.count({ where: blockedWhere(a, b) })) > 0;
        },
    };
}
