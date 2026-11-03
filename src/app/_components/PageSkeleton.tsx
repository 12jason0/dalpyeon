import { CRESCENT } from "@/lib/moon";
import { MoonPhase } from "./HomeCards";
import { LoadingHeader, LoadingNav } from "./Nav";

export const BLOCK = "animate-pulse rounded-[18px] bg-line motion-reduce:animate-none";

/** 메뉴를 누르자마자 보이는 화면. 프리페치로 미리 받아 두므로 DB를 쓰지 않는다. */
export function PageSkeleton({ active }: { active: React.ComponentProps<typeof LoadingNav>["active"] }) {
  return (
    <>
      <LoadingHeader />
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
      <LoadingHeader />
      <div role="status" aria-label="불러오는 중">
        <div className="flex items-center gap-3">
          <div className="animate-pulse motion-reduce:animate-none"><MoonPhase moon={CRESCENT} /></div>
          <div className={`${BLOCK} h-10 w-44`} />
        </div>
        <div className={`${BLOCK} mt-3 h-11`} />
        <div className={`${BLOCK} mt-2 h-11`} />
        <div className={`${BLOCK} mt-6 h-96`} />
      </div>
      <LoadingNav active="home" />
    </>
  );
}
