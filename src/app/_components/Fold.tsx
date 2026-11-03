"use client";
import { useState } from "react";

/**
 * 펼쳐지는 한 줄(새 소식 카드의 소식). 나타나면 접힌 종이처럼 위에서 아래로 펴지며 다음 줄을 밀어낸다(globals.css .fold-row).
 * i는 펴지는 순서. 다 펴지면 안쪽을 자르지 않게 data-done을 붙인다(입력칸 테두리·펼친 내용이 잘리지 않게).
 */
export function Fold({ i, className = "", children }: { i: number; className?: string; children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <li
      className={`fold-row ${className}`} style={{ "--i": i } as React.CSSProperties} data-done={done || undefined}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setDone(true); }}
    >
      <div className="fold-paper">{children}</div>
    </li>
  );
}
