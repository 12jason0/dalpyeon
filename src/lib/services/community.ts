import { randomInt, randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { isBoard, POST_BODY_MAX } from "../boards";
import type { DB } from "../db";
import { blocks, comments, postLikes, posts, reports, users, type Board } from "../db/schema";
import { fail } from "../errors";
import { limit, sha256, type User } from "./auth";
import { activeCouple } from "./couples";

export const PAGE_SIZE = 20;
const MAX_PAGES = 50;
export const REPORTS_TO_HIDE = 3;
export const WRITE_LIMIT = 5;
export const WRITE_WINDOW_SECONDS = 600;
export const WITHDRAWN_NAME = "탈퇴한 사용자";
export const TEAM_NAME = "디어데이 운영팀";
const PREVIEW_LENGTH = 120;

export type Target = { kind: "post" | "comment"; id: string };
export type Access = { admin: boolean; member: boolean; nickname: string | null };

// 화면에 내려가는 값에는 작성자 id·이메일·앱 닉네임을 넣지 않는다. 내 글인지만 mine으로 알린다.
// 글을 쓰려면 닉네임이 있어야 하므로, 작성자 닉네임이 비어 있으면 탈퇴한 사람이다.
export type PostRow = {
  id: string; board: Board; title: string; preview: string; nickname: string; commentCount: number; likeCount: number;
  createdAt: Date; hidden: boolean; mine: boolean; pinned: boolean;
};
export type CommentView = { id: string; body: string; nickname: string; createdAt: Date; hidden: boolean; mine: boolean; replies: CommentView[] };
export type PostView = PostRow & { body: string; liked: boolean; comments: CommentView[] };

type MaybeSession = User & { isAdmin?: boolean; communityNickname?: string | null };

/**
 * 활성 연결이 있는 파트너만 회원이다. 역할과 연결을 매번 함께 확인한다.
 * 페이지에서는 세션 조회가 이미 읽은 운영자 여부·닉네임을 쓰고, 그 값이 없는 호출(서비스 테스트 등)에서만 다시 읽는다.
 */
export const communityAccess = cache(async (db: DB, user: MaybeSession): Promise<Access> => {
  const [row, couple] = await Promise.all([
    "isAdmin" in user && "communityNickname" in user
      ? { isAdmin: user.isAdmin ?? false, nickname: user.communityNickname ?? null }
      : db.select({ isAdmin: users.isAdmin, nickname: users.communityNickname }).from(users).where(eq(users.id, user.id)).then(([r]) => r),
    user.role === "partner" ? activeCouple(db, user.id) : null,
  ]);
  return { admin: row?.isAdmin ?? false, member: couple?.partnerId === user.id, nickname: row?.nickname ?? null };
});

async function requireReader(db: DB, user: User) {
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) fail("연결된 파트너만 볼 수 있어요", 403);
  return access;
}

async function requireMember(db: DB, user: User) {
  const access = await communityAccess(db, user);
  if (!access.member) fail("연결된 파트너만 쓸 수 있어요", 403);
  return access;
}

async function requireWriter(db: DB, user: User) {
  const access = await requireMember(db, user);
  if (!access.nickname) fail("먼저 이용 규칙에 동의해 주세요", 403);
}

async function requireAdmin(db: DB, user: User) {
  if (!(await communityAccess(db, user)).admin) fail("운영자만 쓸 수 있어요", 403);
}

async function nicknameTaken(db: DB, nickname: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.communityNickname, nickname)).limit(1);
  return Boolean(row);
}

async function randomNickname(db: DB): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const nickname = `편-${randomInt(1000, 10000)}`;
    if (!(await nicknameTaken(db, nickname))) return nickname;
  }
  return `편-${randomInt(100000, 1000000)}`; // 네 자리가 붐비면 자리를 늘린다
}

