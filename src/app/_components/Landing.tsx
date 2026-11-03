import { Bell, CalendarDays, Flower2, HeartHandshake } from "lucide-react";
import Link from "next/link";
import { exampleHome } from "@/lib/content/example";
import { monthGrid, todaySeoul } from "@/lib/dates";
import { moonShape } from "@/lib/moon";
import { calendarMarks, DISCLAIMER, ESTIMATE_NOTE, estimate } from "@/lib/prediction";
import { CARE_PRESETS, RESPONSES } from "@/lib/services/care";
import { CalendarMonth } from "./CalendarMonth";
import { CareCard, Logo, recorderStatus, TopBar } from "./HomeCards";
import { LINE_CARD } from "./Sheet";

const FEATURES = [
  { icon: HeartHandshake, title: "연인에게 배려 요청하고 답장 받기", line: "말하기 어려운 날, 버튼 하나로 전해요." },
  { icon: Flower2, title: "오늘 내 몸 상태와 팁", line: "지금 시기에 흔한 변화와 챙길 것을 알려드려요." },
  { icon: CalendarDays, title: "내 주기에 맞춘 예측 달력", line: "기록이 쌓일수록 내 주기에 가까워져요." },
];
const SHARED = ["생리 기록과 다음 생리 예상", "가임기·배란일 (추정)", "오늘의 통증·기분", "배려 요청"];

/** 미리보기는 DB를 읽지 않고, 예시 기록을 실제 홈과 같은 계산·컴포넌트로 그린다. */
function HomePreview({ today }: { today: string }) {
  const { periods, month } = exampleHome(today);
  const prediction = estimate(periods, [], today);
  const { first, last } = monthGrid(month);
  return (
    <div inert className="pointer-events-none mx-auto select-none overflow-hidden rounded-[2.25rem] border-4 border-line bg-paper px-3 pb-6 pt-6">
      <TopBar plain moon={moonShape(prediction, today)} {...recorderStatus(prediction, null, today)} />
      <p className={`${LINE_CARD} mt-3`}>오늘 필요한 배려 · 도윤 · 도와줄게요</p>
      <CalendarMonth month={month} marks={calendarMarks(periods, prediction, first, last, today)} today={today} />
    </div>
  );
}

function FlowStep({ number, title, last, children }: { number: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex flex-col items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-period text-[15px] font-semibold text-period-ink">{number}</span>
        {!last && <span className="w-px flex-1 bg-line" aria-hidden />}
      </span>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-8"}`}>
        <p className="pt-1.5 text-[17px] font-medium">{title}</p>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  );
}

function CareFlow() {
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-semibold leading-snug tracking-tight">말 대신 버튼 하나로 전해요</h2>
      <ol className="mt-6">
        <FlowStep number={1} title="오늘 필요한 걸 골라 보내요">
          <div className="card">
            <p className="text-xl font-medium leading-snug">{CARE_PRESETS.warm_food}</p>
            <p className="mt-1 text-[15px] leading-relaxed">“오늘 배가 좀 아파”</p>
          </div>
        </FlowStep>
        <FlowStep number={2} title="연인에게 알림이 가요">
          <div className="card flex items-center gap-3">
            <Bell size={22} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] text-muted">우리주기</span>
              <span className="block text-[15px] font-medium">새 배려 요청이 왔어요 💗</span>
            </span>
          </div>
        </FlowStep>
        <FlowStep number={3} title="답장이 돌아와요" last>
          <div className="card flex items-center justify-between gap-3">
            <span className="text-[15px] text-muted">도윤</span>
            <span className="rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white">{RESPONSES.will_help}</span>
          </div>
        </FlowStep>
      </ol>
    </section>
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
  const today = todaySeoul();
  const { care } = exampleHome(today);
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

      <CareFlow />

      <section className="mt-16">
        <p className="mb-3 text-center text-[13px] text-muted">예시 화면</p>
        <HomePreview today={today} />
      </section>

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
        <div inert className="pointer-events-none mt-5 select-none"><CareCard care={care} today={today} featured readOnly /></div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">연결하면 함께 봐요</h2>
        <ul inert className="card mt-5">
          {SHARED.map((label) => <li key={label} className="border-b border-line py-3 text-[15px]">{label}</li>)}
          <li className="flex items-center justify-between gap-4 py-3 text-[15px]">
            잠시 멈추기
            <input type="checkbox" className="switch" tabIndex={-1} aria-label="잠시 멈추기" />
          </li>
        </ul>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">멈추고 싶은 날에는 &ldquo;잠시 쉬는 중&rdquo;만 보여요. 가임기·배란일은 {ESTIMATE_NOTE}</p>
      </section>

      <div className="mt-16"><StartLinks /></div>
      <p className="mt-8 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
      <p className="mt-3 text-xs"><Link href="/me/privacy" className="link">개인정보 처리방침</Link></p>
    </>
  );
}
