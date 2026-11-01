export const dynamic = "force-dynamic";

/** 함수가 살아 있는지만 본다. DB를 깨우지 않는다. */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
