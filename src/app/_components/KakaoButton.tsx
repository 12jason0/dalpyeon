import { ErrorText } from "./Submit";

/** API로 가는 전체 페이지 이동이라 Link를 쓰지 않는다. .btn 색은 style로 덮는다. */
export function KakaoButton({ code, failed }: { code?: string; failed?: boolean }) {
  const href = code ? `/api/auth/kakao?code=${encodeURIComponent(code)}` : "/api/auth/kakao";
  return (
    <div className="mb-6">
      <a href={href} className="btn w-full" style={{ background: "#FEE500", color: "#191919" }}>카카오로 시작하기</a>
      <ErrorText message={failed ? "카카오 로그인을 마치지 못했어요. 다시 시도해 주세요" : undefined} />
    </div>
  );
}
