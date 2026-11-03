import { Activity, ChevronRight, Eye, HeartHandshake, Link2, Smile } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { calendarWindow } from "@/lib/calendar";
import { tipFor } from "@/lib/content/phases";
import { getDb, type DB } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { bodyChips, type DayLog } from "@/lib/daylog";
import { CRESCENT, cycleLine, MOON_WAITING, moonShape, nextLine } from "@/lib/moon";
import { phaseFrom, type Phase } from "@/lib/phase";
import { calendarMarks, endQuestion, estimate } from "@/lib/prediction";
import { consentDone, type User } from "@/lib/services/auth";
import { careChip, careGroup, getCare, orderPresets, recentPresets } from "@/lib/services/care";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { listDayLogs } from "@/lib/services/daylogs";
import { partnerView } from "@/lib/services/partner";
import { currentPeriod, listPeriods, usualCycle } from "@/lib/services/periods";
import { currentUser } from "@/lib/session";
import { checkSharingAction } from "./actions";
import { AppHeader } from "./_components/AppHeader";
import { Chip, IconBadge } from "./_components/Chip";
import { HomeCalendar } from "./_components/HomeCalendar";
import { CareCard, HomeTop, recorderStatus, TopBar } from "./_components/HomeCards";
import { Landing } from "./_components/Landing";
import { Nav } from "./_components/Nav";
import { BLOCK } from "./_components/PageSkeleton";
import { EndQuestion, EndTodayButton, StartTodayButton } from "./_components/PeriodButtons";
import { QuickCare, QuickLog } from "./_components/QuickHome";
import { LINE_CARD } from "./_components/Sheet";
import { TodayRefresh } from "./_components/TodayRefresh";
import { WeekStrip } from "./_components/WeekStrip";

export const dynamic = "force-dynamic";

/** "오늘 끝났어요" 버튼은 생리 3일째부터 띄운다. */
const END_BUTTON_FROM_DAY = 3;

const TITLE = "디어데이 — 서로의 편이 되는 생리 기록";
const DESCRIPTION = "생리 주기를 기록하고, 필요한 배려를 연인과 주고받아요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

