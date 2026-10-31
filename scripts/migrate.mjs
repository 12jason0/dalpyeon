// 배포 DB(Neon)에 테이블을 만들거나 갱신합니다: npm run db:migrate
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 비어 있습니다. .env.local 또는 환경변수에 Neon 연결 문자열을 넣어 주세요.");
  process.exit(1);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
await client.end();
console.log("DB 테이블 준비 완료");
