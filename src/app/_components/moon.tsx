/** 아이콘용 초승달 (글꼴 없이 도형만) */
export function Moon({ size }: { size: number }) {
  const r = size * 0.3;
  return (
    <div style={{ width: size, height: size, background: "#1c1b1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: r * 2, height: r * 2, display: "flex" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#f2c6b4" }} />
        <div style={{ position: "absolute", width: r * 2, height: r * 2, left: r * 0.62, top: -r * 0.28, borderRadius: "50%", background: "#1c1b1a" }} />
      </div>
    </div>
  );
}
