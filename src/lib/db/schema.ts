import { sql } from "drizzle-orm";
import {
  boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Mood, Pain } from "../daylog";

export type Role = "recorder" | "partner";
export type Permissions = { periods: boolean; predictions: boolean; fertility: boolean; care: boolean };
export const NO_PERMISSIONS: Permissions = { periods: false, predictions: false, fertility: false, care: false };
/** 항목별 공유를 없애면서 더 읽지 않는 값. couples.permissions가 not null이라 넣기만 한다. */
export const DEFAULT_PERMISSIONS: Permissions = { periods: true, predictions: true, fertility: false, care: true };

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  /** 카카오로 가입한 계정은 이메일과 비밀번호가 없다. */
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  kakaoId: text("kakao_id").unique(),
  role: text("role").$type<Role>().notNull(),
  nickname: text("nickname").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  /** 커뮤니티 이용 규칙에 동의하면서 정해진다. null이면 아직 동의 전. */
  communityNickname: text("community_nickname").unique(),
  /** 건강 정보 저장 동의 시각. 이 기능 전에 가입한 계정은 null이다. */
  healthConsentAt: timestamp("health_consent_at", { withTimezone: true }),
  /** 만 14세 이상 확인 시각. 이 기능 전에 가입한 계정은 null이다. */
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  /** 개인정보 국외 이전 동의 시각. 이 기능 전에 가입한 계정은 null이다. */
  transferConsentAt: timestamp("transfer_consent_at", { withTimezone: true }),
  reminderEnabled: boolean("reminder_enabled").notNull().default(true),
  /** 마지막으로 알림을 보낸 예정일. 크론이 두 번 돌아도 한 번만 보낸다. */
  reminderSentFor: date("reminder_sent_for", { mode: "string" }),
  newsSeenAt: timestamp("news_seen_at", { withTimezone: true }),
  /** 기록자가 직접 적는 평소 주기. 기록이 적을 때 예측에 섞는다. */
  usualCycleDays: integer("usual_cycle_days"),
  createdAt: created(),
}, () => [check("users_usual_cycle", sql`usual_cycle_days between 21 and 45`)]);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("sessions_user").on(t.userId)]);

export const periods = pgTable("periods", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  excluded: boolean("excluded").notNull().default(false),
  excludeReason: text("exclude_reason"),
  /** 끝났다는 입력 없이 앱이 끝낸 기록. 사람이 저장하면 false가 된다. */
  autoEnded: boolean("auto_ended").notNull().default(false),
  /** "아직 하고 있어요"를 누르면 이 날부터 다시 묻는다. */
  askEndAgainOn: date("ask_end_again_on", { mode: "string" }),
  /** 끝났는지 묻는 푸시는 기록마다 한 번만 보낸다. */
  endAskSent: boolean("end_ask_sent").notNull().default(false),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("periods_owner_start").on(t.ownerId, t.startDate)]);

/** 생리 중인 날의 통증·기분. 날짜별 하나이고, 둘 다 비우면 행을 지운다. */
export const dayLogs = pgTable("day_logs", {
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  pain: text("pain").$type<Pain>(),
  moods: jsonb("moods").$type<Mood[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  recorderId: text("recorder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimantId: text("claimant_id").references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"open" | "pending" | "approved" | "rejected" | "revoked">().notNull(),
});

export const couples = pgTable("couples", {
  id: text("id").primaryKey(),
  recorderId: text("recorder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  partnerId: text("partner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"active" | "disconnected">().notNull(),
  paused: boolean("paused").notNull().default(false),
  permissions: jsonb("permissions").$type<Permissions>().notNull(),
  shareFrom: date("share_from", { mode: "string" }).notNull(),
  /** 연결 후 기록자가 공유 항목을 아직 확인하지 않았으면 true. 홈에 확인 링크를 띄운다. */
  sharingNotice: boolean("sharing_notice").notNull().default(false),
  createdAt: created(),
}, (t) => [
  uniqueIndex("one_active_recorder").on(t.recorderId).where(sql`status = 'active'`),
  uniqueIndex("one_active_partner").on(t.partnerId).where(sql`status = 'active'`),
]);

export const careRequests = pgTable("care_requests", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  presets: jsonb("presets").$type<string[]>().notNull(),
  message: text("message"),
  shareWithPartner: boolean("share_with_partner").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("care_owner_day").on(t.ownerId, t.day)]);

export const careResponses = pgTable("care_responses", {
  careId: text("care_id").notNull().references(() => careRequests.id, { onDelete: "cascade" }),
  coupleId: text("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
  response: text("response").$type<"seen" | "will_help" | "done">().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.careId, t.coupleId] })]);

export type Board = "question" | "tip";

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 게시판을 하나로 합치기 전의 분류. 화면에서는 더 쓰지 않고 예전 글의 값으로만 남아 있다. */
  board: text("board").$type<Board>().notNull().default("question"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("posts_created").on(t.createdAt),
  index("posts_author").on(t.authorId),
]);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  /** 답글이면 원 댓글. 답글에는 답글을 달 수 없다. 원 댓글을 지우면 답글도 함께 지워진다. */
  parentId: text("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("comments_post").on(t.postId),
  index("comments_parent").on(t.parentId),
  index("comments_author").on(t.authorId),
]);

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
  commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  status: text("status").$type<"open" | "hidden" | "dismissed">().notNull().default("open"),
  createdAt: created(),
}, (t) => [
  uniqueIndex("reports_once_post").on(t.reporterId, t.postId).where(sql`post_id is not null`),
  uniqueIndex("reports_once_comment").on(t.reporterId, t.commentId).where(sql`comment_id is not null`),
  index("reports_status").on(t.status),
  check("reports_one_target", sql`(post_id is null) <> (comment_id is null)`),
]);

export const blocks = pgTable("blocks", {
  blockerId: text("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: created(),
}, (t) => [
  primaryKey({ columns: [t.blockerId, t.blockedId] }),
  index("blocks_blocked").on(t.blockedId),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: created(),
}, (t) => [index("push_subscriptions_user").on(t.userId)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
