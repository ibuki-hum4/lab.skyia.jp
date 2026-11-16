-- ノート(実験・記事・メモ)と、それにつながるもの(状態の履歴・追試と派生・コメント・タグ・いいね)。
-- アイコン画像と、moderator の非表示も足す。
--
-- 手で書いた(CHECK 制約・部分インデックス・pg_trgm の GIN は schema.prisma に書けない)。

-- 検索(タイトルと本文の部分一致)に使う。PostgreSQL 13 からは「信頼できる拡張」なので、DB の持ち主が入れられる。
-- 3 文字未満の語ではインデックスが効かない(全件を見る)。件数が増えて遅くなったら pg_bigm を考える
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---- ユーザー ----

-- アイコン画像の中身のハッシュ(先頭 16 文字)。画像がなければ NULL。配信の URL に付けて、キャッシュを効かせる。
-- 画像そのものは user_avatars に分けて置く。users は Better Auth がリクエストのたびに丸ごと読むので、
-- ここに bytea を置くと、毎回 256KB まで読むことになる
ALTER TABLE users ADD COLUMN avatar_hash text;

CREATE TABLE user_avatars (
    user_id      text        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- 先頭のバイトで判定した形式。宣言された Content-Type は使わない
    content_type text        NOT NULL CHECK (content_type IN ('image/webp', 'image/png', 'image/jpeg')),
    data         bytea       NOT NULL CHECK (octet_length(data) <= 262144),
    hash         text        NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---- ノート ----

CREATE TABLE notes (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- experiment(実験)/ article(記事)/ memo(メモ)。作ったあとは変えられない(通し番号が種類ごとなので)
    kind          text        NOT NULL CHECK (kind IN ('experiment', 'article', 'memo')),
    -- 作者・種類ごとの通し番号。表示は EXP-006・POST-002・MEMO-003。消しても詰めない
    number        integer     NOT NULL CHECK (number > 0),
    title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    -- Markdown のまま
    body          text        NOT NULL DEFAULT '' CHECK (char_length(body) <= 50000),
    -- サーバーで HTML にしたもの(保存のときに作る)と、目次・一覧に出す抜き書き
    body_html     text        NOT NULL DEFAULT '',
    toc           jsonb       NOT NULL DEFAULT '[]',
    excerpt       text        NOT NULL DEFAULT '',
    draft         boolean     NOT NULL DEFAULT true,
    -- 実験だけが持つ(pass / fail / watch)
    status        text        CHECK (status IN ('pass', 'fail', 'watch')),
    -- WATCH にした時刻(「観察 ◯ 日目」に使う)。WATCH でないときは NULL
    watch_since   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- 初めて公開した時刻。一覧はこの新しい順
    published_at  timestamptz,
    -- moderator 以上が隠したとき。消さずに隠す(作者と moderator には見える)
    hidden_at     timestamptz,
    hidden_by     text        REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
    hidden_reason text,
    UNIQUE (author_id, kind, number),
    CHECK ((kind = 'experiment') = (status IS NOT NULL)),
    CHECK ((status IS NOT DISTINCT FROM 'watch') = (watch_since IS NOT NULL)),
    CHECK (draft OR published_at IS NOT NULL),
    CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL))
);

-- 一覧(公開済み・新しい順)。カーソルは (published_at, id)
CREATE INDEX notes_feed_idx ON notes (published_at DESC, id DESC) WHERE NOT draft AND hidden_at IS NULL;
CREATE INDEX notes_author_idx ON notes (author_id, published_at DESC, id DESC);
-- 検索。ILIKE '%語%' に効く
CREATE INDEX notes_title_trgm_idx ON notes USING gin (title gin_trgm_ops);
CREATE INDEX notes_body_trgm_idx ON notes USING gin (body gin_trgm_ops);

-- 通し番号を配る。INSERT ... ON CONFLICT DO UPDATE ... RETURNING の 1 文で、同時に作っても重ならない
CREATE TABLE note_counters (
    author_id text    NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    kind      text    NOT NULL CHECK (kind IN ('experiment', 'article', 'memo')),
    last      integer NOT NULL,
    PRIMARY KEY (author_id, kind)
);

-- 実験の状態が変わるたびに 1 行。作ったときは from_status が NULL
CREATE TABLE note_status_history (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note_id     bigint      NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    from_status text        CHECK (from_status IN ('pass', 'fail', 'watch')),
    to_status   text        NOT NULL CHECK (to_status IN ('pass', 'fail', 'watch')),
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX note_status_history_note_idx ON note_status_history (note_id, changed_at);
-- 今週の FAIL
CREATE INDEX note_status_history_fail_idx ON note_status_history (changed_at) WHERE to_status = 'fail';

-- 追試(replication)と派生(derivation)。source が元の実験、target が新しいノート。
-- 1 つのノートは、どれか 1 つの実験の追試か派生にしかならない
CREATE TABLE note_links (
    id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind       text        NOT NULL CHECK (kind IN ('replication', 'derivation')),
    source_id  bigint      NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    target_id  bigint      NOT NULL UNIQUE REFERENCES notes (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_id <> target_id)
);

CREATE INDEX note_links_source_idx ON note_links (source_id, kind);

-- ---- コメント ----

CREATE TABLE comments (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    note_id       bigint      NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    author_id     text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    body          text        NOT NULL CHECK (char_length(body) <= 2000),
    body_html     text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- 消したら本文を空にして、この時刻を入れる(「削除されました」と出す)
    deleted_at    timestamptz,
    hidden_at     timestamptz,
    hidden_by     text        REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
    hidden_reason text,
    CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL))
);

CREATE INDEX comments_note_idx ON comments (note_id, created_at, id);

-- ---- タグ ----

CREATE TABLE tags (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- 小文字にそろえて一意
    name text   NOT NULL UNIQUE CHECK (name = lower(name) AND char_length(name) BETWEEN 1 AND 32)
);

-- 1 つのノートに 10 個まで(アプリで確かめる)
CREATE TABLE note_tags (
    note_id bigint NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag_id  bigint NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX note_tags_tag_idx ON note_tags (tag_id);

-- ---- いいね ----

CREATE TABLE note_likes (
    user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    note_id    bigint      NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, note_id)
);

CREATE INDEX note_likes_note_idx ON note_likes (note_id);
