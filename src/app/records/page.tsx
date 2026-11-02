import { redirect } from "next/navigation";

/** 예전 주소. 홈 화면에 저장된 링크가 끊기지 않게 옮겨 준다. */
export default function RecordsPage() {
  redirect("/report");
}
