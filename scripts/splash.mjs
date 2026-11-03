// 아이폰 시작 화면 PNG를 만듭니다: npm run splash (먼저 npm run icons로 public/brand/logo.png를 만든다)
// 바탕색 위 가운데에 디어데이 로고(D 두 개 + 반짝이). 로고 폭은 화면 폭의 LOGO_SHARE.
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const PAPER = "#FBF4F1"; // globals.css --color-paper, manifest background_color와 같다
const LOGO_SHARE = 0.24;

const logo = file("public/brand/logo.png");
mkdirSync(file("public/brand/splash"), { recursive: true });
for (const { name, width, height, ratio } of JSON.parse(readFileSync(file("src/lib/content/splash-sizes.json"), "utf8"))) {
  const [w, h] = [width * ratio, height * ratio];
  const mark = await sharp(logo).resize({ width: Math.round(w * LOGO_SHARE) }).toBuffer();
  const { width: mw, height: mh } = await sharp(mark).metadata();
  await sharp({ create: { width: w, height: h, channels: 3, background: PAPER } })
    .composite([{ input: mark, left: Math.round((w - mw) / 2), top: Math.round((h - mh) / 2) }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(file(`public/brand/splash/${w}x${h}.png`));
  console.log(`${w}x${h} ${name}`);
}
