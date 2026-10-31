// 커뮤니티 운영자를 지정합니다: npm run admin:grant -- 이메일
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const email = process.argv[2]?.trim().toLowerCase();
if (!url) {
  console.error("DATABASE_URL이 비어 있습니다. .env.local 또는 환경변수에 Neon 연결 문자열을 넣어 주세요.");
  process.exit(1);
}
if (!email) {
  console.error("사용법: npm run admin:grant -- 이메일");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false });
const rows = await sql`update users set is_admin = true where email = ${email} returning id`;
await sql.end();
if (!rows.length) {
  console.error("그 이메일로 가입한 계정이 없습니다.");
  process.exit(1);
}
console.log("운영자로 지정했습니다.");
