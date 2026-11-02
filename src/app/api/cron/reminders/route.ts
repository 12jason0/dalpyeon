import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { purgeExpired } from "@/lib/services/auth";
import { autoEndPeriods } from "@/lib/services/periods";
import { cronAuthorized, sendReminders } from "@/lib/services/push";

export const dynamic = "force-dynamic";

/** Vercel Cron이 CRON_SECRET을 Authorization 헤더에 담아 하루 한 번 부른다. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const purged = await purgeExpired(db);
  const autoEnded = await autoEndPeriods(db);
  return NextResponse.json({ purged, autoEnded, sent: await sendReminders(db) });
}
