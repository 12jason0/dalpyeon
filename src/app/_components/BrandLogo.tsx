/**
 * 앱 안의 로고. 헤더·로딩 링처럼 작게(20~24px) 들어가는 곳이라 반짝이 선이 뭉개지지 않게 D 두 개만 쓴다.
 * 그림은 npm run icons가 public/brand/icon-source.png에서 만든다(logo-dd.png, 배경 투명).
 */
export function BrandLogo({ size, className = "" }: { size: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- 20px짜리 고정 그림이라 이미지 최적화가 필요 없다
  return <img src="/brand/logo-dd.png" width={size} height={size} alt="" aria-hidden className={`object-contain ${className}`} />;
}
