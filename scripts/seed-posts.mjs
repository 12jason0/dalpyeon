// 남친톡 고정 글과 예시 글을 넣거나 고칩니다: npm run db:seed (db:migrate 다음에)
// 몇 번을 실행해도 고정 글 3개, 예시 글 3개입니다.
// 고정 글은 작성자가 없고, 예시 글은 로그인할 수 없는 예시 작성자(seed-writer-*)가 씁니다.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 비어 있습니다. .env.local 또는 환경변수에 Neon 연결 문자열을 넣어 주세요.");
  process.exit(1);
}
const read = (name) => JSON.parse(readFileSync(new URL(`../src/lib/content/${name}`, import.meta.url), "utf8"));
const pinned = read("pinned-posts.json");
const examples = read("example-posts.json");
const sql = postgres(url, { max: 1, prepare: false });
// 목록은 최신순이라 앞의 글일수록 시각을 늦춰 ①②③ 순서로 보이게 한다
for (const [i, post] of pinned.entries()) {
  const body = post.body.join("\n\n");
  await sql`
    insert into posts (id, author_id, title, body, pinned, created_at)
    values (${post.id}, null, ${post.title}, ${body}, true, now() - make_interval(secs => ${i}))
    on conflict (id) do update set title = excluded.title, body = excluded.body, pinned = true, updated_at = now()`;
}
// 예시 글의 시각은 처음 넣을 때만 정한다. 다시 실행해도 "3시간 전"이 새로 당겨지지 않는다.
for (const post of examples) {
  const writer = `seed-writer-${post.id}`;
  await sql`
    insert into users (id, role, nickname, community_nickname)
    values (${writer}, 'partner', '예시 작성자', ${post.nickname})
    on conflict (id) do update set community_nickname = excluded.community_nickname`;
  await sql`
    insert into posts (id, author_id, board, title, body, created_at)
    values (${post.id}, ${writer}, ${post.board}, ${post.title}, ${post.body}, now() - make_interval(hours => ${post.hoursAgo}))
    on conflict (id) do update set board = excluded.board, title = excluded.title, body = excluded.body, updated_at = now()`;
}
await sql.end();
console.log(`고정 글 ${pinned.length}개, 예시 글 ${examples.length}개를 준비했습니다.`);
