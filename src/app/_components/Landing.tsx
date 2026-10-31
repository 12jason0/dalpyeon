import { CalendarDays, Flower2, HeartHandshake } from "lucide-react";
import Link from "next/link";
import { monthGrid } from "@/lib/dates";
import { phaseOn } from "@/lib/phase";
import { calendarMarks, DISCLAIMER, estimate } from "@/lib/prediction";
import type { CareView } from "@/lib/services/care";
import { CareCard, CareSummaryCard, Logo, PhaseCards, recorderStatus, StatusLine } from "./HomeCards";
import { MonthCalendar } from "./MonthCalendar";

// 미리보기용 예시 데이터. DB를 읽지 않고, 실제 홈과 같은 계산·컴포넌트로 그린다.
const TODAY = "2026-10-23";
const MONTH = "2026-10";
const PERIODS = [
  { id: "1", startDate: "2026-07-08", endDate: "2026-07-12" },
  { id: "2", startDate: "2026-08-05", endDate: "2026-08-09" },
  { id: "3", startDate: "2026-09-02", endDate: "2026-09-06" },
  { id: "4", startDate: "2026-09-30", endDate: "2026-10-04" },
];
const CARE: CareView = {
  id: "example", day: TODAY, presets: ["warm_food", "empathy"], message: "오늘 배가 좀 아파", shareWithPartner: true, response: "will_help",
};
const FEATURES = [
  { icon: CalendarDays, title: "내 주기에 맞춘 예측 달력", line: "기록이 쌓일수록 내 주기에 가까워져요." },
  { icon: Flower2, title: "오늘 내 몸 상태와 팁", line: "지금 시기에 흔한 변화와 챙길 것을 알려드려요." },
  { icon: HeartHandshake, title: "연인에게 배려 요청하고 답장 받기", line: "말하기 어려운 날, 버튼 하나로 전해요." },
];
const SHARING = [
  { label: "생리 기록", on: false },
  { label: "예상일", on: true },
  { label: "가임기", on: false },
  { label: "배려 요청", on: true },
];

function HomePreview() {
  const prediction = estimate(PERIODS, [], TODAY);
  const { first, last } = monthGrid(MONTH);
  return (
    <div inert className="pointer-events-none mx-auto select-none overflow-hidden rounded-[2.25rem] border-4 border-line bg-paper px-2 pb-6 pt-6">
      <div className="px-2"><Logo /></div>
      <div className="px-2"><StatusLine {...recorderStatus(prediction, null, TODAY, PERIODS.length)} /></div>
      <div className="mt-4 px-2"><div className="btn">오늘 시작했어요</div></div>
      <div className="mt-4 space-y-2">
        <div className="card"><MonthCalendar month={MONTH} marks={calendarMarks(PERIODS, prediction, first, last, TODAY)} today={TODAY} basePath="/" /></div>
        <PhaseCards phase={phaseOn(PERIODS, TODAY)} />
        <CareSummaryCard summary="도윤 · 도와줄게요" />
      </div>
    </div>
  );
}

function StartLinks() {
  return (
    <div className="space-y-3">
      <Link href="/signup" className="btn">처음 시작하기</Link>
      <Link href="/join" className="btn-line">받은 코드로 시작하기</Link>
      <p className="pt-1 text-center text-sm"><Link href="/login" className="link">이미 계정이 있어요</Link></p>
    </div>
  );
}

export function Landing() {
  return (
    <>
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-[15px] text-muted">로그인</Link>
      </header>

      <section className="mt-14">
        <h1 className="text-[2.25rem] font-semibold leading-tight tracking-tight">말하기 어려운 날에도, 서로의 편.</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted">생리 주기를 기록하고, 필요한 배려를 연인과 주고받아요</p>
        <div className="mt-8"><StartLinks /></div>
      </section>

      <section className="mt-14"><HomePreview /></section>

      <ul className="mt-16 space-y-6">
        {FEATURES.map(({ icon: Icon, title, line }) => (
          <li key={title} className="flex gap-4">
            <Icon size={24} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="block text-[17px] font-medium">{title}</span>
              <span className="mt-1 block text-[15px] leading-relaxed text-muted">{line}</span>
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">연인은 코드 하나로 연결돼요</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">연결하면 오늘 필요한 배려가 이렇게 전해져요.</p>
        <div inert className="pointer-events-none mt-5 select-none"><CareCard care={CARE} today={TODAY} featured readOnly /></div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">보여줄 것은 내가 정해요</h2>
        <ul inert className="card mt-5">
          {SHARING.map(({ label, on }) => (
            <li key={label} className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px] last:border-b-0">
              {label}
              <input type="checkbox" className="switch" defaultChecked={on} tabIndex={-1} aria-label={label} />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16"><StartLinks /></div>
      <p className="mt-8 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </>
  );
}
