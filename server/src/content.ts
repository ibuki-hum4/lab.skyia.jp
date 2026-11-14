import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Renderer } from "./markdown";
import type { ExperimentStatus, LoadedPost, PostType } from "./types";

const POST_TYPES: readonly PostType[] = ["post", "experiment"];
const STATUSES: readonly ExperimentStatus[] = ["success", "failure", "observing"];
/** ファイル名がそのまま URL になるので、使える文字を決めておく */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** 先頭の `---` で囲まれた frontmatter と、残りの本文に分ける */
function splitFrontmatter(text: string): { data: unknown; body: string } {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!match) return { data: {}, body: text };
    return { data: Bun.YAML.parse(match[1]!), body: text.slice(match[0].length) };
}

/** YAML の日付は書き方によって文字列にも Date にもなるので、YYYY-MM-DD にそろえる */
function toDateString(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return null;
}

/**
 * frontmatter を確かめて、記事の形にする。書き間違いは起動時に止めて知らせる
 * (気づかずに公開されるより、起動しないほうが早く気づける)。
 */
function parsePost(slug: string, text: string, render: Renderer): LoadedPost {
    const { data, body } = splitFrontmatter(text);
    const fm = (data ?? {}) as Record<string, unknown>;
    const fail = (message: string): never => {
        throw new Error(`content/${slug}.md: ${message}`);
    };

    const title = typeof fm.title === "string" && fm.title.trim() ? fm.title : fail("title がありません");
    const date = toDateString(fm.date) ?? fail("date は YYYY-MM-DD で書いてください");
    const type = POST_TYPES.includes(fm.type as PostType)
        ? (fm.type as PostType)
        : fail(`type は ${POST_TYPES.join(" / ")} のどれかにしてください`);
    const tags = Array.isArray(fm.tags) && fm.tags.every((t) => typeof t === "string")
        ? (fm.tags as string[])
        : fm.tags === undefined
          ? []
          : fail("tags は文字列の配列にしてください");
    const summary = typeof fm.summary === "string" ? fm.summary : "";

    let status: ExperimentStatus | undefined;
    if (type === "experiment") {
        status = STATUSES.includes(fm.status as ExperimentStatus)
            ? (fm.status as ExperimentStatus)
            : fail(`実験の status は ${STATUSES.join(" / ")} のどれかにしてください`);
    } else if (fm.status !== undefined) {
        fail("status は実験(type: experiment)のときだけ書けます");
    }

    const { html, toc } = render(body);
    return { slug, title, date, tags, type, ...(status ? { status } : {}), summary, html, toc, source: body };
}

/** content/ の Markdown を全部読んで、新しい順に並べる */
export async function loadPosts(dir: string, render: Renderer): Promise<LoadedPost[]> {
    const files = (await readdir(dir)).filter((name) => name.endsWith(".md"));
    const posts: LoadedPost[] = [];
    for (const file of files) {
        const slug = file.slice(0, -".md".length);
        if (!SLUG.test(slug)) throw new Error(`content/${file}: ファイル名は英小文字・数字・ハイフンにしてください`);
        posts.push(parsePost(slug, await Bun.file(join(dir, file)).text(), render));
    }
    // 新しい順。同じ日なら slug の順にして、毎回同じ並びにする
    return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