/** 이용 규칙 동의. 닉네임을 비워 두면 무작위로 정한다. 이미 동의했으면 아무것도 바꾸지 않는다. */
export async function agreeToRules(db: DB, user: User, rawNickname: unknown) {
  const access = await requireMember(db, user);
  if (access.nickname) return access.nickname;
  const typed = String(rawNickname ?? "").trim();
  if (typed && (typed.length < 2 || typed.length > 12)) fail("닉네임은 2~12자로 적어 주세요");
  if (/운영자|운영팀|관리자|탈퇴|디어데이|우리주기/.test(typed)) fail("쓸 수 없는 닉네임이에요");
  if (typed && (await nicknameTaken(db, typed))) fail("이미 쓰고 있는 닉네임이에요", 409);
  const nickname = typed || (await randomNickname(db));
  await db.update(users).set({ communityNickname: nickname }).where(and(eq(users.id, user.id), isNull(users.communityNickname)));
  return nickname;
}

/** 나와 어느 쪽으로든 차단 관계인 사람들. */
async function blockedIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.select().from(blocks).where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

/** 숨겨지지 않았고 차단 관계도 아닌 글. 운영자라도 쓰기 동작에는 이 기준을 그대로 쓴다. */
async function openPost(db: DB, userId: string, postId: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post || post.hidden || (post.authorId && (await blockedIds(db, userId)).includes(post.authorId))) fail("글을 찾을 수 없어요", 404);
  return post;
}

async function openComment(db: DB, userId: string, commentId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment || comment.hidden || (await blockedIds(db, userId)).includes(comment.authorId)) fail("댓글을 찾을 수 없어요", 404);
  // 숨긴 글의 댓글, 보이지 않는 댓글의 답글은 함께 닫힌다
  if (comment.parentId) await openComment(db, userId, comment.parentId);
  else await openPost(db, userId, comment.postId);
  return comment;
}

const parent = alias(comments, "parent");

/** 운영자가 아니면: 숨겨지지 않았고 차단 관계가 아닌 댓글. 답글은 원 댓글도 그래야 한다. parent를 left join해서 쓴다. */
const visibleComments = (blocked: string[], admin: boolean) => (admin ? [] : [
  eq(comments.hidden, false),
  notInArray(comments.authorId, blocked),
  or(isNull(comments.parentId), and(eq(parent.hidden, false), notInArray(parent.authorId, blocked))),
]);

async function commentCounts(db: DB, postIds: string[], blocked: string[], admin: boolean) {
  if (!postIds.length) return new Map<string, number>();
  const rows = await db.select({ postId: comments.postId, total: count() }).from(comments)
    .leftJoin(parent, eq(parent.id, comments.parentId))
    .where(and(inArray(comments.postId, postIds), ...visibleComments(blocked, admin)))
    .groupBy(comments.postId);
  return new Map(rows.map((r) => [r.postId, r.total]));
}

async function likeCounts(db: DB, postIds: string[]) {
  if (!postIds.length) return new Map<string, number>();
  const rows = await db.select({ postId: postLikes.postId, total: count() }).from(postLikes)
    .where(inArray(postLikes.postId, postIds)).groupBy(postLikes.postId);
  return new Map(rows.map((r) => [r.postId, r.total]));
}

const authorName = (pinned: boolean, nickname: string | null) => (pinned ? TEAM_NAME : nickname ?? WITHDRAWN_NAME);

/** 고정 글이 먼저, 그다음 최신순으로 page쪽까지 모두 돌려준다. 더보기는 ?page=만 늘리면 된다. 말머리를 고르면 고정 글과 그 말머리 글만. */
export async function listPosts(db: DB, user: User, page = 1, board?: unknown): Promise<{ posts: PostRow[]; hasMore: boolean }> {
  const { admin } = await requireReader(db, user);
  const blocked = admin ? [] : await blockedIds(db, user.id);
  const shown = Math.min(Math.max(1, Math.floor(page) || 1), MAX_PAGES) * PAGE_SIZE;
  const rows = await db.select({
    id: posts.id, board: posts.board, title: posts.title, body: posts.body, nickname: users.communityNickname,
    createdAt: posts.createdAt, hidden: posts.hidden, authorId: posts.authorId, pinned: posts.pinned,
  }).from(posts).leftJoin(users, eq(users.id, posts.authorId))
    .where(and(
      admin ? undefined : and(eq(posts.hidden, false), or(isNull(posts.authorId), notInArray(posts.authorId, blocked))),
      isBoard(board) ? or(eq(posts.pinned, true), eq(posts.board, board)) : undefined,
    ))
    .orderBy(desc(posts.pinned), desc(posts.createdAt), desc(posts.id)).limit(shown + 1);
  const page1 = rows.slice(0, shown);
  const ids = page1.map((r) => r.id);
  const [counts, likes] = await Promise.all([commentCounts(db, ids, blocked, admin), likeCounts(db, ids)]);
  return {
    hasMore: rows.length > shown,
    posts: page1.map(({ authorId, nickname, body, ...r }) => ({
      ...r, preview: body.slice(0, PREVIEW_LENGTH), nickname: authorName(r.pinned, nickname),
      commentCount: counts.get(r.id) ?? 0, likeCount: likes.get(r.id) ?? 0, mine: authorId === user.id,
    })),
  };
}

