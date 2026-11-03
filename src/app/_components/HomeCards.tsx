import { HOME_TOP_ID } from "@/lib/calendar";
import { formatDay } from "@/lib/dates";
import { cycleLine, MOON_WAITING, moonPath, nextLine, type MoonShape } from "@/lib/moon";
import type { Prediction } from "@/lib/prediction";
import { errorLabel } from "@/lib/report";
import { careLabel, RESPONSES, type CareView } from "@/lib/services/care";
import { CareReplies } from "./QuickHome";

export function Logo() {
  return <p className="text-xl font-semibold tracking-tight text-accent">우리주기</p>;
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
export function TopBar({ moon, main, sub, children }: Status & { moon: MoonShape; children?: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border-[0.5px] border-line bg-gradient-to-br from-period/40 to-fertile px-3.5 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <MoonPhase moon={moon} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-snug tracking-tight">{main}</p>
          {sub && <p className="text-[13px] leading-snug text-ink/80">{sub}</p>}
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>}
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

/** 기록할수록 나아진다는 안내. 간격이 3개 이상이면 지난 예측이 며칠 차이 났는지 함께 보여준다. */
export function PredictionNote({ error }: { error: { days: number } | null }) {
  return (
    <p className="mt-3 text-center text-[13px] leading-relaxed text-muted">
      기록할수록 정확해지는 예측
      {error && <span className="block">최근 예측 오차 {errorLabel(error.days)}</span>}
    </p>
  );
}

/** 파트너가 보는 배려 요청 카드. readOnly면 미리보기용으로 동작 없이 그린다. */
export function CareCard({ care, today, featured, readOnly }: { care: CareView; today: string; featured?: boolean; readOnly?: boolean }) {
  return (
    <article className="card">
      <p className="text-[13px] text-muted">{care.day === today ? "오늘" : formatDay(care.day)}</p>
      <ul className="mt-1 space-y-1">
        {care.presets.map((key) => (
          <li key={key} className={`font-medium leading-snug ${featured ? "text-xl tracking-tight" : "text-[17px]"}`}>{careLabel(key)}</li>
        ))}
      </ul>
      {care.message && <p className="mt-2 text-[15px] leading-relaxed">“{care.message}”</p>}
      <CareReplies careId={care.id} current={care.response} responses={RESPONSES} readOnly={readOnly} />
    </article>
  );
}
