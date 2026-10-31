import { LoadingNav } from "./Nav";

const BLOCK = "animate-pulse rounded-[18px] bg-line motion-reduce:animate-none";

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
