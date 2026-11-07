import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 카톡·SNS 공유 미리보기 이미지 (1200×630). 빌드 때 한 번 그림. 기본 글꼴엔 한글이 없어서 앱 글꼴을 넣음
export const dynamic = "force-static";

export async function GET() {
  const [font, logo] = await Promise.all([
    readFile(join(process.cwd(), "src/app/fonts/Hakgyoansim Dunggeunmiso OTF R.otf")),
    readFile(join(process.cwd(), "public/brand/logo.png")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 64, padding: "0 96px", background: "#FBF4F1", color: "#3F3A3D", fontFamily: "Dunggeunmiso" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${logo.toString("base64")}`} width={230} height={240} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ fontSize: 44, color: "#C6486E" }}>디어데이</span>
          <span style={{ fontSize: 62, lineHeight: 1.25 }}>말하기 어려운 날에도,</span>
          <span style={{ fontSize: 62, lineHeight: 1.25, marginTop: -22 }}>서로의 편.</span>
          <span style={{ fontSize: 30, color: "#786E71" }}>커플 생리 앱 · 생리주기 공유 · 생리 달력</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: "Dunggeunmiso", data: font, weight: 400, style: "normal" }] },
  );
}
