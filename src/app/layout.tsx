import type { Metadata, Viewport } from "next";
import SPLASH_SIZES from "@/lib/content/splash-sizes.json";
import { MarkOpened } from "./_components/OpenLoading";
import { ServiceWorker } from "./_components/ServiceWorker";
import "./globals.css";

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
    <html lang="ko">
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
