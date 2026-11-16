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

export type RenderResult = {
    html: string;
    toc: TocItem[];
    /** 一覧に出す抜き書き(段落の文字だけ。見出しやコードは入れない) */
    excerpt: string;
};
export type Renderer = (markdown: string) => RenderResult;

export type RendererOptions = {
    /**
     * 利用者が書いたもの(ノート・コメント)。次のようにする:
     * - リンクは http・https・mailto と、サイトの中だけ(`javascript:`・`data:` などは通さない)
     * - 外へのリンクに `rel="noopener noreferrer ugc"` を付ける
     * - 見出しの id の前に `h-` を付ける(ページの部品の id と重ならないように)
     */
    ugc?: boolean;
};

/** 抜き書きの長さ */
const EXCERPT_LENGTH = 140;

/** 外へのリンクか(http・https と、スキームなしの //) */
const isExternal = (href: string) => /^(https?:)?\/\//i.test(href);

/** 利用者のリンクに許すもの。スキームが付いていれば http・https・mailto だけ。相対パスと # はそのまま */
export function isSafeUserLink(url: string): boolean {
    // 制御文字や空白をはさんで「java\tscript:」のようにしたもの(ブラウザは読み飛ばす)も、スキームとして見る
    // eslint-disable-next-line no-control-regex
    const squashed = url.toLowerCase().replace(/[\u0000- \u007f]/g, "");
    if (/^[a-z][a-z0-9+.-]*:/.test(squashed)) return /^(https?|mailto):/.test(squashed);
    return true;
}

/**
 * Markdown を HTML にする関数を作る。起動時に 1 回だけ呼ぶ。
 *
 * - `html: false`: Markdown の中の生の HTML は通さず、文字としてエスケープする
 * - リンクの `javascript:` などは markdown-it が既定で通さない(`ugc` ではさらに絞る)
 * - 見出し(h2〜h4)に id を付けて、目次を作る
 */
export async function createRenderer(options: RendererOptions = {}): Promise<Renderer> {
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

    if (options.ugc) {
        md.validateLink = isSafeUserLink;
        const defaultLinkOpen =
            md.renderer.rules.link_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
        md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
            const token = tokens[idx]!;
            if (isExternal(String(token.attrGet("href") ?? ""))) token.attrSet("rel", "noopener noreferrer ugc");
            return defaultLinkOpen(tokens, idx, opts, env, self);
        };
    }
    const idPrefix = options.ugc ? "h-" : "";

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
            const id = idPrefix + slugify(text, used);
            token.attrSet("id", id);
            if (depth >= 2 && depth <= 4) toc.push({ depth, id, text });
        });

        // 抜き書き: 段落の中の文字だけをつなぐ
        let excerpt = "";
        tokens.forEach((token, i) => {
            if (excerpt.length > EXCERPT_LENGTH || token.type !== "inline" || tokens[i - 1]?.type !== "paragraph_open") return;
            const text = (token.children ?? [])
                .map((t) => (t.type === "text" || t.type === "code_inline" ? t.content : t.type === "softbreak" ? " " : ""))
                .join("");
            excerpt += (excerpt ? " " : "") + text;
        });
        excerpt = excerpt.replace(/\s+/g, " ").trim();
        if (excerpt.length > EXCERPT_LENGTH) excerpt = `${excerpt.slice(0, EXCERPT_LENGTH)}…`;

        return { html: md.renderer.render(tokens, md.options, env), toc, excerpt };
    };
}
