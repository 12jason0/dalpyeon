import { ChevronRight } from "lucide-react";
import { PHASES } from "@/lib/content/phases";
import { formatDay } from "@/lib/dates";
import { cycleLine, MOON_WAITING, moonPath, nextRange, type MoonShape } from "@/lib/moon";
import type { Phase } from "@/lib/phase";
import type { Prediction } from "@/lib/prediction";
import { CARE_PRESETS, RESPONSES, type CareView } from "@/lib/services/care";
import { markNewsSeenAction, respondAction } from "../actions";

export function Logo() {
  return <p className="text-xl font-semibold tracking-tight text-accent">우리주기</p>;
}

/** 알림을 거부한 사람도 볼 수 있는 새 소식 표시. */
export function NewsDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <form action={markNewsSeenAction}>
      <button type="submit" className="flex h-11 items-center gap-1.5 text-[13px] text-muted">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
        새 소식
      </button>
    </form>
  );
}

const MOON_RADIUS = 80;

/** 홈 맨 위의 달. 모양 계산은 lib/moon. 오늘 상태는 바로 아래 문구가 읽어 주므로 그림은 숨긴다. */
export function MoonPhase({ moon }: { moon: MoonShape }) {
  const size = MOON_RADIUS * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto mt-6 block" aria-hidden>
      <circle cx={MOON_RADIUS} cy={MOON_RADIUS} r={MOON_RADIUS} className="fill-moon-dark" />
      <path d={moonPath(moon, MOON_RADIUS)} className="fill-moon-lit" />
    </svg>
  );
}

type Status = { main: string; sub?: string };

/** 기록자 홈의 달 아래 문구. */
export function recorderStatus(prediction: Prediction, current: { day: number } | null, today: string): Status {
  if (!current && prediction.status === "needs_record_review") {
    return { main: "기록 확인 필요", sub: "기간이 31일보다 긴 기록이 있어요. 날짜가 맞는지 확인해 주세요." };
  }
  return {
    main: cycleLine(current, prediction.period?.startDate ?? null, prediction.fertileWindow, today) ?? MOON_WAITING,
    sub: nextRange(current, prediction.period, today),
  };
}

export function StatusLine({ main, sub }: Status) {
  return (
    <div className="mt-4 text-center">
      <p className="text-xl font-semibold tracking-tight">{main}</p>
      {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function PhaseCards({ phase }: { phase: Phase | null }) {
  if (!phase) {
    return (
      <div className="card">
        <p className="text-[15px] font-medium">오늘 내 몸</p>
        <p className="mt-1 text-[13px] text-muted">기록이 쌓이면 알려드려요</p>
      </div>
    );
  }
  const { title, symptoms, tips } = PHASES[phase];
  return (
    <>
      <div className="card">
        <p className="text-[15px] font-medium">오늘 내 몸 · {title}</p>
        <p className="mt-3 text-[13px] text-muted">이 시기에 흔한 변화</p>
        <ul className="mt-1 space-y-1 text-[15px] leading-snug">
          {symptoms.map((s) => <li key={s}>{s}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-muted">일반적인 정보예요. 사람마다 달라요.</p>
      </div>
      <div className="card">
        <p className="text-[15px] font-medium">오늘 챙기면 좋은 것</p>
        <ul className="mt-2 space-y-2">
          {tips.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-[15px] leading-snug">
              <Icon size={18} className="shrink-0 text-muted" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">일반적인 정보예요. 사람마다 달라요.</p>
      </div>
    </>
  );
}

/** 접혀 있는 배려 카드. 펼치면 children(CareForm)이 나온다. */
export function CareSummaryCard({ summary, children }: { summary: string; children?: React.ReactNode }) {
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">오늘 필요한 배려</span>
          <span className="mt-0.5 block text-[13px] text-muted">{summary}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** 파트너가 보는 배려 요청 카드. readOnly면 미리보기용으로 동작 없이 그린다. */
export function CareCard({ care, today, featured, readOnly }: { care: CareView; today: string; featured?: boolean; readOnly?: boolean }) {
  return (
    <article className="card">
      <p className="text-[13px] text-muted">{care.day === today ? "오늘" : formatDay(care.day)}</p>
      <ul className="mt-1 space-y-1">
        {care.presets.map((key) => (
          <li key={key} className={`font-medium leading-snug ${featured ? "text-2xl tracking-tight" : "text-xl"}`}>{CARE_PRESETS[key]}</li>
        ))}
      </ul>
      {care.message && <p className="mt-2 text-[15px] leading-relaxed">“{care.message}”</p>}
      <form action={readOnly ? undefined : respondAction} className="mt-4 flex gap-2">
        <input type="hidden" name="careId" value={care.id} />
        {Object.entries(RESPONSES).map(([key, label]) => (
          <button
            key={key} name="response" value={key} type={readOnly ? "button" : "submit"}
            className={`h-11 flex-1 rounded-full border text-[15px] transition ${
              care.response === key ? "border-accent bg-accent font-semibold text-white" : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </form>
    </article>
  );
}
