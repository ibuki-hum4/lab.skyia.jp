// ノートの表示に使う、小さな関数
import type { NoteKind, NoteRef, NoteStatus } from "../api";

/** /@aki/EXP-006 */
export const noteUrl = (n: Pick<NoteRef, "code" | "author">) => `/@${n.author.handle}/${n.code}`;

/** 編集の URL */
export const editUrl = (n: Pick<NoteRef, "code" | "author">) => `${noteUrl(n)}/edit`;

export const KIND_LABEL: Record<NoteKind, string> = { experiment: "実験", article: "記事", memo: "メモ" };
export const STATUS_LABEL: Record<NoteStatus, string> = { pass: "PASS", fail: "FAIL", watch: "WATCH" };

const pad = (n: number) => String(n).padStart(2, "0");

/** 2026-11-15(ブラウザのタイムゾーン) */
export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 2026-11-15 12:10 */
export function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 11-15 12:10(履歴の欄) */
export function fmtShort(iso: string): string {
    const d = new Date(iso);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 12:31(保存した時刻) */
export function fmtTime(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** API のエラーの中身から、画面に出す文 */
export function errorMessage(error: unknown, fallback = "できませんでした。もう一度お試しください"): string {
    const code = typeof error === "object" && error && "error" in error ? String((error as { error: unknown }).error) : "";
    return ERRORS[code] ?? fallback;
}

const ERRORS: Record<string, string> = {
    title_required: "タイトルを入れてください",
    title_too_long: "タイトルは 100 文字までです",
    body_too_long: "本文が長すぎます",
    body_required: "本文を入れてください",
    invalid_tag: "タグに使えない文字があります(文字・数字と _ - . + だけ、32 文字まで)",
    too_many_tags: "タグは 10 個までです",
    cannot_interact: "この操作はできません",
    no_handle: "先にハンドルを決めてください",
    reason_required: "理由を入れてください",
    reason_too_long: "理由は 200 文字までです",
    display_name_required: "表示名を入れてください",
    display_name_too_long: "表示名は 50 文字までです",
    bio_too_long: "自己紹介は 300 文字までです",
    too_large: "画像が大きすぎます(256KB まで)",
    not_image: "画像として読めませんでした",
    hidden: "このノートは非表示になっています",
    unauthorized: "ログインしてください",
    forbidden: "この操作はできません",
};
