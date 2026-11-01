import { CRESCENT } from "@/lib/moon";
import { Logo, MoonPhase } from "./HomeCards";
import { LoadingNav } from "./Nav";

export const BLOCK = "animate-pulse rounded-[18px] bg-line motion-reduce:animate-none";

/** 메뉴를 누르자마자 보이는 화면. 프리페치로 미리 받아 두므로 DB를 쓰지 않는다. */
export function PageSkeleton({ active }: { active: React.ComponentProps<typeof LoadingNav>["active"] }) {
  return (
    <>
      <div role="status" aria-label="불러오는 중">
        <div className={`${BLOCK} h-10 w-32`} />
        <div className={`${BLOCK} mt-8 h-24`} />
        <div className={`${BLOCK} mt-3 h-56`} />
        <div className={`${BLOCK} mt-3 h-24`} />
      </div>
      <LoadingNav active={active} />
    </>
  );
}

/** 앱을 열었을 때 데이터보다 먼저 보이는 홈. 달은 고정 초승달이다. */
export function HomeSkeleton() {
  return (
    <>
      <div role="status" aria-label="불러오는 중">
        <Logo />
        <div className="animate-pulse motion-reduce:animate-none"><MoonPhase moon={CRESCENT} /></div>
        <div className={`${BLOCK} mx-auto mt-4 h-7 w-44`} />
        <div className={`${BLOCK} mt-6 h-14`} />
        <div className={`${BLOCK} mt-6 h-20`} />
        <div className={`${BLOCK} mt-3 h-80`} />
      </div>
      <LoadingNav active="home" />
    </>
  );
}
