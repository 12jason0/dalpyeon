import { FAQ, HOME_DESCRIPTION, SITE_URL } from "@/lib/seo";

// AI 검색(ChatGPT·Perplexity 등)용 사이트 요약 — https://llmstxt.org
export const dynamic = "force-static";

export function GET() {
  const text = `# 디어데이

> ${HOME_DESCRIPTION}

디어데이는 생리주기를 기록하고 연인과 공유하는 무료 커플 생리 웹앱입니다. 앱 스토어 설치 없이 휴대폰 브라우저에서 쓰고, 홈 화면에 추가해 알림을 받을 수 있습니다. 운영: 두나.

## 주요 기능
- 생리 기록과 다음 생리 예정일 예측 (지난 주기 간격 기반)
- 가임기·배란일 계산 (예정일 14일 전 기준 추정, 피임·진단 용도 아님)
- 커플 생리 달력: 연인과 8자리 코드로 연결해 생리주기 공유, 공유 시작일 설정·잠시 멈추기
- 배려 요청과 오늘의 쪽지: 버튼 하나로 필요한 배려를 연인에게 알림
- 오늘의 통증·기분 기록과 시기별 몸 상태 팁

## 자주 묻는 질문
${FAQ.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

## 페이지
- [소개](${SITE_URL}/)
- [처음 시작하기](${SITE_URL}/signup)
- [받은 코드로 시작하기](${SITE_URL}/join)
- [개인정보 처리방침](${SITE_URL}/me/privacy)
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
