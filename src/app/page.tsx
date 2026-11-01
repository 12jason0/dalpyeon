import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb, type DB } from "@/lib/db";
import { diffDays, formatDay, isMonth, monthGrid, shortDay, todaySeoul } from "@/lib/dates";
import { CRESCENT, cycleLine, MOON_WAITING, moonShape } from "@/lib/moon";
import { phaseOn } from "@/lib/phase";
import { calendarMarks, DISCLAIMER, estimate } from "@/lib/prediction";
import type { User } from "@/lib/services/auth";
import { CARE_PRESETS, getCare, RESPONSES } from "@/lib/services/care";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { partnerView } from "@/lib/services/partner";
import { newsFor } from "@/lib/services/push";
import { currentPeriod, listPeriods } from "@/lib/services/periods";
import { currentUser } from "@/lib/session";
import { CareForm } from "./_components/CareForm";
import { CareCard, CareSummaryCard, Logo, MoonPhase, NewsDot, PhaseCards, recorderStatus, StatusLine } from "./_components/HomeCards";
import { Landing } from "./_components/Landing";
import { MonthCalendar } from "./_components/MonthCalendar";
import { Nav } from "./_components/Nav";
import { BLOCK } from "./_components/PageSkeleton";
import { EndTodayButton, StartTodayButton } from "./_components/PeriodButtons";
import { Row, Section } from "./_components/Section";

export const dynamic = "force-dynamic";

const TITLE = "우리주기 — 서로의 편이 되는 생리 기록";
const DESCRIPTION = "생리 주기를 기록하고, 필요한 배려를 연인과 주고받아요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await currentUser();
  if (!user) return <Landing />;
  if (!user.healthConsentAt) redirect("/consent");
  const param = (await searchParams).month;
  const month = isMonth(param) ? param : todaySeoul().slice(0, 7);
  return (
    <>
      {user.role === "recorder" ? <RecorderHome user={user} month={month} /> : <PartnerHome user={user} month={month} />}
      <Nav role={user.role} active="home" />
    </>
  );
}

