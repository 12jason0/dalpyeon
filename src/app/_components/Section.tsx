export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-16">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "period" | "fertile" }) {
  const color = tone === "period" ? "text-period-ink" : tone === "fertile" ? "text-fertile-ink" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-4">
      <span className="shrink-0 text-[15px] text-muted">{label}</span>
      <span className={`text-[17px] font-medium ${color}`}>{value}</span>
    </div>
  );
}
