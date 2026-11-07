import type { Metadata } from "next";

// 검색·카톡 공유 미리보기에 쓰는 공통 값
export const SITE_URL = process.env.SITE_URL?.trim().replace(/\/+$/, "") || "https://dearday-couple.vercel.app";
export const SITE_NAME = "디어데이";
export const HOME_TITLE = "디어데이 — 커플 생리 앱, 연인과 생리주기 공유·생리 달력";
export const HOME_DESCRIPTION =
  "생리주기를 기록하고 연인과 공유하는 커플 생리 앱. 다음 생리 예정일·배란일 계산, 커플 생리 달력, 말하기 어려운 날 배려 요청까지. 여자친구 생리 예정일도 함께 알 수 있어요.";
export const KEYWORDS = ["커플 생리 앱", "생리주기 공유", "여자친구 생리 예정일", "커플 생리 달력", "배란일 계산", "생리 예정일 계산", "생리 달력"];

/** 페이지마다 제목·설명·대표 주소·공유 미리보기를 한 번에 */
export function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title, description, url: path, images: [{ url: "/og", width: 1200, height: 630, alt: "디어데이" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og"] },
  };
}

/** 소개 화면 FAQ — 화면과 구조화 데이터(FAQPage)가 같은 글을 씀 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "디어데이는 어떤 앱인가요?",
    a: "생리주기를 기록하고 연인과 공유하는 커플 생리 앱이에요. 기록하는 사람은 생리 기록과 다음 생리 예상을 보고, 연결된 연인은 커플 생리 달력과 오늘 필요한 배려를 함께 봐요.",
  },
  {
    q: "연인과 생리주기는 어떻게 공유하나요?",
    a: "기록하는 사람이 연결 코드를 만들어 보내면, 연인이 [받은 코드로 시작하기]에서 8자리 코드를 입력해 바로 연결돼요. 코드는 15분 동안만 쓸 수 있어요.",
  },
  {
    q: "연인이 제 기록을 다 볼 수 있나요?",
    a: "연결하면 생리 기록과 다음 생리 예상, 가임기·배란일(추정), 오늘의 통증·기분, 배려 요청을 함께 봐요. 공유를 시작할 날짜를 정할 수 있고, 잠시 멈추면 연인에게는 '잠시 쉬는 중'만 보여요. 연결은 설정에서 언제든 끊을 수 있어요.",
  },
  {
    q: "여자친구 생리 예정일과 배란일은 어떻게 계산하나요?",
    a: "지난 생리 기록의 주기 간격으로 다음 생리 예정일을 추정하고, 배란일은 예정일 14일 전으로 계산해요. 기록이 적으면 직접 적은 평소 주기(없으면 28일)를 써요. 참고용 추정이라 피임이나 진단에는 쓸 수 없어요.",
  },
  {
    q: "돈이 드나요? 앱을 설치해야 하나요?",
    a: "무료예요. 앱 스토어 설치 없이 휴대폰 브라우저에서 바로 쓰고, 홈 화면에 추가하면 앱처럼 열리고 생리 예정일 알림·배려 요청 알림도 받을 수 있어요. 이메일이나 카카오로 가입해요.",
  },
  {
    q: "건강 정보는 안전한가요?",
    a: "생리 기록 같은 건강 정보는 따로 동의를 받은 뒤에만 저장해요. 탈퇴하면 생리 기록, 통증·기분, 배려 요청, 연결 기록이 바로 지워져요. 자세한 내용은 개인정보 처리방침에 있어요.",
  },
];

/** 구조화 데이터 — "<" 를 막아 스크립트가 끊기지 않게 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description: HOME_DESCRIPTION,
        applicationCategory: "HealthApplication",
        operatingSystem: "Web, Android, iOS",
        browserRequirements: "Requires JavaScript",
        inLanguage: "ko",
        image: `${SITE_URL}/og`,
        offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
        publisher: { "@type": "Organization", name: "두나", email: "12jason@donacouse.com" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
}
