"use client";
import { Bell, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NewsItem } from "@/lib/services/push";
import { openNewsAction } from "../actions";
import { Fold } from "./Fold";
import { Sheet } from "./Sheet";

/**
 * 헤더의 종. 누르면 지금 화면은 그대로 두고 종 아래에 떠 있는 새 소식 카드가 접힌 종이처럼 펼쳐진다.
 * 여는 순간 읽음 처리(openNewsAction)를 하고, 서버 응답을 기다리지 않고 분홍 점부터 숨긴다.
 * initiallyOpen은 /news(푸시 알림)로 들어와 홈에서 시트가 열린 채 시작할 때. 닫으면 주소의 ?news를 지운다.
 */
export function NewsBell({ dot, initiallyOpen = false }: { dot?: React.ReactNode; initiallyOpen?: boolean }) {
  const router = useRouter();
  const bell = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [seen, setSeen] = useState(false);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setSeen(true);
    setItems(null);
    setFailed(false);
    openNewsAction().then(setItems, () => setFailed(true));
  };

  // 알림으로 들어와 처음부터 열려 있으면 그때 바로 읽음 처리한다
  useEffect(() => {
    if (initiallyOpen) load();
  }, [initiallyOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // history.replaceState로만 바꾸면 읽음 처리 응답이 늦게 도착할 때 라우터가 ?news=1로 되돌린다. 라우터로 바꾼다.
  const close = () => {
    setOpen(false);
    if (new URLSearchParams(window.location.search).has("news")) router.replace(window.location.pathname, { scroll: false });
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <>
      <button
        ref={bell} type="button" aria-label="새 소식" aria-haspopup="dialog" onClick={() => { setOpen(true); load(); }}
        className="relative -mr-3 flex h-11 w-11 items-center justify-center text-muted"
      >
        <Bell size={22} aria-hidden />
        {!seen && dot}
      </button>
      <Sheet open={open} title="새 소식" onClose={close} maxHeight="70dvh" swipeToClose from="top" anchor={bell}>
        {items === null
          ? <p className="py-8 text-center text-[15px] text-muted">{failed ? "불러오지 못했어요. 잠시 후 다시 열어 주세요" : "불러오는 중…"}</p>
          : items.length === 0
            ? <p className="py-8 text-center text-[15px] text-muted">새 소식이 없어요</p>
            : (
              // 펼치기: 카드를 열 때마다 소식이 위에서부터 하나씩 접힌 종이처럼 펴진다
              <ul className="-mx-1 divide-y divide-line">
                {items.map((item, i) => (
                  <Fold key={item.id} i={i}>
                    <button type="button" onClick={() => go(item.href)} className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left active:bg-ink/[0.06]">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] text-muted">{item.title}</span>
                          <span className="shrink-0 text-[12px] text-muted">{item.when}</span>
                        </span>
                        <span className="mt-0.5 block text-[16px] leading-snug">{item.body}</span>
                        {item.detail && <span className="mt-0.5 block truncate text-[13px] text-muted">{item.detail}</span>}
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
                    </button>
                  </Fold>
                ))}
              </ul>
            )}
      </Sheet>
    </>
  );
}
