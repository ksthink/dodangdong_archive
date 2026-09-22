'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 픽셀 툴팁 — data-tip 속성이 있는 요소에 마우스를 올리거나 키보드로 포커스하면 뜬다.
 *
 * 브라우저 기본 툴팁(title)은 운영체제 글꼴로 그려져 갈무리를 쓸 수 없어서 직접 그린다.
 * 요소 옆에 CSS 로 붙이면 생애 띠처럼 가로로 밀어 보는 상자(overflow) 안에서 잘리므로,
 * 화면 위에 하나만 띄워(position: fixed) 요소 위치를 따라간다. 레이아웃에 한 번만 둔다.
 * 요소에는 aria-label 을 함께 붙여 화면 읽기 프로그램도 같은 내용을 읽게 한다.
 */
export default function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 그린 뒤 폭을 재서 화면 밖으로 나가지 않게 좌우를 붙인다
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || !tip) return;
    const w = box.offsetWidth;
    box.style.left = `${Math.min(Math.max(tip.x - w / 2, 8), window.innerWidth - w - 8)}px`;
  }, [tip]);

  useEffect(() => {
    const show = (event: Event) => {
      const el = (event.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 48; // 화면 맨 위면 아래로
      setTip({ text: el.dataset.tip ?? '', x: r.left + r.width / 2, y: below ? r.bottom : r.top, below });
    };
    const hide = (event: Event) => {
      const el = (event.target as Element | null)?.closest?.('[data-tip]');
      const to = (event as PointerEvent | FocusEvent).relatedTarget as Element | null;
      if (el && !(to && el.contains(to))) setTip(null);
    };
    const clear = () => setTip(null);
    document.addEventListener('pointerover', show);
    document.addEventListener('pointerout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('pointerover', show);
      document.removeEventListener('pointerout', hide);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', clear, true);
    };
  }, []);

  if (!tip?.text) return null;
  return (
    <div ref={ref} role="presentation" aria-hidden className={tip.below ? 'tip is-below' : 'tip'}
      style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
