---
title: lab.skyia.jp をはじめました
date: 2026-11-14
tags: [お知らせ, vue, senri]
type: post
summary: 実験室と技術ブログをいっしょにしたサイトを作りました。どんな仕組みで動いているかをまとめます。
---

このサイトは、試してみたことを置いておく「実験室」と、わかったことを書く「技術ブログ」をいっしょにしたものです。

## 仕組み

- **サーバー:** [Senri](https://github.com/Senrijs/Senri) を Bun で動かしています
- **画面:** Vue 3 + Vite の SPA です
- **置き場所:** Docker のイメージにして、Kubernetes(ArgoCD)で動かしています

記事は Markdown で書いて、サーバーが起動するときに HTML にします。

## 記事の書き方

`content/` に Markdown のファイルを置くだけです。ファイル名が URL になります。

```yaml
---
title: タイトル
date: 2026-11-14
tags: [vue]
type: post
summary: 一覧に出す短い説明
---
```

## これから

画面は Vue の勉強をかねて、少しずつ作っていきます。
