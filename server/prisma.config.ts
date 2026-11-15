// Prisma 7 の設定(HoshID と同じ形)。Prisma 7 の CLI は .env を自分では読まないので、ここで読む。
// .env がなくても失敗しない(本番とテストは環境変数で渡す)。
import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    // マイグレーションが使う接続。実行時の接続は src/db.ts のドライバアダプタ(@prisma/adapter-pg)。
    // `prisma generate`(postinstall・typecheck)は接続しないので、ないときは仮の値にする。
    // migrate のときに DATABASE_URL がなければ、この仮の値につなごうとして失敗する
    datasource: { url: process.env.DATABASE_URL ?? "postgresql://DATABASE_URL-is-not-set@localhost/unset" },
});