/** ?news=1이면 새 소식 시트가 열린 채로 시작한다(/news와 푸시 알림이 여기로 온다). */
export default async function Home({ searchParams }: { searchParams: Promise<{ news?: string }> }) {
  const user = await currentUser();
  if (!user) return <><TodayRefresh today={todaySeoul()} /><Landing /></>;
  if (!consentDone(user)) redirect("/consent");
  return (
    <>
      <TodayRefresh today={todaySeoul()} />
      <AppHeader user={user} openNews={(await searchParams).news !== undefined} />
      {user.role === "recorder" ? <RecorderHome user={user} /> : <PartnerHome user={user} />}
      <Nav role={user.role} active="home" />
    </>
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

/** 위 칸이 먼저 그려지고 뒤에 도착해도 되는 것들. 두 자리가 한 번의 조회를 나눠 쓴다. */
async function careAndPartner(db: DB, user: User, today: string) {
  const [care, couple, used] = await Promise.all([getCare(db, user, today), activeCouple(db, user.id), recentPresets(db, user, today)]);
  return { care, couple, used, partnerName: couple ? await otherNickname(db, couple, user) : null };
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

async function CareSlot({ data, group }: { data: CareAndPartner; group: "body" | "mind" | null }) {
  const { care, couple, used } = await data;
  const canShare = Boolean(couple && !couple.paused);
  const status = careChip(care, canShare);
  const presets = orderPresets(used, group);
  return (
    <QuickCare
      key={`${care?.presets.join()}|${care?.message}|${care?.shareWithPartner}`}
      presets={presets} current={care} canShare={canShare}
      status={status && <Chip icon={<HeartHandshake size={12} aria-hidden />} tone={status.sent ? "period" : "muted"}>{status.label}</Chip>}
    />
  );
}

/** 오늘의 통증·기분 칩. */
const BODY_CHIP = "inline-flex h-9 max-w-full items-center gap-1 rounded-full px-3.5 text-[14px] font-medium"; // 칩 기준(ui.ts): 36px·14px·500

/** 파트너 홈 맨 위 카드 바로 아래의 한 줄. 오늘 남긴 통증·기분이 없으면 그리지 않는다. */
function TodayBody({ name, log }: { name: string; log: Pick<DayLog, "pain" | "moods"> | null }) {
  const { pain, mood } = log ? bodyChips(log) : { pain: null, mood: null };
  if (!pain && !mood) return null;
  return (
    <div className="card flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 py-2.5">
      <p className="mr-0.5 text-[15px] font-normal tracking-tight">오늘 {name}님</p>
      {pain && <span className={`${BODY_CHIP} bg-period text-period-ink`}><Activity size={14} aria-hidden /><span className="truncate">{pain}</span></span>}
      {mood && <span className={`${BODY_CHIP} bg-fertile text-fertile-ink`}><Smile size={14} aria-hidden /><span className="truncate">{mood}</span></span>}
    </div>
  );
}

async function RecorderHome({ user }: { user: User }) {
  const db = await getDb();
  const today = todaySeoul();
  const [periods, usual, logs] = await Promise.all([listPeriods(db, user.id), usualCycle(db, user.id), listDayLogs(db, user.id)]);
  const data = careAndPartner(db, user, today);
  const prediction = estimate(periods, [], today, usual);
  const current = currentPeriod(periods, today);
  const question = endQuestion(periods, today);
  const { first, last } = calendarWindow(today);

  return (
    <>
      <HomeTop><WeekStrip today={today} marks={calendarMarks(periods, prediction, first, last, today)} /></HomeTop>

      <div className="space-y-2 pb-3 pt-1">
        <TopBar moon={moonShape(prediction, today)} {...recorderStatus(prediction, current, today)} />
        {question && <EndQuestion question={question} today={today} />}
        {current && <QuickLog key={today} day={today} initial={logs.find((l) => l.day === today) ?? null} />}
        <Suspense><ConnectLine data={data} /></Suspense>
        <Suspense><SharingNotice data={data} /></Suspense>
        <Suspense fallback={<div className={`${BLOCK} h-40`} />}><CareSlot data={data} group={careGroup(Boolean(current), prediction.period?.startDate, today)} /></Suspense>
        <TipLine phase={phaseFrom(Boolean(current), prediction.fertileWindow, today)} today={today} />
      </div>

      {/* 떠 있는 버튼: 생리 중이 아니면 작은 "오늘 시작했어요", 진행 중이면 3일째부터 "오늘 끝났어요".
          1~2일째에는 끝날 리 거의 없어서 띄우지 않는다(필요하면 달력에서 끝난 날을 고를 수 있다). */}
      {/* 끝났는지 묻는 카드(EndQuestion)가 떠 있으면 같은 일을 하는 떠 있는 버튼은 숨긴다(진한 분홍 버튼은 한 화면에 하나). */}
      {(current ? current.open && current.day >= END_BUTTON_FROM_DAY && !question : true) && (
        <div data-floating className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-20 mx-auto max-w-md px-6 [&_.btn]:shadow-lg [&_button]:pointer-events-auto">
          {current ? <EndTodayButton id={current.id} compact /> : <StartTodayButton compact />}
        </div>
      )}
    </>
  );
}

async function PartnerHome({ user }: { user: User }) {
  const db = await getDb();
  const today = todaySeoul();
  const view = await partnerView(db, user, today);

  if (!view) {
    return (
      <>
        <HomeTop><TopBar moon={CRESCENT} main="연결이 필요해요" sub="상대에게 받은 코드를 입력하면 오늘 필요한 배려를 함께 볼 수 있어요." /></HomeTop>
        <div className="mt-10"><Link href="/connect" className="btn">코드 입력하기</Link></div>
      </>
    );
  }

  const name = view.recorderNickname;
  if (view.paused) {
    return (
      <>
        <HomeTop><TopBar moon={view.moon} main={`${name}님은 잠시 쉬는 중`} sub="지금은 공유를 잠시 멈췄어요." /></HomeTop>
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
        <TopBar moon={view.moon} main={line} sub={nextLine(view.nextPeriod, today)} />
        <TodayBody name={name} log={view.todayBody} />
      </HomeTop>
      <div className="pb-4">
        <HomeCalendar
          today={today} marks={view.calendar}
          quick={first && (
            <div className="space-y-2">
              <CareCard care={first} today={today} featured={first.day === today} />
              {others.length > 0 && (
                <details className="px-1 text-[13px]">
                  <summary className="link cursor-pointer list-none leading-9">지난 요청 {others.length}개</summary>
                  <div className="space-y-2">{others.map((c) => <CareCard key={c.id} care={c} today={today} />)}</div>
                </details>
              )}
            </div>
          )}
        />
      </div>
    </>
  );
}
