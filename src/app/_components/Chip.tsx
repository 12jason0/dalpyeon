/** 한 줄 카드 왼쪽의 작은 아이콘 자리. */
export function IconBadge({ children }: { children: React.ReactNode }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-period/50 text-period-ink" aria-hidden>{children}</span>;
}

const CHIP_TONE = { period: "text-period-ink", fertile: "text-fertile-ink", muted: "text-muted" };

/** 통증·기분·배려 요청 상태를 보여주는 둥근 칩. */
export function Chip({ icon, tone, children }: { icon: React.ReactNode; tone: keyof typeof CHIP_TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full border-[0.5px] border-line bg-card px-2 text-[12px] font-medium ${CHIP_TONE[tone]}`}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
