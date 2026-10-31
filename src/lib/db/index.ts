import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** 로컬 개발·테스트용: 브라우저 없이 도는 내장 Postgres(PGlite). dir 없으면 메모리. */
export async function createLocalDb(dir?: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

/** 배포용: Neon 등 실제 PostgreSQL. 테이블은 `npm run db:migrate`로 만든다. */
export async function createRemoteDb(url: string): Promise<DB> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // Neon pooled 연결(pgbouncer)은 prepared statement를 지원하지 않는다.
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema }) as unknown as DB;
}

const globalForDb = globalThis as unknown as { dalpyeonDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!globalForDb.dalpyeonDb) {
    const url = process.env.DATABASE_URL;
    globalForDb.dalpyeonDb = url ? createRemoteDb(url) : createLocalDb(path.join(process.cwd(), ".pglite"));
  }
  return globalForDb.dalpyeonDb;
}
