import Link from "next/link";
import { getDb } from "@/lib/db";
import { diffDays, formatDay, isMonth, shortDay, todaySeoul } from "@/lib/dates";
import { DISCLAIMER, type Prediction } from "@/lib/prediction";
import type { User } from "@/lib/services/auth";
import { CARE_PRESETS, getCare, RESPONSES, type CareView } from "@/lib/services/care";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { partnerView } from "@/lib/services/partner";
import { currentPeriod, listPeriods } from "@/lib/services/periods";
import { estimate } from "@/lib/prediction";
import { requireUser } from "@/lib/session";
import { respondAction } from "./actions";
import { CareForm } from "./_components/CareForm";
import { MonthCalendar } from "./_components/MonthCalendar";
import { Nav } from "./_components/Nav";
import { EndTodayButton, StartTodayButton } from "./_components/PeriodButtons";
import { Row, Section } from "./_components/Section";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month } = await searchParams;
  return (
    <>
      <p className="text-[15px] text-muted">{formatDay(todaySeoul())}</p>
      {user.role === "recorder" ? <RecorderHome user={user} /> : <PartnerHome user={user} month={isMonth(month) ? month : undefined} />}
      <Nav role={user.role} active="home" />
    </>
  );
}

function Hero({ label, big, sub, tone }: { label?: string; big: string; sub?: React.ReactNode; tone?: "period" }) {
  return (
    <div className="mt-10">
      {label && <p className="text-[17px] text-muted">{label}</p>}
      <p className={`mt-1 font-semibold leading-tight tracking-tight ${big.length > 6 ? "text-[2.75rem]" : "text-6xl"} ${tone === "period" ? "text-period" : ""}`}>{big}</p>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function untilText(days: number) {
  if (days > 0) return `${days}일`;
  if (days === 0) return "오늘";
  return `${-days}일 지남`;
}

function PredictionHero({ prediction, today, count }: { prediction: Prediction; today: string; count: number }) {
  const p = prediction.period;
  if (p && (prediction.status === "estimated" || prediction.status === "variable_cycles")) {
    const days = diffDays(p.startDate, today);
    return (
      <Hero
        label={days >= 0 ? "다음 생리까지" : "예상일이"}
        big={untilText(days)}
        sub={<>
          {formatDay(p.startDate)} 예상
          {p.earliestStart !== p.latestStart && <><br />{shortDay(p.earliestStart)} ~ {shortDay(p.latestStart)} 사이</>}
        </>}
      />
    );
  }
  if (prediction.status === "awaiting_new_record") {
    return <Hero big="기다리는 중" sub="예상했던 범위가 지났어요. 시작하면 바로 기록해 주세요." />;
  }
  if (prediction.status === "needs_record_review") {
    return <Hero big="기록 확인 필요" sub="간격이 15일보다 짧거나 90일보다 긴 기록이 있어요. 날짜가 맞는지 확인해 주세요." />;
  }
  return (
    <Hero
      big="기록 모으는 중"
      sub={`생리 시작일을 4번 기록하면 다음 날짜를 예상해 드려요. 지금 ${count}번 기록했어요.`}
    />
  );
}

async function RecorderHome({ user }: { user: User }) {
  const db = await getDb();
  const today = todaySeoul();
  const [periods, care, couple] = await Promise.all([listPeriods(db, user.id), getCare(db, user, today), activeCouple(db, user.id)]);
  const prediction = estimate(periods, [], today);
  const current = currentPeriod(periods, today);
  // 이미 지나간 가임기는 보여주지 않는다
  const fertile = prediction.fertileWindow && prediction.fertileWindow.endDate >= today ? prediction.fertileWindow : null;
  const partnerName = couple ? await otherNickname(db, couple, user) : null;
  const canShare = Boolean(couple && couple.permissions.care && !couple.paused);
  const shareHint = !couple
    ? "파트너와 연결하면 보낼 수 있어요"
    : !couple.permissions.care || couple.paused
      ? "연결 화면에서 '배려 요청' 공유를 켜면 보낼 수 있어요"
      : null;

  return (
    <>
      {current ? (
        <Hero big={`생리 ${current.day}일째`} tone="period" sub={current.open ? "끝나면 알려주세요." : undefined} />
      ) : (
        <PredictionHero prediction={prediction} today={today} count={periods.length} />
      )}

      <div className="mt-10 space-y-4">
        {current?.open ? <EndTodayButton id={current.id} /> : !current && <StartTodayButton />}
        <p className="text-center text-sm">
          <Link href="/records" className="link">지난 날짜로 기록하기</Link>
        </p>
      </div>

      {(fertile || prediction.status === "variable_cycles") && (
        <div className="mt-12">
          {fertile && (
            <Row label="가임기 (추정)" tone="fertile" value={`${shortDay(fertile.startDate)} – ${shortDay(fertile.endDate)}`} />
          )}
          {prediction.status === "variable_cycles" && (
            <p className="py-4 text-sm text-muted">주기 차이가 커서 가임기는 표시하지 않아요.</p>
          )}
        </div>
      )}

      <Section
        title="오늘 필요한 배려"
        aside={care?.response && partnerName ? (
          <span className="text-[15px] font-medium">{partnerName} · {RESPONSES[care.response]}</span>
        ) : undefined}
      >
        <CareForm presets={CARE_PRESETS} current={care} canShare={canShare} shareHint={shareHint} />
      </Section>

      <p className="mt-16 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </>
  );
}

function CareCard({ care, today, featured }: { care: CareView; today: string; featured?: boolean }) {
  return (
    <article>
      <p className="text-sm text-muted">{care.day === today ? "오늘" : formatDay(care.day)}</p>
      <ul className="mt-2 space-y-1">
        {care.presets.map((key) => (
          <li key={key} className={`font-medium leading-snug ${featured ? "text-3xl tracking-tight" : "text-2xl"}`}>{CARE_PRESETS[key]}</li>
        ))}
      </ul>
      {care.message && <p className="mt-3 text-[17px] leading-relaxed">“{care.message}”</p>}
      <form action={respondAction} className="mt-6 flex gap-2">
        <input type="hidden" name="careId" value={care.id} />
        {Object.entries(RESPONSES).map(([key, label]) => (
          <button
            key={key} name="response" value={key} type="submit"
            className={`h-11 flex-1 rounded-full border text-[15px] transition ${
              care.response === key ? "border-ink bg-ink font-semibold text-paper" : "border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </form>
    </article>
  );
}

async function PartnerHome({ user, month = todaySeoul().slice(0, 7) }: { user: User; month?: string }) {
  const db = await getDb();
  const today = todaySeoul();
  const view = await partnerView(db, user, today, month);

  if (!view) {
    return (
      <>
        <Hero big="연결이 필요해요" sub="상대에게 받은 코드를 입력하면 오늘 필요한 배려를 함께 볼 수 있어요." />
        <div className="mt-10"><Link href="/connect" className="btn">코드 입력하기</Link></div>
      </>
    );
  }

  const name = view.recorderNickname;
  const p = view.permissions;
  const nothingShared = !p.periods && !p.predictions && !p.fertility && !p.care;
  let hero: React.ReactNode;
  if (view.paused) hero = <Hero label={`${name}님은`} big="잠시 쉬는 중" sub="지금은 공유를 잠시 멈췄어요." />;
  else if (view.current) hero = <Hero label={`${name}님은 지금`} big={`생리 ${view.current.day}일째`} tone="period" />;
  else if (view.nextPeriod) {
    const days = diffDays(view.nextPeriod.startDate, today);
    hero = <Hero label={days >= 0 ? `${name}님 다음 생리까지` : `${name}님 예상일이`} big={untilText(days)} sub={`${formatDay(view.nextPeriod.startDate)} 예상`} />;
  } else if (nothingShared) hero = <Hero big="아직 조용해요" sub={`${name}님이 보여줄 항목을 고르면 여기에 나타나요.`} />;
  else hero = <Hero label={`${name}님의 오늘`} big="평온한 날" />;

  // 오늘 요청이 있으면 맨 위로. 지난 요청은 아래 목록에 그대로 둔다.
  const todayCare = view.care.find((c) => c.day === today);
  const pastCare = view.care.filter((c) => c !== todayCare);

  return (
    <>
      {todayCare && (
        <section className="mt-10">
          <h2 className="mb-4 text-[17px] text-muted">{name}님이 바라는 것</h2>
          <CareCard care={todayCare} today={today} featured />
        </section>
      )}

      {hero}

      {!view.paused && view.fertileWindow && view.fertileWindow.endDate >= today && (
        <div className="mt-12">
          <Row label="가임기 (추정)" tone="fertile" value={`${shortDay(view.fertileWindow.startDate)} – ${shortDay(view.fertileWindow.endDate)}`} />
        </div>
      )}

      {!view.paused && p.care && !todayCare && pastCare.length === 0 && (
        <Section title={`${name}님이 바라는 것`}>
          <p className="text-[17px] text-muted">아직 남긴 요청이 없어요.</p>
        </Section>
      )}

      {!view.paused && pastCare.length > 0 && (
        <Section title={todayCare ? "지난 요청" : `${name}님이 바라는 것`}>
          <div className="space-y-12">
            {pastCare.map((c) => <CareCard key={c.id} care={c} today={today} />)}
          </div>
        </Section>
      )}

      {!view.paused && p.periods && view.recentPeriods.length > 0 && (
        <Section title="최근 기록">
          {view.recentPeriods.map((r) => (
            <Row key={r.startDate} label={formatDay(r.startDate)} value={r.endDate ? `${diffDays(r.endDate, r.startDate) + 1}일` : "진행 중"} />
          ))}
        </Section>
      )}

      {!view.paused && (p.periods || p.predictions || p.fertility) && (
        <Section title={`${name}님의 달력`}>
          <MonthCalendar month={month} marks={view.calendar} today={today} basePath="/" />
        </Section>
      )}

      <p className="mt-16 text-xs leading-relaxed text-muted">{DISCLAIMER}</p>
    </>
  );
}
