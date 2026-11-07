import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import SPLASH_SIZES from "@/lib/content/splash-sizes.json";
import { MarkOpened } from "./_components/OpenLoading";
import { ServiceWorker } from "./_components/ServiceWorker";
import "./globals.css";
import { HOME_DESCRIPTION, HOME_TITLE, KEYWORDS, SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * 앱 기본 글꼴: 학교안심 둥근미소 Regular. 파일 형식을 바꾸지 않고 받은 OTF 그대로 쓴다(TTF보다 4배 작다).
 * 받은 파일의 굵기는 R 400, B 600(OS/2 usWeightClass) 두 개. 앱은 굵기를 500까지만 쓰고(500은 400으로 그려진다)
 * 강조는 색으로 하므로 B는 불러오지 않는다. globals.css의 font-synthesis: none으로 가짜 굵기도 만들지 않는다.
 * 받는 동안은 기기 기본 글꼴로 보이고(swap), 두 번째부터는 서비스 워커 캐시에서 바로 뜬다.
 */
const base = localFont({
  src: [{ path: "./fonts/Hakgyoansim Dunggeunmiso OTF R.otf", weight: "400", style: "normal" }],
  variable: "--font-base",
  display: "swap",
  adjustFontFallback: false, // 대체 글꼴은 globals.css --font-sans의 기기 글꼴
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s — ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  // 카톡·SNS 공유 미리보기 (이미지는 /og). 페이지마다 바꾸려면 lib/seo 의 pageMeta
  openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title: HOME_TITLE, description: HOME_DESCRIPTION, images: [{ url: "/og", width: 1200, height: 630, alt: SITE_NAME }] },
  twitter: { card: "summary_large_image", images: ["/og"] },
  // 네이버 서치어드바이저·구글 서치콘솔·빙 웹마스터 소유 확인 — Vercel 환경변수 (비우면 태그 안 나감)
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: Object.fromEntries(
      [["naver-site-verification", process.env.NAVER_SITE_VERIFICATION], ["msvalidate.01", process.env.BING_SITE_VERIFICATION]].filter(([, v]) => v) as [string, string][],
    ),
  },
  // 아이콘은 npm run icons가 public/brand/icon-source.png에서 만든다. 파비콘은 작아서 D 두 개만 크게.
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true, title: "디어데이", statusBarStyle: "default",
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
    <html lang="ko" className={base.variable}>
      <head>
        {/* Next는 mobile-web-app-capable만 넣는다. 아이폰 시작 화면에는 이 이름이 필요하다 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <main className="mx-auto max-w-md px-6 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">{children}</main>
        <ServiceWorker version={process.env.VERCEL_GIT_COMMIT_SHA} />
        <MarkOpened />
      </body>
    </html>
  );
}
