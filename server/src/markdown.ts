import MarkdownIt from "markdown-it";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { TocItem } from "./types";

/** コードの色付けに使うテーマ */
const THEME = "github-dark";

/**
 * shiki を、使う言語だけで用意する。
 * 全部の言語を読むと起動が遅く、Docker のイメージも大きくなるので、ここに足していく形にしている。
 * WebAssembly を使わない JavaScript の正規表現エンジンにして、ビルドしたファイル 1 つで動くようにしている。
 */
let highlighterPromise: Promise<HighlighterCore> | undefined;
function getHighlighter(): Promise<HighlighterCore> {
    // 作るのに数秒かかるので、プロセスで 1 つだけ作って使い回す
    highlighterPromise ??= createHighlighterCore({
        themes: [import("shiki/themes/github-dark.mjs")],
        langs: [
            import("shiki/langs/typescript.mjs"),
            import("shiki/langs/javascript.mjs"),
            import("shiki/langs/tsx.mjs"),
            import("shiki/langs/json.mjs"),
            import("shiki/langs/shellscript.mjs"),
            import("shiki/langs/yaml.mjs"),
            import("shiki/langs/vue.mjs"),
            import("shiki/langs/html.mjs"),
            import("shiki/langs/css.mjs"),
            import("shiki/langs/sql.mjs"),
            import("shiki/langs/dockerfile.mjs"),
            import("shiki/langs/markdown.mjs"),
            import("shiki/langs/diff.mjs"),
            import("shiki/langs/python.mjs"),
            import("shiki/langs/go.mjs"),
        ],
        engine: createJavaScriptRegexEngine(),
    });
    return highlighterPromise;
}

/**
 * 見出しの文字から id を作る。日本語はそのまま残す(`#はじめに` で飛べる)。
 * 同じ見出しが 2 回出たら `-1`、`-2` を付けて重ならないようにする。
 */
function slugify(text: string, used: Map<string, number>): string {
    const base =
        text
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s+/g, "-") || "section";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
}

export type RenderResult = { html: string; toc: TocItem[] };
export type Renderer = (markdown: string) => RenderResult;

/**
 * Markdown を HTML にする関数を作る。起動時に 1 回だけ呼ぶ。
 *
 * - `html: false`: Markdown の中の生の HTML は通さず、文字としてエスケープする(自分の記事でも念のため)
 * - リンクの `javascript:` などは markdown-it が既定で通さない
 * - 見出し(h2〜h4)に id を付けて、目次を作る
 */
export async function createRenderer(): Promise<Renderer> {
    const highlighter = await getHighlighter();
    const languages = new Set(highlighter.getLoadedLanguages());

    const md = new MarkdownIt({
        html: false,
        linkify: true,
        highlight(code, lang) {
            // 知らない言語は色を付けない(空文字を返すと markdown-it がエスケープしてくれる)
            if (!lang || !languages.has(lang)) return "";
            return highlighter.codeToHtml(code, { lang, theme: THEME });
        },
    });

    return (markdown) => {
        const env = {};
        const tokens = md.parse(markdown, env);
        const toc: TocItem[] = [];
        const used = new Map<string, number>();

        tokens.forEach((token, i) => {
            if (token.type !== "heading_open") return;
            const depth = Number(token.tag.slice(1));
            // 見出しの中身は、次のトークン(inline)に入っている
            const text = (tokens[i + 1]?.children ?? [])
                .filter((t) => t.type === "text" || t.type === "code_inline")
                .map((t) => t.content)
                .join("");
            const id = slugify(text, used);
            token.attrSet("id", id);
            if (depth >= 2 && depth <= 4) toc.push({ depth, id, text });
        });

        return { html: md.renderer.render(tokens, md.options, env), toc };
    };
}
