-- 最初のスキーマ。
--
-- Prisma Migrate が prisma/migrations/ の下を名前の順に 1 回ずつ当てる(`prisma migrate deploy`)。
-- **一度 main に入ったファイルは書き換えない。** 直すときは新しいマイグレーションを足す。
--
-- このファイルは手で書いた。CHECK 制約と lower(handle) の一意インデックスは schema.prisma に書けないので、
-- ここにだけある。次からは `bunx prisma migrate dev --create-only --name xxx` で作り、中身を見てから当てる。
--
-- users・sessions・accounts・auth_flows の 4 つは Better Auth が Prisma を通して読み書きする。
-- 列の名前は schema.prisma の @map で、Better Auth の名前(camelCase)からここの名前に付け替えている。

CREATE TABLE users (
    -- Better Auth が作るランダムな文字列
    id             text        PRIMARY KEY,
    -- @ のハンドル。初回のログインのあと /welcome で決めるので、それまでは NULL
    handle         text,
    -- HoshID の表示名。ログインのたびに上書きする(Better Auth の name)
    display_name   text        NOT NULL DEFAULT '',
    bio            text        NOT NULL DEFAULT '',
    -- HoshID のロールのクレームから決める。ログインのたびに上書きする
    role           text        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
    suspended_at   timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz,
    -- ここから下は Better Auth が要る列。scope に email を入れていないので、email は
    -- `<sub>@hoshid.invalid` の形の仮の値になる(画面にも API にも出さない)
    email          text        NOT NULL UNIQUE,
    email_verified boolean     NOT NULL DEFAULT false,
    image          text,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    -- アプリでも確かめるが、DB でも形を縛っておく(小文字の英数字と _ -、3〜20 文字)
    CHECK (handle IS NULL OR handle ~ '^[a-z0-9_-]{3,20}$')
);

-- 大文字と小文字を区別せずに一意(アプリは小文字にしてから入れるが、念のため lower() で張る)
CREATE UNIQUE INDEX users_handle_lower_key ON users (lower(handle));

-- HoshID のアカウントとのつながり。(provider_id, account_id) が (issuer, subject) に当たる。
-- provider_id は Better Auth の設定の providerId("hoshid")、account_id は ID トークンの sub
CREATE TABLE accounts (
    id                       text        PRIMARY KEY,
    user_id                  text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    provider_id              text        NOT NULL,
    account_id               text        NOT NULL,
    access_token             text,
    refresh_token            text,
    -- ログアウトのとき、HoshID の end_session に id_token_hint として渡す
    id_token                 text,
    access_token_expires_at  timestamptz,
    refresh_token_expires_at timestamptz,
    scope                    text,
    password                 text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, account_id)
);

CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE sessions (
    id           text        PRIMARY KEY,
    -- Cookie に入る値(Cookie では Better Auth が BETTER_AUTH_SECRET で署名を付ける)
    token        text        NOT NULL UNIQUE,
    user_id      text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    -- 使うたびに Better Auth が延ばす(updatedAt)。延ばした時刻を「最後に使った時刻」とする
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    ip_address   text,
    user_agent   text
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- /auth/login から /auth/callback までの間だけ持つもの(Better Auth の verification)。
-- identifier は state のハッシュ、value は nonce・PKCE の verifier・戻り先などを入れた JSON。10 分で切れる
CREATE TABLE auth_flows (
    id         text        PRIMARY KEY,
    identifier text        NOT NULL,
    value      text        NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_flows_identifier_idx ON auth_flows (identifier);
CREATE INDEX auth_flows_expires_at_idx ON auth_flows (expires_at);

CREATE TABLE follows (
    follower_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    followee_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

-- 「この人のフォロワー」を引く向き
CREATE INDEX follows_followee_id_idx ON follows (followee_id);

CREATE TABLE blocks (
    blocker_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    blocked_id text        NOT NULL REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX blocks_blocked_id_idx ON blocks (blocked_id);

-- 骨組みのいいね(SQLite から移したもの)。記事の作りを変える次の PR で見直す
CREATE TABLE post_likes (
    slug  text    PRIMARY KEY,
    count integer NOT NULL DEFAULT 0
);
