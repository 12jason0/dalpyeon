import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import SPLASH_SIZES from "@/lib/content/splash-sizes.json";
import { MarkOpened } from "./_components/OpenLoading";
import { ServiceWorker } from "./_components/ServiceWorker";
import "./globals.css";

/**
 * 포인트 손글씨(교보 손글씨 2025 이유빈). 라이선스상 파일 형식을 바꿀 수 없어 .ttf 그대로 쓴다.
 * 5.7MB라 미리 받지 않고(preload: false) 글자가 보일 때 받으며, 받는 동안은 Pretendard로 보인다(swap).
 * 변수 --font-hand만 등록하고, 쓰는 곳에서 font-hand 유틸리티로 고른다. 두 번째부터는 서비스 워커 캐시에서 바로 뜬다.
 */
const hand = localFont({
  src: "./fonts/KyoboHandwriting2025lyb.ttf",
  variable: "--font-hand",
  display: "swap",
  preload: false,
  adjustFontFallback: false, // 대체 글꼴은 font-hand 유틸리티의 Pretendard
});

export const metadata: Metadata = {
  title: "우리주기",
  description: "말하기 어려운 날에도, 서로의 편.",
  appleWebApp: {
    capable: true, title: "우리주기", statusBarStyle: "default",
    startupImage: SPLASH_SIZES.map(({ width, height, ratio }) => ({
      url: `/brand/splash/${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF4F1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={hand.variable}>
      <head>
        {/* Next는 mobile-web-app-capable만 넣는다. 아이폰 시작 화면에는 이 이름이 필요하다 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <main className="mx-auto max-w-md px-6 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">{children}</main>
        <ServiceWorker version={process.env.VERCEL_GIT_COMMIT_SHA} />
        <MarkOpened />
      </body>
    </html>
  );
}
