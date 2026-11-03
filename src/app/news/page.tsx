import { redirect } from "next/navigation";

/** 예전 새 소식 페이지 주소. 이제는 홈에서 새 소식 시트가 열린 채로 시작한다(푸시 알림도 이 주소로 온다). */
export default function NewsPage() {
  redirect("/?news=1");
}
