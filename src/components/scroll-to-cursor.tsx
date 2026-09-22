'use client';

import { useEffect, useRef } from 'react';

/**
 * 좁은 화면에서 생애 띠·가계도는 가로로 밀어 본다. 처음부터 봐야 할 곳(지금 펼친 연대,
 * 가계도의 "나")이 보이게 그것을 가운데로 옮겨 둔다.
 * (서버에서 그린 HTML 만으로는 처음 밀린 위치를 정할 수 없다.)
 */
export default function ScrollToCursor({
  children, target = '.lane-cursor', className = 'lane-scroll',
}: { children: React.ReactNode; target?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const cursor = box?.querySelector<HTMLElement>(target);
    if (!box || !cursor || box.scrollWidth <= box.clientWidth) return;
    const boxRect = box.getBoundingClientRect();
    const c = cursor.getBoundingClientRect();
    box.scrollLeft += c.left + c.width / 2 - (boxRect.left + boxRect.width / 2);
  }, [target]);
  return <div ref={ref} className={className}>{children}</div>;
}
