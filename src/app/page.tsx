import { Activity, BookOpen, ChevronRight, Eye, HeartHandshake, Link2, Smile } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { calendarWindow } from "@/lib/calendar";
import { articleFor } from "@/lib/content/articles";
import { tipFor } from "@/lib/content/phases";
import { getDb, type DB } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { bodyChips, type DayLog } from "@/lib/daylog";
import { CRESCENT, cycleLine, MOON_WAITING, moonShape, nextLine } from "@/lib/moon";
import { phaseFrom, type Phase } from "@/lib/phase";
import { calendarMarks, DISCLAIMER, endQuestion, ESTIMATE_NOTE, estimate, predictionError } from "@/lib/prediction";
import { consentDone, type User } from "@/lib/services/auth";
import { CARE_PRESETS, careChip, getCare } from "@/lib/services/care";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { listDayLogs } from "@/lib/services/daylogs";
import { partnerView } from "@/lib/services/partner";
import { newsFor } from "@/lib/services/push";
import { currentPeriod, listPeriods, usualCycle } from "@/lib/services/periods";
import { currentUser } from "@/lib/session";
import { checkSharingAction } from "./actions";
import { Chip, IconBadge } from "./_components/Chip";
import { CareForm } from "./_components/CareForm";
import { HOME_TOP_ID, HomeCalendar } from "./_components/HomeCalendar";
import { CareCard, NewsDot, PredictionNote, recorderStatus, TopBar } from "./_components/HomeCards";
import { Landing } from "./_components/Landing";
import { Nav } from "./_components/Nav";
import { BLOCK } from "./_components/PageSkeleton";
import { EndQuestion, EndTodayButton, StartTodayButton } from "./_components/PeriodButtons";
import { QuickCare, QuickLog } from "./_components/QuickHome";
import { LINE_CARD, SheetLink } from "./_components/Sheet";

export const dynamic = "force-dynamic";

const TITLE = "우리주기 — 서로의 편이 되는 생리 기록";
const DESCRIPTION = "생리 주기를 기록하고, 필요한 배려를 연인과 주고받아요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Landing />;
  if (!consentDone(user)) redirect("/consent");
  return (
    <>
      {user.role === "recorder" ? <RecorderHome user={user} /> : <PartnerHome user={user} />}
      <Nav role={user.role} active="home" />
    </>
  );
}

/** 스크롤해도 맨 위에 남는 자리. 달력의 지난달이 이 아래로 지나간다. */
function HomeTop({ children }: { children: React.ReactNode }) {
  return (
    <div id={HOME_TOP_ID} className="sticky top-0 z-10 -mx-6 -mt-8 space-y-2 bg-paper px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
    </div>
  );
}

/** 파트너의 상식 글. 제목과 첫 두 줄을 보여주고, 더보기로 글 전체로 간다. */
function ArticleCard({ phase, today }: { phase: Phase | null; today: string }) {
  const article = articleFor(phase, today);
  return (
    <article className="card">
      <div className="flex items-center gap-3">
        <IconBadge><BookOpen size={15} /></IconBadge>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium">{article.title}</h2>
      </div>
      <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{article.body.join(" ")}</p>
      <Link href={`/learn/${article.slug}`} className="link mt-1 inline-block text-[13px] leading-9">더보기</Link>
    </article>
  );
}

/** 기록자 홈의 한 줄. 오늘 시기에 챙기면 좋은 것 하나. 시기를 모르면 그리지 않는다. */
function TipLine({ phase, today }: { phase: Phase | null; today: string }) {
  const tip = tipFor(phase, today);
  if (!tip) return null;
  return (
    <p className={LINE_CARD}>
      <IconBadge><tip.icon size={15} /></IconBadge>
      <span className="min-w-0 flex-1 truncate">{tip.text}</span>
    </p>
  );
}