/** 내가 쓴 글. 연결을 끊었거나 글이 숨겨져도 지울 수 있도록 접근 조건 없이 보여준다. */
export const myPosts = cache(async (db: DB, user: User): Promise<Pick<PostRow, "id" | "title" | "createdAt" | "hidden">[]> => {
  return db.select({ id: posts.id, title: posts.title, createdAt: posts.createdAt, hidden: posts.hidden })
    .from(posts).where(eq(posts.authorId, user.id)).orderBy(desc(posts.createdAt));
});

export async function getPost(db: DB, user: User, postId: string): Promise<PostView> {
  const { admin } = await requireReader(db, user);
  const blocked = admin ? [] : await blockedIds(db, user.id);
  const [row] = await db.select({ post: posts, nickname: users.communityNickname })
    .from(posts).leftJoin(users, eq(users.id, posts.authorId)).where(eq(posts.id, postId)).limit(1);
  if (!row || (!admin && (row.post.hidden || (row.post.authorId && blocked.includes(row.post.authorId))))) fail("글을 찾을 수 없어요", 404);
  const [likes, [mineLike]] = await Promise.all([
    likeCounts(db, [postId]),
    db.select({ postId: postLikes.postId }).from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, user.id))),
  ]);
  const list = await db.select({ comment: comments, nickname: users.communityNickname })
    .from(comments).innerJoin(users, eq(users.id, comments.authorId))
    .leftJoin(parent, eq(parent.id, comments.parentId))
    .where(and(eq(comments.postId, postId), ...visibleComments(blocked, admin)))
    .orderBy(comments.createdAt);
  const view = ({ comment: c, nickname }: (typeof list)[number]): CommentView => ({
    id: c.id, body: c.body, createdAt: c.createdAt, hidden: c.hidden, mine: c.authorId === user.id, nickname: nickname ?? WITHDRAWN_NAME,
    replies: list.filter((r) => r.comment.parentId === c.id).map(view),
  });
  const { id, board, title, body, createdAt, hidden, authorId, pinned } = row.post;
  return {
    id, board, title, body, preview: body.slice(0, PREVIEW_LENGTH), createdAt, hidden, pinned, mine: authorId === user.id,
    nickname: authorName(pinned, row.nickname), commentCount: list.length, likeCount: likes.get(postId) ?? 0, liked: Boolean(mineLike),
    comments: list.filter((c) => !c.comment.parentId).map(view),
  };
}

function cleanText(value: unknown, label: string, max: number) {
  const text = String(value ?? "").trim();
  if (text.length < 1 || text.length > max) fail(`${label}은 1~${max}자로 적어 주세요`);
  return text;
}

type PostInput = { board?: unknown; title: unknown; body: unknown };

function cleanPost(input: PostInput) {
  const board = input.board ?? "question";
  if (!isBoard(board)) fail("말머리를 골라 주세요");
  return { board, title: cleanText(input.title, "제목", 60), body: cleanText(input.body, "본문", POST_BODY_MAX) };
}

export async function createPost(db: DB, user: User, input: PostInput) {
  await requireWriter(db, user);
  const values = cleanPost(input);
  await limit(db, "community-post", user.id, WRITE_LIMIT, WRITE_WINDOW_SECONDS);
  const id = randomUUID();
  await db.insert(posts).values({ id, authorId: user.id, ...values });
  return id;
}

export async function updatePost(db: DB, user: User, postId: string, input: PostInput) {
  await requireMember(db, user);
  const post = await openPost(db, user.id, postId);
  if (post.authorId !== user.id) fail("내가 쓴 글만 고칠 수 있어요", 403);
  await db.update(posts).set({ ...cleanPost({ ...input, board: input.board ?? post.board }), updatedAt: new Date() }).where(eq(posts.id, postId));
}

