import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { purgeExpired } from "@/lib/services/auth";
import { autoEndPeriods } from "@/lib/services/periods";
import { cronAuthorized, notifyPeriodEnd, sendPartnerAlerts, sendReminders } from "@/lib/services/push";

export const dynamic = "force-dynamic";

/** Vercel Cron이 CRON_SECRET을 Authorization 헤더에 담아 하루 한 번(서울 9시) 부른다. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const purged = await purgeExpired(db);
  const ended = await autoEndPeriods(db);
  // 자동으로 끝낸 기록도 파트너에게 "끝" 알림을 보낸다
  for (const p of ended) await notifyPeriodEnd(db, p.ownerId, p.startDate);
  const sent = await sendReminders(db);
  const partnerSent = await sendPartnerAlerts(db);
  return NextResponse.json({ purged, autoEnded: ended.length, sent, partnerSent });
}
