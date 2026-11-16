// アイコン画像。PostgreSQL(user_avatars)に置き、/api/users/:handle/avatar で配る。
// ブラウザが正方形に切り抜いて 256px の WebP にしてから送る。サーバーは大きさと中身(先頭のバイト)だけを確かめる。
import { createHash } from "node:crypto";
import type { Db } from "./db";
import { LIMITS } from "./limits";

export type AvatarType = "image/webp" | "image/png" | "image/jpeg";

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));

/**
 * 先頭のバイトから、画像の形式を決める。画像でなければ null。
 * 宣言された Content-Type や拡張子は見ない。
 *
 * WebP のほかに PNG と JPEG も受ける(Safari など、canvas から WebP を作れないブラウザは PNG になる)。
 * GIF と SVG は受けない(動くもの・スクリプトを持てるもの)。
 */
export function sniffImage(bytes: Uint8Array): AvatarType | null {
    // RIFF <4 バイトの長さ> WEBP VP8 / VP8L / VP8X
    if (bytes.length >= 16 && startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8) && startsWith(bytes, ascii("VP8"), 12)) {
        return "image/webp";
    }
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    return null;
}

/** 配信の URL。ハッシュが変われば URL も変わるので、長くキャッシュできる */
export const avatarUrl = (handle: string | null, hash: string | null) =>
    handle && hash ? `/api/users/${encodeURIComponent(handle)}/avatar?v=${hash}` : null;

export type AvatarResult = { ok: true; hash: string } | { ok: false; error: "too_large" | "not_image" | "empty" };

export function createAvatarStore(db: Db) {
    return {
        async save(userId: string, bytes: Uint8Array): Promise<AvatarResult> {
            if (bytes.length === 0) return { ok: false, error: "empty" };
            if (bytes.length > LIMITS.avatarBytes) return { ok: false, error: "too_large" };
            const type = sniffImage(bytes);
            if (!type) return { ok: false, error: "not_image" };
            const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
            const data = new Uint8Array(bytes); // Prisma の Bytes は ArrayBuffer を持つ Uint8Array
            await db.$transaction([
                db.userAvatar.upsert({
                    where: { userId },
                    create: { userId, contentType: type, data, hash },
                    update: { contentType: type, data, hash, updatedAt: new Date() },
                }),
                db.user.update({ where: { id: userId }, data: { avatarHash: hash } }),
            ]);
            return { ok: true, hash };
        },

        async remove(userId: string) {
            await db.$transaction([
                db.userAvatar.deleteMany({ where: { userId } }),
                db.user.update({ where: { id: userId }, data: { avatarHash: null } }),
            ]);
        },

        /** ハンドルから画像を引く(大文字と小文字は区別しない) */
        async get(handle: string) {
            const user = await db.user.findFirst({
                where: { handle: { equals: handle, mode: "insensitive" } },
                select: { avatar: { select: { contentType: true, data: true, hash: true } } },
            });
            return user?.avatar ?? null;
        },
    };
}

export type AvatarStore = ReturnType<typeof createAvatarStore>;
