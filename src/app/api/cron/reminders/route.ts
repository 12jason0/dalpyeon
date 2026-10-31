import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cronAuthorized, sendReminders } from "@/lib/services/push";

export const dynamic = "force-dynamic";

/** Vercel Cron이 CRON_SECRET을 Authorization 헤더에 담아 하루 한 번 부른다. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ sent: await sendReminders(await getDb()) });
}
