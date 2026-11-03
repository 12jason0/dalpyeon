import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ne } from "drizzle-orm";
import type { DB } from "../db";
import { notes } from "../db/schema";
import { timeSeoul, todaySeoul } from "../dates";
import type { Pain } from "../daylog";
import { fail } from "../errors";
import type { User } from "./auth";
import { activeCouple, otherNickname, type Couple } from "./couples";

export const NOTES_PER_DAY = 3;
export const NOTE_MAX = 50;
const DAY_STARTS_AT_HOUR = 5;

/** 쪽지의 하루. 서울 새벽 5시에 바뀐다(생리 날짜·달력은 그대로 0시 기준). */
export const noteDay = (now = new Date()) => todaySeoul(new Date(now.getTime() - DAY_STARTS_AT_HOUR * 3600_000));

// ── 예시 문장: 정해진 규칙으로 고른다 ──
const PARTNER_FILL = ["나도 오늘 좀 피곤했어", "오늘 하루 어땠어?", "보고 싶어"];
const RECORDER_BEFORE = ["오늘 하루 어땠어?", "보고 싶어", "오늘은 일찍 쉬고 싶어"];
const RECORDER_AFTER = ["고마워", "오늘 같이 쉬자", "보고 싶어"];

/** 파트너 예시 3개. 배가 아프면(통증 기록·핫팩 부탁) 핫팩, 단 거 부탁이면 초콜릿, 집에서 부탁이면 영화. 나머지는 기본 문장. */
export function partnerExamples(presets: string[], pain: Pain | null) {
  const picks = [
    ((pain && pain !== "none") || presets.includes("heat_pack")) && "핫팩 챙겨갈게",
    presets.includes("sweet") && "초콜릿 사갈게",
    presets.includes("stay_home") && "오늘은 집에서 영화 보자",
  ].filter((t): t is string => Boolean(t));
  return [...new Set([...picks, ...PARTNER_FILL])].slice(0, 3);
}

/** 기록자 예시 3개. 오늘 상대 쪽지를 받기 전과 후가 다르다. */
export const recorderExamples = (received: boolean) => (received ? RECORDER_AFTER : RECORDER_BEFORE);

export type NoteView = { id: string; body: string; mine: boolean; name: string; time: string };
export type TodayNotes = { otherName: string; notes: NoteView[]; left: number; received: boolean };

/** 쪽지를 주고받을 수 있는 연결: 활성 + 잠시 멈추기 아님. */
async function noteCouple(db: DB, user: User): Promise<Couple | null> {
  const couple = await activeCouple(db, user.id);
  return couple && !couple.paused ? couple : null;
}

/** 오늘(새벽 5시 기준) 이 연결에서 주고받은 쪽지. 연결이 없거나 잠시 멈췄으면 null. */
export async function todayNotes(db: DB, user: User, now = new Date()): Promise<TodayNotes | null> {
  const couple = await noteCouple(db, user);
  if (!couple) return null;
  const me = user.nickname; // 세션 조회에서 이미 읽은 이름
  const [rows, otherName] = await Promise.all([
    db.select().from(notes).where(and(eq(notes.coupleId, couple.id), eq(notes.day, noteDay(now)))).orderBy(asc(notes.createdAt), asc(notes.seq)),
    otherNickname(db, couple, user),
  ]);
  const view = rows.map((n) => {
    const mine = n.senderId === user.id;
    return { id: n.id, body: n.body, mine, name: mine ? me : otherName, time: timeSeoul(n.createdAt) };
  });
  return {
    otherName, notes: view, left: Math.max(0, NOTES_PER_DAY - view.filter((n) => n.mine).length), received: view.some((n) => !n.mine),
  };
}

/** 쪽지를 보낸다. 받을 사람 id를 돌려준다(알림용). */
export async function sendNote(db: DB, user: User, rawBody: unknown, now = new Date()) {
  const couple = await noteCouple(db, user);
  if (!couple) fail("연결된 상대가 없어요", 404);
  const body = String(rawBody ?? "").trim();
  if (body.length < 1 || body.length > NOTE_MAX) fail(`쪽지는 1~${NOTE_MAX}자로 적어 주세요`);
  const day = noteDay(now);
  const [{ sent }] = await db.select({ sent: count() }).from(notes).where(and(eq(notes.senderId, user.id), eq(notes.day, day)));
  if (sent >= NOTES_PER_DAY) fail("오늘 쪽지를 다 썼어요", 429);
  // 동시에 보내 같은 장 번호가 겹치면 유일 인덱스가 막는다
  const inserted = await db.insert(notes).values({ id: randomUUID(), coupleId: couple.id, senderId: user.id, day, seq: sent + 1, body })
    .onConflictDoNothing().returning({ id: notes.id });
  if (!inserted.length) fail("잠시 후 다시 보내 주세요", 409);
  return user.id === couple.recorderId ? couple.partnerId : couple.recorderId;
}

/** 새 소식: 지금 연결에서 상대가 보낸 쪽지, 최근 것부터. */
export async function receivedNotes(db: DB, user: User, couple: Couple) {
  return db.select({ id: notes.id, body: notes.body, createdAt: notes.createdAt }).from(notes)
    .where(and(eq(notes.coupleId, couple.id), ne(notes.senderId, user.id))).orderBy(desc(notes.createdAt)).limit(20);
}
