import { ChevronRight, Droplet } from "lucide-react";
import { PHASES } from "@/lib/content/phases";
import { diffDays, formatDay } from "@/lib/dates";
import type { Phase } from "@/lib/phase";
import type { Prediction } from "@/lib/prediction";
import { CARE_PRESETS, RESPONSES, type CareView } from "@/lib/services/care";
import { respondAction } from "../actions";

export function Logo() {
  return <p className="text-xl font-semibold tracking-tight text-accent">우리주기</p>;
}

export function untilText(days: number) {
  if (days > 0) return `${days}일`;
  if (days === 0) return "오늘";
  return `${-days}일 지남`;
}

type Status = { label?: string; main: string; sub?: string };

/** 기록자 홈 맨 위 상태 한 줄에 들어갈 문구. */
export function recorderStatus(prediction: Prediction, current: { day: number; open: boolean } | null, today: string, count: number): Status {
  if (current) return { main: `생리 ${current.day}일째`, sub: current.open ? "끝나면 알려주세요." : undefined };
  const p = prediction.period;
  if (p && (prediction.status === "estimated" || prediction.status === "variable_cycles")) {
    const days = diffDays(p.startDate, today);
    return { label: days >= 0 ? "생리 예정일까지" : "예상일이", main: `${untilText(days)} · ${formatDay(p.startDate)}` };
  }
  if (prediction.status === "awaiting_new_record") return { main: "기다리는 중", sub: "예상했던 범위가 지났어요. 시작하면 바로 기록해 주세요." };
  if (prediction.status === "needs_record_review") {
    return { main: "기록 확인 필요", sub: "간격이 15일보다 짧거나 90일보다 긴 기록이 있어요. 날짜가 맞는지 확인해 주세요." };
  }
  return { main: "기록 모으는 중", sub: `생리 시작일을 4번 기록하면 다음 날짜를 예상해 드려요. 지금 ${count}번 기록했어요.` };
}

export function StatusLine({ label, main, sub }: Status) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-period text-period-ink">
        <Droplet size={22} aria-hidden />
      </span>
      <div className="min-w-0">
        {label && <p className="text-[13px] text-muted">{label}</p>}
        <p className="text-xl font-semibold tracking-tight">{main}</p>
        {sub && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{sub}</p>}
      </div>
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
  const { title, line, symptoms, tips } = PHASES[phase];
  return (
    <>
      <div className="card">
        <p className="text-[15px] font-medium">오늘 내 몸 · {title}</p>
        <p className="mt-1 text-[15px] leading-relaxed">{line}</p>
        <p className="mt-1 text-[13px] text-muted">{symptoms.join(" · ")}</p>
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
