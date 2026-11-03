"use client";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";

let opened = false;

/** 앱이 한 번 뜨면 표시해 둔다. 그 뒤의 화면 이동은 처음 여는 것이 아니다. */
export function MarkOpened() {
  useEffect(() => {
    opened = true;
  }, []);
  return null;
}

const SIZE = 56;
const WIDTH = 5;
const RADIUS = (SIZE - WIDTH) / 2;
const LENGTH = 2 * Math.PI * RADIUS;

/** 시작 화면과 같은 바탕, 같은 위치의 달. 달과 링의 가운데가 화면 정중앙이다. */
function OpenScreen() {
  return (
    <div role="status" className="fixed inset-0 z-50 bg-paper">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="block" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={WIDTH} className="stroke-ring" />
        </svg>
        {/* iOS Safari는 SVG 안쪽 요소의 회전이 멈출 수 있어, 분홍 호만 그린 SVG 전체를 돌린다 */}
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="open-ring absolute left-0 top-0 block" aria-hidden>
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={WIDTH} strokeLinecap="round"
            strokeDasharray={`${LENGTH / 3} ${LENGTH}`} className="stroke-accent"
          />
        </svg>
        <BrandLogo size={20} className="absolute left-[18px] top-[18px]" />
      </div>
      <p className="absolute inset-x-0 top-[calc(50%+2.75rem)] text-center text-[13px] text-muted">불러오는 중</p>
    </div>
  );
}

/** 앱을 처음 열 때는 시작 화면에 이어지는 로딩을, 앱 안에서 홈으로 돌아올 때는 skeleton을 보여준다. */
export function OpenLoading({ skeleton }: { skeleton: React.ReactNode }) {
  const [first] = useState(!opened);
  return first ? <OpenScreen /> : skeleton;
}
