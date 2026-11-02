// 남친톡 고정 글을 넣거나 고칩니다: npm run db:seed:pinned
// 몇 번을 실행해도 글은 3개입니다. 작성자가 없는 글이라 사용자를 만들지 않습니다.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 비어 있습니다. .env.local 또는 환경변수에 Neon 연결 문자열을 넣어 주세요.");
  process.exit(1);
}
const list = JSON.parse(readFileSync(new URL("../src/lib/content/pinned-posts.json", import.meta.url), "utf8"));
const sql = postgres(url, { max: 1, prepare: false });
// 목록은 최신순이라 앞의 글일수록 시각을 늦춰 ①②③ 순서로 보이게 한다
for (const [i, post] of list.entries()) {
  const body = post.body.join("\n\n");
  await sql`
    insert into posts (id, author_id, title, body, pinned, created_at)
    values (${post.id}, null, ${post.title}, ${body}, true, now() - make_interval(secs => ${i}))
    on conflict (id) do update set title = excluded.title, body = excluded.body, pinned = true, updated_at = now()`;
}
await sql.end();
console.log(`고정 글 ${list.length}개를 준비했습니다.`);
