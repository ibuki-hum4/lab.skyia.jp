// PostgreSQL への接続(Prisma 7 + @prisma/adapter-pg)。
// スキーマは prisma/schema.prisma、クライアントは `bunx prisma generate` で src/generated/prisma に作る。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type Db = PrismaClient;

/** つなぐのは最初のクエリのとき。DB が遅れて立ち上がっても、起動は止めない */
export function openDb(url: string): Db {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10 }) });
}