function CalendarNotes({ children }: { children?: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3">
      {children}
      <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">가임기·배란일은 {ESTIMATE_NOTE}</p>
      <p className="mt-1 text-center text-[11px] leading-relaxed text-muted">{DISCLAIMER}</p>
    </div>
  );
}

async function News({ db, user, today, pick }: { db: DB; user: User; today: string; pick: "replies" | "care" }) {
  return <NewsDot show={(await newsFor(db, user, today))[pick] > 0} />;
}

/** 위 칸이 먼저 그려지고 뒤에 도착해도 되는 것들. 두 자리가 한 번의 조회를 나눠 쓴다. */
async function careAndPartner(db: DB, user: User, today: string) {
  const [care, couple] = await Promise.all([getCare(db, user, today), activeCouple(db, user.id)]);
  return { care, couple, partnerName: couple ? await otherNickname(db, couple, user) : null };
}
type CareAndPartner = ReturnType<typeof careAndPartner>;

async function SharingNotice({ data }: { data: CareAndPartner }) {
  const { partnerName, couple } = await data;
  if (!partnerName || !couple?.sharingNotice) return null;
  return (
    <form action={checkSharingAction}>
      <button type="submit" className={LINE_CARD}>
        <IconBadge><Eye size={15} /></IconBadge>
        <span className="min-w-0 flex-1 truncate">{partnerName}님에게 보이는 항목 확인하기</span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </button>
    </form>
  );
}

