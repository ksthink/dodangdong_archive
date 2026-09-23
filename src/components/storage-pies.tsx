'use client';

import { useRef, useState } from 'react';

/**
 * 저장소 칸의 두 원 — 얼마나 찼는지(왼쪽)와 유형이 모두 든 원(오른쪽).
 *
 * 조각에 마우스를 올리면 그 자리에 세부가 뜬다. 쪽지는 사이트 규칙대로
 * 먹색 바탕에 픽셀 글꼴이고, 모서리도 그림자도 움직임도 없다.
 * 같은 값이 아래 목록에 글자로도 있으므로 읽어 주는 기계에는 원을 감춘다.
 */

/**
 * 조각을 가르는 회색 단계. 흑백이라 색으로 나눌 수 없어 네 단계와 들어간 면뿐이다.
 * 그래서 유형은 큰 것 넷과 "그 밖" 으로 묶는다 — 더 잘게 나누면 회색이 모자라 구별이 안 된다.
 */
export const SHADES = ['var(--ink)', 'var(--ink-muted)', 'var(--rule-strong)', 'var(--rule)', 'var(--paper-sunken)'];

export type Slice = { label: string; tip: string; bytes: number };

/** 원 위의 한 자리. 12시에서 시계 방향으로 잰다(turn 은 한 바퀴가 1). */
function point(c: number, r: number, turn: number) {
  const a = 2 * Math.PI * turn;
  return `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
}

/** 부채꼴 하나를 그리는 길. 한 바퀴를 다 돌면 시작점으로 돌아와 아무것도 안 그려진다. */
function wedgePath(c: number, r: number, from: number, share: number) {
  return `M ${c} ${c} L ${point(c, r, from)} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${point(c, r, from + share)} Z`;
}

export default function StoragePies({ ratio, useTip, slices, size = 144 }: {
  ratio: number;
  useTip: string;
  slices: Slice[];
  size?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const r = size / 2 - 1;
  const c = size / 2;
  const share = Math.max(0, Math.min(1, ratio));
  // 0 이 아니면 아주 작아도 한 조각은 남긴다 — 비어 있는 것과 조금 든 것은 다르다.
  const drawn = share > 0 ? Math.max(share, 0.015) : 0;
  const total = slices.reduce((sum, s) => sum + s.bytes, 0);

  /** 쪽지는 마우스가 있는 자리에 띄운다. 칸 안에서의 자리라야 하므로 감싼 상자에 견준다. */
  const follow = (text: string) => (event: { clientX: number; clientY: number }) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ text, x: event.clientX - box.left, y: event.clientY - box.top });
  };

  let turn = 0;

  return (
    <div className="storage-pies" ref={wrap} onMouseLeave={() => setTip(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="var(--paper-sunken)" stroke="var(--ink)" strokeWidth="2" />
        {drawn > 0 && (drawn >= 0.999
          ? <circle cx={c} cy={c} r={r} fill="var(--ink)" onMouseMove={follow(useTip)} />
          : <path fill="var(--ink)" d={wedgePath(c, r, 0, drawn)} onMouseMove={follow(useTip)} />
        )}
        {/* 남은 자리도 짚을 수 있어야 "얼마나 남았는지" 를 묻는 손이 헛돌지 않는다 */}
        <circle cx={c} cy={c} r={r} fill="transparent" onMouseMove={follow(useTip)} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" />
      </svg>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="var(--paper-sunken)" stroke="var(--ink)" strokeWidth="2" />
        {total > 0 && slices.map((slice, i) => {
          const from = turn;
          const part = slice.bytes / total;
          turn += part;
          if (part <= 0) return null;
          if (part >= 0.999) {
            return <circle key={slice.label} cx={c} cy={c} r={r} fill={SHADES[i]} onMouseMove={follow(slice.tip)} />;
          }
          return (
            <path key={slice.label} fill={SHADES[i]} stroke="var(--paper)" strokeWidth="1"
              d={wedgePath(c, r, from, part)} onMouseMove={follow(slice.tip)} />
          );
        })}
        {/* 조각을 다 그린 뒤 테를 다시 두른다 — 조각이 테를 덮기 때문이다 */}
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" />
      </svg>

      {tip && <span className="pie-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</span>}
    </div>
  );
}
