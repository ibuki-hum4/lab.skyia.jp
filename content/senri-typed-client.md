---
title: Senri の型付きクライアントで API を呼ぶ
date: 2026-11-10
tags: [senri, typescript]
type: post
summary: defineRoutes で書いた API の型を、Vue の画面からそのまま使う方法のメモ。
---

サーバーのルートを `defineRoutes` で表にしておくと、その型をクライアントに渡せます。

## サーバー側

```ts
import { defineRoutes } from "@senrijs/senri";

export const routes = defineRoutes({
    "GET /api/hello/:name": ({ name }) => ({ message: `こんにちは、${name}` }),
});

export type Api = typeof routes;
```

## クライアント側

```ts
import { client } from "@senrijs/senri/client";
import type { Api } from "./server/routes";

const api = client<Api>(location.origin);
const res = await api("GET /api/hello/:name", { params: { name: "やーはり" } });
if (res.ok) console.log(res.data.message); // string の型が付く
```

`import type` なので、サーバーのコードは画面のバンドルに入りません。

## よかったところ

- パスを書き間違えると型エラーになる
- 戻り値の形を変えると、使っている画面が型エラーになる
