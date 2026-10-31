import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export type Role = "recorder" | "partner";
export type Permissions = { periods: boolean; predictions: boolean; fertility: boolean; care: boolean };
export const NO_PERMISSIONS: Permissions = { periods: false, predictions: false, fertility: false, care: false };

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull(),
  nickname: text("nickname").notNull(),
  createdAt: created(),
});

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
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("periods_owner_start").on(t.ownerId, t.startDate)]);

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

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