/** 공감은 한 사람이 한 번. 이미 했으면 취소한다. 공감했는지를 돌려준다. */
export async function toggleLike(db: DB, user: User, postId: string) {
  await requireMember(db, user);
  await openPost(db, user.id, postId);
  const mine = and(eq(postLikes.postId, postId), eq(postLikes.userId, user.id));
  const removed = await db.delete(postLikes).where(mine).returning({ postId: postLikes.postId });
  if (removed.length) return false;
  await db.insert(postLikes).values({ postId, userId: user.id }).onConflictDoNothing();
  return true;
}

/** 내 글 삭제는 연결이 끊겨도, 글이 숨겨져도 할 수 있다. */
export async function deletePost(db: DB, user: User, postId: string) {
  const deleted = await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.authorId, user.id))).returning({ id: posts.id });
  if (!deleted.length) fail("글을 찾을 수 없어요", 404);
}

/** parentId를 주면 답글. 답글은 댓글에 한 단계만 달 수 있다. */
export async function createComment(db: DB, user: User, postId: string, rawBody: unknown, parentId: string | null = null) {
  await requireWriter(db, user);
  await openPost(db, user.id, postId);
  if (parentId) {
    const target = await openComment(db, user.id, parentId);
    if (target.postId !== postId || target.parentId) fail("답글을 달 수 없는 댓글이에요");
  }
  const body = cleanText(rawBody, "댓글", 500);
  await limit(db, "community-comment", user.id, WRITE_LIMIT, WRITE_WINDOW_SECONDS);
  const id = randomUUID();
  await db.insert(comments).values({ id, postId, parentId, authorId: user.id, body });
  return id;
}

export async function updateComment(db: DB, user: User, commentId: string, rawBody: unknown) {
  await requireMember(db, user);
  const comment = await openComment(db, user.id, commentId);
  if (comment.authorId !== user.id) fail("내가 쓴 댓글만 고칠 수 있어요", 403);
  const body = cleanText(rawBody, "댓글", 500);
  await db.update(comments).set({ body, updatedAt: new Date() }).where(eq(comments.id, commentId));
}

export async function deleteComment(db: DB, user: User, commentId: string) {
  const deleted = await db.delete(comments).where(and(eq(comments.id, commentId), eq(comments.authorId, user.id))).returning({ id: comments.id });
  if (!deleted.length) fail("댓글을 찾을 수 없어요", 404);
}

const reportOn = ({ kind, id }: Target) => (kind === "post" ? eq(reports.postId, id) : eq(reports.commentId, id));

/** 처리 전 신고가 3건 쌓이면 자동으로 숨긴다. 기각된 신고는 세지 않는다. */
export async function report(db: DB, user: User, target: Target) {
  await requireMember(db, user);
  const { id, kind } = target;
  const authorId = kind === "post" ? (await openPost(db, user.id, id)).authorId : (await openComment(db, user.id, id)).authorId;
  if (!authorId) fail("운영팀 글은 신고할 수 없어요");
  if (authorId === user.id) fail("내 글은 신고할 수 없어요");
  await db.transaction(async (tx) => {
    // 동시에 들어온 신고가 서로의 건수를 못 보고 지나치지 않도록 대상을 잠근다
    if (kind === "post") await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, id)).for("update");
    else await tx.select({ id: comments.id }).from(comments).where(eq(comments.id, id)).for("update");
    const inserted = await tx.insert(reports)
      .values({ id: randomUUID(), reporterId: user.id, postId: kind === "post" ? id : null, commentId: kind === "comment" ? id : null })
      .onConflictDoNothing().returning({ id: reports.id });
    if (!inserted.length) fail("이미 신고했어요", 409);
    const [{ total }] = await tx.select({ total: count() }).from(reports).where(and(reportOn(target), eq(reports.status, "open")));
    if (total < REPORTS_TO_HIDE) return;
    if (kind === "post") await tx.update(posts).set({ hidden: true }).where(eq(posts.id, id));
    else await tx.update(comments).set({ hidden: true }).where(eq(comments.id, id));
  });
}

