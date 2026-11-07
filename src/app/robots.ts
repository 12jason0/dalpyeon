import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// 로그인해야 보이는 화면은 막고, 소개·가입·처리방침만 열어 둠. AI 검색 봇도 "*" 로 같은 규칙
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/me/privacy"],
      disallow: ["/calendar", "/records", "/report", "/community", "/connect", "/consent", "/learn", "/news", "/me", "/admin", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