/** 아직 연결하지 않은 기록자에게만 보인다. */
async function ConnectLine({ data }: { data: CareAndPartner }) {
  if ((await data).couple) return null;
  return (
    <Link href="/connect" className={LINE_CARD}>
      <IconBadge><Link2 size={15} /></IconBadge>
      <span className="min-w-0 flex-1 truncate">파트너 연결하기</span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

async function CareSlot({ data }: { data: CareAndPartner }) {
  const { care, couple } = await data;
  const canShare = Boolean(couple && !couple.paused);
  const shareHint = !couple
    ? "파트너와 연결하면 보낼 수 있어요"
    : couple.paused
      ? "연결 화면에서 잠시 멈추기를 끄면 보낼 수 있어요"
      : null;
  const status = careChip(care, canShare);
  return (
    <QuickCare
      key={`${care?.presets.join()}|${care?.message}|${care?.shareWithPartner}`}
      presets={CARE_PRESETS} current={care} canShare={canShare} hint={shareHint}
      status={<Chip icon={<HeartHandshake size={12} aria-hidden />} tone={status.sent ? "period" : "muted"}>{status.label}</Chip>}
      more={(
        <SheetLink label="나만 남기기·지우기" title="오늘 필요한 배려">
          <CareForm presets={CARE_PRESETS} current={care} canShare={canShare} shareHint={shareHint} />
        </SheetLink>
      )}
    />
  );
}

/** 오늘의 통증·기분 칩. */
function BodyChips({ log }: { log: Pick<DayLog, "pain" | "moods"> }) {
  const { pain, mood } = bodyChips(log);
  return (
    <>
      {pain && <Chip icon={<Activity size={12} aria-hidden />} tone="period">{pain}</Chip>}
      {mood && <Chip icon={<Smile size={12} aria-hidden />} tone="fertile">{mood}</Chip>}
    </>
  );
}

async function RecorderHome({ user }: { user: User }) {
  const db = await getDb();
  const today = todaySeoul();
  const [periods, usual, logs] = await Promise.all([listPeriods(db, user.id), usualCycle(db, user.id), listDayLogs(db, user.id)]);
  const data = careAndPartner(db, user, today);
  const prediction = estimate(periods, [], today, usual);
  const error = prediction.sampleSize >= 3 ? predictionError(periods, usual) : null;
  const current = currentPeriod(periods, today);
  const question = endQuestion(periods, today);
  const { first, last } = calendarWindow(today);

  return (
    <>
      <HomeTop>
        <TopBar
          moon={moonShape(prediction, today)} {...recorderStatus(prediction, current, today)}
          aside={<Suspense><News db={db} user={user} today={today} pick="replies" /></Suspense>}
        />
      </HomeTop>

      <div className="pb-16">
        <HomeCalendar
          today={today} marks={calendarMarks(periods, prediction, first, last, today)}
          recorder={{ periods: periods.map(({ id, startDate, endDate, autoEnded }) => ({ id, startDate, endDate, autoEnded })), logs }}
          quick={(
            <div className="space-y-2 pt-2">
              {question && <EndQuestion question={question} today={today} />}
              {current && <QuickLog key={today} day={today} initial={logs.find((l) => l.day === today) ?? null} />}
              <Suspense><ConnectLine data={data} /></Suspense>
              <Suspense><SharingNotice data={data} /></Suspense>
              <Suspense fallback={<div className={`${BLOCK} h-40`} />}><CareSlot data={data} /></Suspense>
              <TipLine phase={phaseFrom(Boolean(current), prediction.fertileWindow, today)} today={today} />
            </div>
          )}
        >
          <CalendarNotes>
            {prediction.status === "variable_cycles" && <p className="text-center text-[13px] text-muted">주기 차이가 커서 가임기는 표시하지 않아요.</p>}
            <PredictionNote error={error} />
          </CalendarNotes>
        </HomeCalendar>
      </div>

      {(current?.open || !current) && (
        <div data-floating className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-20 mx-auto max-w-md px-6 [&_.btn]:shadow-lg">
          {current?.open ? <EndTodayButton id={current.id} /> : <StartTodayButton />}
        </div>
      )}
    </>
  );
}

async function PartnerHome({ user }: { user: User }) {
  const db = await getDb();
  const today = todaySeoul();
  const view = await partnerView(db, user, today);
  const news = <Suspense><News db={db} user={user} today={today} pick="care" /></Suspense>;

  if (!view) {
    return (
      <>
        <HomeTop><TopBar moon={CRESCENT} main="연결이 필요해요" sub="상대에게 받은 코드를 입력하면 오늘 필요한 배려를 함께 볼 수 있어요." aside={news} /></HomeTop>
        <div className="mt-10"><Link href="/connect" className="btn">코드 입력하기</Link></div>
      </>
    );
  }

  const name = view.recorderNickname;
  if (view.paused) {
    return (
      <>
        <HomeTop><TopBar moon={view.moon} main={`${name}님은 잠시 쉬는 중`} sub="지금은 공유를 잠시 멈췄어요." aside={news} /></HomeTop>
        <div className="mt-2"><ArticleCard phase={null} today={today} /></div>
      </>
    );
  }

  const line = cycleLine(view.current, view.nextPeriod?.startDate ?? null, view.fertileWindow, today) ?? MOON_WAITING;
  // 아직 답하지 않은 요청을 먼저, 없으면 가장 최근 요청을 보여준다.
  const first = view.care.find((c) => !c.response) ?? view.care[0];
  const others = view.care.filter((c) => c !== first);

  return (
    <>
      <HomeTop>
        <TopBar moon={view.moon} main={line} sub={nextLine(view.nextPeriod, today)} aside={news}>
          {view.todayBody && <BodyChips log={view.todayBody} />}
        </TopBar>
      </HomeTop>
      <div className="pb-4">
        <HomeCalendar
          today={today} marks={view.calendar}
          quick={(
            <div className="space-y-2 pt-2">
              {first && <CareCard care={first} today={today} featured={first.day === today} />}
              {others.length > 0 && (
                <details className="px-1 text-[13px]">
                  <summary className="link cursor-pointer list-none leading-9">지난 요청 {others.length}개</summary>
                  <div className="space-y-2">{others.map((c) => <CareCard key={c.id} care={c} today={today} />)}</div>
                </details>
              )}
              <ArticleCard phase={view.phase} today={today} />
            </div>
          )}
        >
          <CalendarNotes />
        </HomeCalendar>
      </div>
    </>
  );
}
