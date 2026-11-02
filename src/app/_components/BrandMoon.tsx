import moon from "./brand-moon.json";

/** 앱의 달 그림 하나. 모양은 brand-moon.json만 고치면 된다 (시작 화면 이미지는 npm run splash). 색은 글자색을 따른다. */
export function BrandMoon({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <path d={moon.d} fill="currentColor" />
    </svg>
  );
}
