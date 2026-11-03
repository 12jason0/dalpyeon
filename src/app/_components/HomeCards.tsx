import { HOME_TOP_ID } from "@/lib/calendar";
import { cycleLine, MOON_WAITING, moonPath, nextLine, type MoonShape } from "@/lib/moon";
import type { Prediction } from "@/lib/prediction";
import { careLabel, type CareView } from "@/lib/services/care";

export function Logo() {
  return <p className="text-xl font-medium tracking-tight text-accent">디어데이</p>;
}

const MOON_RADIUS = 16;

/** 홈 맨 위의 작은 달. 모양 계산은 lib/moon. 오늘 상태는 옆 문구가 읽어 주므로 그림은 숨긴다. */
export function MoonPhase({ moon }: { moon: MoonShape }) {
  const size = MOON_RADIUS * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block shrink-0" aria-hidden>
      <circle cx={MOON_RADIUS} cy={MOON_RADIUS} r={MOON_RADIUS} className="fill-moon-dark" />
      <path d={moonPath(moon, MOON_RADIUS)} className="fill-moon-lit" />
    </svg>
  );
}

type Status = { main: string; sub?: string };

/** 기록자 홈 맨 위의 문구. */
export function recorderStatus(prediction: Prediction, current: { day: number } | null, today: string): Status {
  if (!current && prediction.status === "needs_record_review") {
    return { main: "기록 확인 필요", sub: "기간이 31일보다 긴 기록이 있어요. 날짜가 맞는지 확인해 주세요." };
  }
  return {
    main: cycleLine(current, prediction.period?.startDate ?? null, prediction.fertileWindow, today) ?? MOON_WAITING,
    sub: nextLine(prediction.period, today),
  };
}

/** 홈 맨 위의 카드. children은 달과 문구 아래의 칩이다. */
export function TopBar({ moon, main, sub, children, footer }: Status & { moon: MoonShape; children?: React.ReactNode; footer?: string }) {
  return (
    <div className="rounded-[18px] border-[0.5px] border-line bg-gradient-to-br from-period/40 to-fertile px-3.5 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <MoonPhase moon={moon} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-normal leading-snug tracking-tight">{main}</p>
          {sub && <p className="text-[13px] leading-snug text-ink/80">{sub}</p>}
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
      {footer && <p className="mt-2 text-[13px] leading-snug text-ink/80">{footer}</p>}
    </div>
  );
}

/** 스크롤해도 헤더 바로 아래에 남는 자리. 달력이 이 아래로 지나간다. */
export function HomeTop({ children }: { children: React.ReactNode }) {
  return (
    <div id={HOME_TOP_ID} className="sticky top-[calc(52px+env(safe-area-inset-top))] z-10 -mx-6 -mt-4 space-y-2 bg-paper px-6 pb-2 pt-2">
      {children}
    </div>
  );
}

/** 파트너가 보는 부탁 카드. 제목은 "{이름}님의 부탁 · 오후 2:10", 항목마다 왼쪽에 연분홍 세로선. */
export function CareCard({ care, title }: { care: Pick<CareView, "presets" | "message">; title: string }) {
  const items = [...care.presets.map(careLabel), ...(care.message ? [`“${care.message}”`] : [])];
  return (
    <article className="card">
      <h2 className="text-[13px] font-medium text-muted">{title}</h2>
      <ul className="mt-2 space-y-1.5">
        {items.map((t) => <li key={t} className="border-l-[3px] border-period pl-2.5 text-[17px] leading-snug">{t}</li>)}
      </ul>
    </article>
  );
}
