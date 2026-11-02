import { shortDay } from "@/lib/dates";
import type { Bar, PainPoint } from "@/lib/report";

const WIDTH = 342;
const SLOT = WIDTH / 6;
const BAR_WIDTH = 20;
const RADIUS = 4;
const VALUE_SPACE = 22;
const BASE = 118;
const HEIGHT = 140;
const MAX_LEVEL = 3;

/** 위쪽 모서리만 둥근 막대. 아래는 기준선에 붙는다. */
function barPath(x: number, top: number) {
  const right = x + BAR_WIDTH;
  return `M${x} ${BASE}V${top + RADIUS}Q${x} ${top} ${x + RADIUS} ${top}H${right - RADIUS}Q${right} ${top} ${right} ${top + RADIUS}V${BASE}Z`;
}

function Chart({ title, label, children }: { title: string; label: string; children: React.ReactNode }) {
  return (
    <figure className="card mt-3">
      <figcaption className="text-[13px] font-medium text-muted">{title}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-2 block w-full" role="img" aria-label={label}>{children}</svg>
    </figure>
  );
}

const Day = ({ x, day }: { x: number; day: string }) => (
  <text x={x} y={HEIGHT - 4} textAnchor="middle" className="fill-muted text-[11px]">{shortDay(day)}</text>
);

/** 일 수 막대그래프. 막대마다 숫자와 시작 날짜를 적는다. fill은 토큰 색 클래스다. */
export function DayBars({ title, bars, fill }: { title: string; bars: Bar[]; fill: string }) {
  const max = Math.max(...bars.map((b) => b.days));
  return (
    <Chart title={title} label={`${title}: ${bars.map((b) => `${shortDay(b.day)} ${b.days}일`).join(", ")}`}>
      <line x1={0} x2={WIDTH} y1={BASE} y2={BASE} className="stroke-line" />
      {bars.map((b, i) => {
        const center = SLOT * i + SLOT / 2;
        const top = BASE - (b.days / max) * (BASE - VALUE_SPACE);
        return (
          <g key={b.day}>
            <path d={barPath(center - BAR_WIDTH / 2, top)} className={fill} />
            <text x={center} y={top - 6} textAnchor="middle" className="fill-ink text-[12px] font-medium">{b.days}일</text>
            <Day x={center} day={b.day} />
          </g>
        );
      })}
    </Chart>
  );
}

/** 생리마다 가장 심했던 통증의 변화. 칸은 없음 0부터 심함 3까지다. */
export function PainLine({ points }: { points: PainPoint[] }) {
  const y = (level: number) => BASE - 8 - (level / MAX_LEVEL) * (BASE - 8 - VALUE_SPACE);
  const x = (i: number) => SLOT * i + SLOT / 2;
  return (
    <Chart title="지난 생리 통증 변화" label={`지난 생리 통증 변화: ${points.map((p) => `${shortDay(p.day)} ${p.label}`).join(", ")}`}>
      {[0, 1, 2, 3].map((level) => <line key={level} x1={0} x2={WIDTH} y1={y(level)} y2={y(level)} className="stroke-line" />)}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.level)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-period-ink" />
      {points.map((p, i) => (
        <g key={p.day}>
          <circle cx={x(i)} cy={y(p.level)} r={5} strokeWidth={2} className="fill-period-ink stroke-card" />
          <text
            x={x(i)} y={y(p.level) - 10} textAnchor="middle" strokeWidth={3} paintOrder="stroke"
            className="fill-ink stroke-card text-[12px] font-medium"
          >
            {p.label}({p.level})
          </text>
          <Day x={x(i)} day={p.day} />
        </g>
      ))}
    </Chart>
  );
}
