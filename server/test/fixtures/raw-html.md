---
title: 生の HTML を書いた記事
date: 2026-01-02
tags: [security]
type: post
summary: テスト用
---

## 見出し

<script>alert("xss")</script>

<img src=x onerror="alert(1)">

[危ないリンク](javascript:alert(1))

```ts
const a: number = 1;
```
