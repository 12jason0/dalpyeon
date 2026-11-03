/**
 * 버튼·칩 크기 기준. 앱 전체가 이 값을 쓴다(globals.css의 .btn·.btn-line도 같은 값).
 * - 주요 버튼(BTN): 높이 44px, 글자 15px, 굵기 500, 폭은 글자만큼. 한 화면에 진한 분홍으로 꽉 찬 버튼은 하나만.
 * - 보조 버튼(BTN_LINE): 흰 배경 + 연한 테두리. 더 가벼운 동작은 글자 버튼(TEXT_BTN).
 * - 칩(chip): 높이 36px, 글자 14px, 굵기 500. 고르면 연분홍 배경 + 진한 분홍 글자. 진한 분홍으로 채우지 않는다.
 * 색·여백은 한 요소에 두 값이 같이 붙으면 어느 쪽이 이길지 CSS 순서에 달려 있어서, 겹치지 않게 조합한다.
 */
const BTN_BASE = "inline-flex h-11 items-center justify-center rounded-full text-[15px] font-medium transition-opacity active:opacity-80 disabled:opacity-40";
const FILL = "bg-accent text-white";
const LINE = "border border-line bg-card text-ink";

/** 주요 버튼. wide면 좌우 여백 없이(flex-1·w-full로 폭을 줄 때). */
export const btn = (kind: "primary" | "line" | "danger" = "primary", wide = false) =>
  `${BTN_BASE} ${wide ? "" : "px-6"} ${kind === "line" ? LINE : kind === "danger" ? "bg-danger text-white" : FILL}`;
export const BTN = btn("primary");
export const BTN_LINE = btn("line");
export const TEXT_BTN = "link inline-flex h-9 items-center text-[13px]";

/** 칩. pad=false면 좌우 여백 없이(그리드 칸을 채울 때). */
export const chip = (on: boolean, pad = true) =>
  `inline-flex h-9 cursor-pointer items-center justify-center rounded-full border text-[14px] font-medium transition-colors ${pad ? "px-3.5" : ""} ${on ? "border-accent bg-period text-period-ink" : "border-line bg-card text-muted"}`;
