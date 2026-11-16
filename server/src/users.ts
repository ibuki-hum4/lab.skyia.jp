// プロフィールの設定(表示名・自己紹介)と、admin の凍結。
import { avatarUrl } from "./avatar";
import type { Db } from "./db";
import { LIMITS } from "./limits";

export type ProfileSettings = { handle: string | null; displayName: string; bio: string; avatar: string | null };

export type ProfileError = "display_name_required" | "display_name_too_long" | "bio_too_long" | "invalid";

/** 表示名を整える。前後の空白と、改行などの制御文字を取る */
export const cleanDisplayName = (value: string) =>
    // eslint-disable-next-line no-control-regex
    value.replace(/[\u0000-\u001f\u007f]/g, "").trim();

export function createUserStore(db: Db) {
    const settings = async (userId: string): Promise<ProfileSettings | null> => {
        const u = await db.user.findUnique({ where: { id: userId }, select: { handle: true, name: true, bio: true, avatarHash: true } });
        return u ? { handle: u.handle, displayName: u.name, bio: u.bio, avatar: avatarUrl(u.handle, u.avatarHash) } : null;
    };

    return {
        settings,

        /** 表示名と自己紹介を変える。渡したものだけ変える */
        async updateProfile(userId: string, input: { displayName?: unknown; bio?: unknown }): Promise<ProfileSettings | ProfileError> {
            const data: { name?: string; bio?: string } = {};
            if (input.displayName !== undefined) {
                if (typeof input.displayName !== "string") return "invalid";
                const name = cleanDisplayName(input.displayName);
                if (name === "") return "display_name_required";
                if (name.length > LIMITS.displayName) return "display_name_too_long";
                data.name = name;
            }
            if (input.bio !== undefined) {
                if (typeof input.bio !== "string") return "invalid";
                const bio = input.bio.trim();
                if (bio.length > LIMITS.bio) return "bio_too_long";
                data.bio = bio;
            }
            if (Object.keys(data).length > 0) await db.user.update({ where: { id: userId }, data });
            return (await settings(userId))!;
        },

        /** 凍結する・解く。凍結したらセッションを全部消す(すぐにログアウトさせる) */
        async setSuspended(adminId: string, handle: string, on: boolean): Promise<"ok" | "self" | "not_found"> {
            const user = await db.user.findFirst({ where: { handle: { equals: handle, mode: "insensitive" } }, select: { id: true } });
            if (!user) return "not_found";
            if (user.id === adminId) return "self";
            if (on) {
                await db.$transaction([
                    db.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } }),
                    db.session.deleteMany({ where: { userId: user.id } }),
                ]);
            } else {
                await db.user.update({ where: { id: user.id }, data: { suspendedAt: null } });
            }
            return "ok";
        },
    };
}

export type UserStore = ReturnType<typeof createUserStore>;
