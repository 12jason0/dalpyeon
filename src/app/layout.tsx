import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리주기",
  description: "말하기 어려운 날에도, 서로의 편.",
  appleWebApp: { capable: true, title: "우리주기", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#FFFDFC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <main className="mx-auto max-w-md px-6 pb-32 pt-[max(3rem,env(safe-area-inset-top))]">{children}</main>
      </body>
    </html>
  );
}
