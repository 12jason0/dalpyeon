/** 생리 중인 날의 통증·기분. 화면과 서버가 함께 쓴다. */
import { diffDays } from "./dates";

export const PAINS = { none: "없음", mild: "약함", moderate: "보통", severe: "심함" } as const;
export type Pain = keyof typeof PAINS;

export const MOODS = { calm: "평온", sensitive: "예민", down: "우울", tired: "피곤", good: "좋음" } as const;
export type Mood = keyof typeof MOODS;

export type DayLog = { day: string; pain: Pain | null; moods: Mood[] };

const PAIN_ORDER: Pain[] = ["none", "mild", "moderate", "severe"];

/** 없음 0부터 심함 3까지. */
export const painRank = (pain: Pain) => PAIN_ORDER.indexOf(pain);

/** 지난 생리 하나의 요약. 통증이 있던 날이 없으면 그 문장을 만들지 않는다. */
export function summarizeLogs(period: { startDate: string; endDate: string | null }, logs: DayLog[]): { pain: string | null; mood: string | null } {
  const inside = logs.filter((l) => l.day >= period.startDate && (!period.endDate || l.day <= period.endDate))
    .sort((a, b) => a.day.localeCompare(b.day));
  const rank = (l: DayLog) => (l.pain ? painRank(l.pain) : 0);
  const worst = Math.max(0, ...inside.map(rank));
  const worstDay = worst > 0 ? inside.find((l) => rank(l) === worst) : undefined;
  const counts = new Map<Mood, number>();
  for (const mood of inside.flatMap((l) => l.moods)) counts.set(mood, (counts.get(mood) ?? 0) + 1);
  const top = (Object.keys(MOODS) as Mood[]).filter((m) => counts.has(m)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  return {
    pain: worstDay ? `${diffDays(worstDay.day, period.startDate) + 1}일째 통증이 가장 심했어요` : null,
    mood: top ? `자주 남긴 기분은 ${MOODS[top]}이에요` : null,
  };
}

/** 홈 맨 위 칩의 글자. 남기지 않은 것은 null이다. */
export const bodyChips = (log: Pick<DayLog, "pain" | "moods">) => ({
  pain: log.pain && `통증 ${PAINS[log.pain]}`,
  mood: log.moods.length > 0 ? log.moods.map((m) => MOODS[m]).join(", ") : null,
});
