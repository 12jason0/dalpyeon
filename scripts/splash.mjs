// 아이폰 시작 화면 PNG를 만듭니다: npm run splash
// 달 모양은 src/app/_components/brand-moon.json 하나만 고치면 public/brand/splash.svg에도 반영됩니다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const MOON_SHARE = 0.12; // 달 지름 / 화면 너비
const MOON_UNITS = 100; // splash.svg 안의 달 지름

const moon = JSON.parse(readFileSync(file("src/app/_components/brand-moon.json"), "utf8")).d;
const source = readFileSync(file("public/brand/splash.svg"), "utf8").replace(/(<path id="moon"[^>]* d=")[^"]*/, `$1${moon}`);
writeFileSync(file("public/brand/splash.svg"), source);

const sized = (width, height) => source
  .replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, `viewBox="${-width / 2} ${-height / 2} ${width} ${height}" width="${width}" height="${height}"`)
  .replace(/(<rect id="paper") x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*"/, `$1 x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}"`)
  .replace(/(<g id="mark" transform=")scale\([^)]*\)/, `$1scale(${(width * MOON_SHARE) / MOON_UNITS})`);

mkdirSync(file("public/brand/splash"), { recursive: true });
for (const { name, width, height, ratio } of JSON.parse(readFileSync(file("src/lib/content/splash-sizes.json"), "utf8"))) {
  const [w, h] = [width * ratio, height * ratio];
  await sharp(Buffer.from(sized(w, h))).png({ compressionLevel: 9, palette: true }).toFile(file(`public/brand/splash/${w}x${h}.png`));
  console.log(`${w}x${h} ${name}`);
}