/** 글이나 댓글의 작성자를 차단한다. 화면에는 작성자 id가 없으므로 대상으로 찾는다. */
export async function blockAuthor(db: DB, user: User, target: Target) {
  await requireMember(db, user);
  const authorId = target.kind === "post" ? (await openPost(db, user.id, target.id)).authorId : (await openComment(db, user.id, target.id)).authorId;
  if (!authorId) fail("운영팀은 차단할 수 없어요");
  if (authorId === user.id) fail("나를 차단할 수는 없어요");
  await db.insert(blocks).values({ blockerId: user.id, blockedId: authorId }).onConflictDoNothing();
}

// 화면에 상대 id를 내리지 않으려고 나에게만 뜻이 있는 값으로 가리킨다.
const blockKey = (userId: string, blockedId: string) => sha256(`${userId}:${blockedId}`);

/** 내가 차단한 사람. 연결이 끊겨도 풀 수 있도록 접근 조건 없이 보여준다. */
export async function listBlocked(db: DB, user: User): Promise<{ key: string; nickname: string }[]> {
  const rows = await db.select({ id: blocks.blockedId, nickname: users.communityNickname }).from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId)).where(eq(blocks.blockerId, user.id)).orderBy(desc(blocks.createdAt));
  return rows.map((r) => ({ key: blockKey(user.id, r.id), nickname: r.nickname ?? WITHDRAWN_NAME }));
}

/** 내가 건 차단만 푼다. 상대도 나를 차단했다면 그 차단은 남아 서로 계속 안 보인다. */
export async function unblock(db: DB, user: User, key: unknown) {
  const mine = await db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, user.id));
  const target = mine.find((b) => blockKey(user.id, b.id) === key);
  if (!target) fail("차단한 사람을 찾을 수 없어요", 404);
  await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, target.id)));
}

export type ReportRow = Target & { postId: string; text: string; nickname: string; total: number; hidden: boolean };

/** 운영자 화면: 처리 전 신고를 대상별로 묶어 많은 순으로. */
export async function listReports(db: DB, user: User): Promise<ReportRow[]> {
  await requireAdmin(db, user);
  const open = await db.select({ postId: reports.postId, commentId: reports.commentId }).from(reports).where(eq(reports.status, "open"));
  const tally = (ids: (string | null)[]) => ids.reduce((m, id) => (id ? m.set(id, (m.get(id) ?? 0) + 1) : m), new Map<string, number>());
  const postTally = tally(open.map((r) => r.postId));
  const commentTally = tally(open.map((r) => r.commentId));
  const postRows = await db.select({ id: posts.id, text: posts.title, hidden: posts.hidden, nickname: users.communityNickname })
    .from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(inArray(posts.id, [...postTally.keys()]));
  const commentRows = await db.select({ id: comments.id, postId: comments.postId, text: comments.body, hidden: comments.hidden, nickname: users.communityNickname })
    .from(comments).innerJoin(users, eq(users.id, comments.authorId)).where(inArray(comments.id, [...commentTally.keys()]));
  const rows: ReportRow[] = [
    ...postRows.map((r) => ({ ...r, kind: "post" as const, postId: r.id, nickname: r.nickname ?? WITHDRAWN_NAME, total: postTally.get(r.id) ?? 0 })),
    ...commentRows.map((r) => ({ ...r, kind: "comment" as const, nickname: r.nickname ?? WITHDRAWN_NAME, total: commentTally.get(r.id) ?? 0 })),
  ];
  return rows.sort((a, b) => b.total - a.total);
}

/** 숨김은 대상을 숨긴 채 확정하고, 기각은 자동 숨김까지 되돌린다. */
export async function decideReport(db: DB, user: User, target: Target, decision: "hidden" | "dismissed") {
  await requireAdmin(db, user);
  await db.transaction(async (tx) => {
    const decided = await tx.update(reports).set({ status: decision })
      .where(and(reportOn(target), eq(reports.status, "open"))).returning({ id: reports.id });
    if (!decided.length) fail("처리할 신고가 없어요", 404);
    const hidden = decision === "hidden";
    if (target.kind === "post") await tx.update(posts).set({ hidden }).where(eq(posts.id, target.id));
    else await tx.update(comments).set({ hidden }).where(eq(comments.id, target.id));
  });
}