function Hero({ label, big, sub }: { label?: string; big: string; sub?: React.ReactNode }) {
  return (
    <div className="mt-4 text-center">
      {label && <p className="text-[17px] text-muted">{label}</p>}
      <p className={`mt-1 font-semibold leading-tight tracking-tight ${big.length > 6 ? "text-[2.75rem]" : "text-6xl"}`}>{big}</p>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

async function News({ db, user, today, pick }: { db: DB; user: User; today: string; pick: "replies" | "care" }) {
  return <NewsDot show={(await newsFor(db, user, today))[pick] > 0} />;
}

/** 달과 달력 뒤에 도착해도 되는 것들. 두 자리가 한 번의 조회를 나눠 쓴다. */
async function careAndPartner(db: DB, user: User, today: string) {
  const [care, couple] = await Promise.all([getCare(db, user, today), activeCouple(db, user.id)]);
  return { care, couple, partnerName: couple ? await otherNickname(db, couple, user) : null };
}
type CareAndPartner = ReturnType<typeof careAndPartner>;

async function PartnerLink({ data }: { data: CareAndPartner }) {
  const { partnerName } = await data;
  if (!partnerName) return null;
  return (
    <p className="mt-3 text-center text-sm text-muted">
      {partnerName}님과 연결됨 · <Link href="/me/settings" className="link">연결 끊기</Link>
    </p>
  );
}

async function CareSlot({ data }: { data: CareAndPartner }) {
  const { care, couple, partnerName } = await data;
  const canShare = Boolean(couple && couple.permissions.care && !couple.paused);
  const shareHint = !couple
    ? "파트너와 연결하면 보낼 수 있어요"
    : !couple.permissions.care || couple.paused
      ? "연결 화면에서 '배려 요청' 공유를 켜면 보낼 수 있어요"
      : null;
  const careSummary = !care ? "아직 남기지 않았어요"
    : care.response && partnerName ? `${partnerName} · ${RESPONSES[care.response]}`
    : care.shareWithPartner && canShare ? `${partnerName}님에게 보냈어요 · 답장을 기다려요`
    : "남겼어요 · 나만 보여요";
  return (
    <CareSummaryCard summary={careSummary}>
      <CareForm presets={CARE_PRESETS} current={care} canShare={canShare} shareHint={shareHint} />
    </CareSummaryCard>
  );
}

async function RecorderHome({ user, month }: { user: User; month: string }) {
  const db = await getDb();
  const today = todaySeoul();
  const periods = await listPeriods(db, user.id);
  const data = careAndPartner(db, user, today);
  const prediction = estimate(periods, [], today);
  const current = currentPeriod(periods, today);
  const { first, last } = monthGrid(month);

  return (
    <>
      <div className="flex items-center justify-between">
        <Logo />
        <Suspense><News db={db} user={user} today={today} pick="replies" /></Suspense>
      </div>
      <MoonPhase moon={moonShape(prediction, today)} />
      <StatusLine {...recorderStatus(prediction, current, today)} />
      <Suspense><PartnerLink data={data} /></Suspense>

      <div className="mt-6">
        {current?.open ? <EndTodayButton id={current.id} /> : !current && <StartTodayButton />}
      </div>

      <div className="mt-6 space-y-3">
        <Suspense fallback={<div className={`${BLOCK} h-20`} />}><CareSlot data={data} /></Suspense>
        <div className="card">
          <MonthCalendar
            month={month} marks={calendarMarks(periods, prediction, first, last, today)} today={today} basePath="/"
            dayHref={(d) => `/records?day=${d}`}
          />
          {prediction.status === "variable_cycles" && <p className="mt-2 text-center text-[13px] text-muted">주기 차이가 커서 가임기는 표시하지 않아요.</p>}
        </div>
        <PhaseCards phase={phaseOn(periods, today)} />
      </div>

      <p className="mt-10 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </>
  );
}

async function PartnerHome({ user, month }: { user: User; month: string }) {
  const db = await getDb();
  const today = todaySeoul();
  const view = await partnerView(db, user, today, month);
  const date = (
    <div className="flex items-center justify-between">
      <p className="text-[15px] text-muted">{formatDay(today)}</p>
      <Suspense><News db={db} user={user} today={today} pick="care" /></Suspense>
    </div>
  );

  if (!view) {
    return (
      <>
        {date}
        <MoonPhase moon={CRESCENT} />
        <Hero big="연결이 필요해요" sub="상대에게 받은 코드를 입력하면 오늘 필요한 배려를 함께 볼 수 있어요." />
        <div className="mt-10"><Link href="/connect" className="btn">코드 입력하기</Link></div>
      </>
    );
  }

  const name = view.recorderNickname;
  const p = view.permissions;
  const nothingShared = !p.periods && !p.predictions && !p.fertility && !p.care;
  // 예측을 허락받지 않았으면 쌓일 달도 볼 수 없으니 문구를 두지 않는다.
  const line = cycleLine(view.current, view.nextPeriod?.startDate ?? null, view.fertileWindow, today) ?? (p.predictions ? MOON_WAITING : null);
  const hero = view.paused ? <Hero label={`${name}님은`} big="잠시 쉬는 중" sub="지금은 공유를 잠시 멈췄어요." />
    : nothingShared ? <StatusLine main="아직 공유된 항목이 없어요" sub={`${name}님이 보여줄 항목을 고르면 여기에 나타나요.`} />
    : line && <StatusLine main={line} />;

  // 오늘 요청이 있으면 달 바로 아래로. 지난 요청은 아래 목록에 그대로 둔다.
  const todayCare = view.care.find((c) => c.day === today);
  const pastCare = view.care.filter((c) => c !== todayCare);

  return (
    <>
      {date}
      <MoonPhase moon={view.moon} />
      {hero}

      {todayCare && (
        <section className="mt-6">
          <h2 className="mb-3 text-[15px] text-muted">{name}님이 바라는 것</h2>
          <CareCard care={todayCare} today={today} featured />
        </section>
      )}

      {!view.paused && view.fertileWindow && view.fertileWindow.endDate >= today && (
        <div className="card mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[15px] text-muted">가임기 (추정)</span>
            <span className="text-[17px] font-medium text-fertile-ink">{shortDay(view.fertileWindow.startDate)} – {shortDay(view.fertileWindow.endDate)}</span>
          </div>
        </div>
      )}

      {!view.paused && p.care && !todayCare && pastCare.length === 0 && (
        <Section title={`${name}님이 바라는 것`}>
          <p className="text-[15px] text-muted">아직 남긴 요청이 없어요.</p>
        </Section>
      )}

      {!view.paused && pastCare.length > 0 && (
        <Section title={todayCare ? "지난 요청" : `${name}님이 바라는 것`}>
          <div className="space-y-3">
            {pastCare.map((c) => <CareCard key={c.id} care={c} today={today} />)}
          </div>
        </Section>
      )}

      {!view.paused && p.periods && view.recentPeriods.length > 0 && (
        <Section title="최근 기록">
          <div className="card">
            {view.recentPeriods.map((r) => (
              <Row key={r.startDate} label={formatDay(r.startDate)} value={r.endDate ? `${diffDays(r.endDate, r.startDate) + 1}일` : "진행 중"} />
            ))}
          </div>
        </Section>
      )}

      {!view.paused && (p.periods || p.predictions || p.fertility) && (
        <Section title={`${name}님의 달력`}>
          <div className="card"><MonthCalendar month={month} marks={view.calendar} today={today} basePath="/" /></div>
        </Section>
      )}

      <p className="mt-16 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </>
  );
}
