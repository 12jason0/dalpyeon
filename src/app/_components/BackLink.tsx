import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** 상세 화면 맨 위의 뒤로가기 버튼. */
export function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="뒤로 가기" className="-ml-3 -mt-4 flex h-11 w-11 items-center justify-center text-muted">
      <ChevronLeft size={24} aria-hidden />
    </Link>
  );
}
