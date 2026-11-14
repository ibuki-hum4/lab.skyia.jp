---
title: Kubernetes の上で SQLite を使ってみる
date: 2026-11-12
tags: [kubernetes, sqlite]
type: experiment
status: observing
summary: いいねの数を SQLite に保存して、PVC の上で困らずに動くかを見ている。
---

## 目的

小さいサイトなら、データベースのサーバーを立てずに SQLite で足りるのではないか、を確かめる。

## やったこと

- `bun:sqlite` で `/data/lab.db` に保存する
- `/data` は PersistentVolumeClaim をつなぐ
- 同じファイルを 2 つの Pod から書かないように、レプリカは 1、更新は `Recreate` にする

```sql
CREATE TABLE IF NOT EXISTS likes (slug TEXT PRIMARY KEY, count INTEGER NOT NULL);
```

## 気になっていること

- 更新のあいだ、少しだけ止まる(`Recreate` なので)
- バックアップをどうするか

## 結果

まだ観察中。
