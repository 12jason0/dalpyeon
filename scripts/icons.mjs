// 앱 아이콘과 앱 안 로고를 만듭니다: npm run icons
// 원본 public/brand/icon-source.png(둥근 사각형 + 바깥 흰 여백)에서 로고만 떼어
//   1) public/brand/icon-master.png: 원본 크림색으로 꽉 찬 1024 정사각형, 로고는 가운데 65%. 모서리는 OS가 둥글게 한다.
//   2) public/icons/: apple 180, 파비콘 32·16(D만, 86%), manifest 192·512, maskable 512(로고가 가운데 80% 안전영역 안)
//   3) public/brand/logo.png(반짝이 포함), logo-dd.png(D 두 개만): 배경이 투명한 앱 안 로고. 작게 쓰는 곳은 D만.
// 시작 화면 PNG는 npm run splash가 logo.png로 만든다.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const SOURCE = file("public/brand/icon-source.png");
const LOGO_SHARE = 0.65; // 아이콘에서 로고가 차지하는 비율(긴 변 기준)
const MASKABLE_SAFE = 0.8; // maskable 아이콘의 안전영역(지름 비율). 로고 대각선이 이 안에 들어오게 한다
const SMALL = 32; // 이 크기 이하 아이콘(파비콘)은 반짝이 선이 뭉개지므로 D 두 개만 쓴다
const SMALL_SHARE = 0.86; // 파비콘은 OS가 모서리를 자르지 않고, 65%면 16px에서 D가 10px로 뭉개져서 크게 채운다

const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const at = (x, y) => (y * W + x) * C;
const dist = (i, c) => Math.hypot(data[i] - c[0], data[i + 1] - c[1], data[i + 2] - c[2]);

// 둥근 사각형 안쪽의 크림색: 로고가 없는 왼쪽 띠의 중앙값
const samples = [];
for (let y = Math.round(H * 0.15); y < H * 0.85; y += 5) for (let x = Math.round(W * 0.1); x < W * 0.2; x += 5) samples.push(at(x, y));
const median = (k) => samples.map((i) => data[i + k]).sort((a, b) => a - b)[samples.length >> 1];
const CREAM = [median(0), median(1), median(2)];
const hex = `#${CREAM.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

// 로고 픽셀: 크림과 확실히 다른 곳. 둥근 사각형 안쪽(가장자리 10%)만 본다.
const INK = 14;
const inside = (x, y) => x > W * 0.1 && x < W * 0.9 && y > H * 0.1 && y < H * 0.9;
const isInk = (x, y) => inside(x, y) && dist(at(x, y), CREAM) > INK;

// D 두 개: 가장 큰 덩어리(겹친 부분까지 이어진다). 반짝이는 따로 떨어진 작은 덩어리들이다.
const label = new Int32Array(W * H).fill(-1);
const sizes = [];
const boxes = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (label[y * W + x] !== -1 || !isInk(x, y)) continue;
  const id = sizes.length;
  let count = 0;
  const box = [x, y, x, y];
  const stack = [y * W + x];
  label[y * W + x] = id;
  while (stack.length) {
    const p = stack.pop();
    count++;
    const px = p % W;
    const py = (p - px) / W;
    box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (label[q] === -1 && isInk(nx, ny)) {
        label[q] = id;
        stack.push(q);
      }
    }
  }
  sizes.push(count);
  boxes.push(box);
}
const main = sizes.indexOf(Math.max(...sizes));
// 반짝이: D 덩어리 바로 위·옆에 있는 작은 덩어리. 둥근 사각형 바깥 흰 모서리 조각(멀리 떨어진 덩어리)은 빼낸다.
const [mx0, my0, mx1, my1] = boxes[main];
const near = ([x0, y0, x1, y1]) => (x0 + x1) / 2 > mx0 && (x0 + x1) / 2 < mx1 && (y0 + y1) / 2 > my0 - (my1 - my0) * 0.2 && (y0 + y1) / 2 < my1;
const sparkleIds = new Set(sizes.map((n, id) => (id !== main && n > 200 && near(boxes[id]) ? id : -1)).filter((id) => id >= 0));

/** 로고를 투명 배경으로: 크림과 섞인 정도로 알파를 구하고 색을 되돌린다. keep으로 남길 덩어리를 고른다. */
function cutout(keep) {
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    const y = (p - x) / W;
    const i = p * C;
    // 덩어리 경계의 옅은 테두리도 따라가도록, 주변 2px 안에 남길 덩어리가 있으면 그 픽셀로 본다
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
      const q = (y + dy) * W + (x + dx);
      if (q >= 0 && q < W * H && label[q] >= 0 && keep(label[q])) near = true;
    }
    if (!near || !inside(x, y)) continue;
    const a = Math.min(1, dist(i, CREAM) / 60);
    if (a <= 0) continue;
    for (let k = 0; k < 3; k++) out[p * 4 + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - (1 - a) * CREAM[k]) / a)));
    out[p * 4 + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 0 }).png().toBuffer();
}

const full = await cutout((id) => id === main || sparkleIds.has(id)); // 반짝이 포함
const dd = await cutout((id) => id === main); // D 두 개만

/** 크림 정사각형 위 가운데에 로고. share는 로고 긴 변 비율, diag면 대각선 기준(maskable). */
async function icon(logo, size, { share = LOGO_SHARE, diag = false } = {}) {
  const meta = await sharp(logo).metadata();
  const long = diag ? Math.hypot(meta.width, meta.height) : Math.max(meta.width, meta.height);
  const scale = (size * share) / long;
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));
  const resized = await sharp(logo).resize(w, h, { kernel: "lanczos3" }).toBuffer();
  const composed = await sharp({ create: { width: size, height: size, channels: 3, background: hex } })
    .composite([{ input: resized, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toBuffer();
  // 아이콘은 투명한 곳 없이(iOS는 투명을 검게 칠한다). sharp는 합성을 맨 마지막에 하므로 합성한 뒤 따로 없앤다.
  return sharp(composed).flatten({ background: hex }).removeAlpha().png({ compressionLevel: 9 });
}

mkdirSync(file("public/icons"), { recursive: true });
await (await icon(full, 1024)).toFile(file("public/brand/icon-master.png"));
const outputs = [
  ["public/icons/apple-icon-180.png", 180],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/favicon-32.png", 32],
  ["public/icons/favicon-16.png", 16],
];
for (const [path, size] of outputs) {
  await (await icon(size <= SMALL ? dd : full, size, { share: size <= SMALL ? SMALL_SHARE : LOGO_SHARE })).toFile(file(path));
  console.log(path);
}
// maskable: 안드로이드가 원·둥근 사각형 등으로 잘라도 로고가 남도록, 로고 대각선이 가운데 80% 원 안에 들어오게(조금 더 여유)
await (await icon(full, 512, { share: MASKABLE_SAFE * 0.92, diag: true })).toFile(file("public/icons/maskable-512.png"));
console.log("public/icons/maskable-512.png");

// 앱 안 로고(투명 배경). 헤더·로딩 링처럼 작게 쓰는 곳은 D만, 시작 화면은 반짝이까지.
await sharp(full).resize({ width: 600, height: 600, fit: "inside" }).png({ compressionLevel: 9 }).toFile(file("public/brand/logo.png"));
await sharp(dd).resize({ width: 144, height: 144, fit: "inside" }).png({ compressionLevel: 9 }).toFile(file("public/brand/logo-dd.png"));
console.log(`public/brand/icon-master.png, logo.png, logo-dd.png (크림 ${hex}, 반짝이 ${sparkleIds.size}개)`);
