'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * 관리 화면 어디서든 등록·수정이 끝나면 뜨는 팝업. 서버 액션이 `?saved=…` 로 돌려보내면
 * 여기서 읽어 한 가지 모양으로 띄운다 — 화면마다 알림을 따로 그리지 않는다.
 * 뜨자마자 주소에서 saved 를 지워, 새로고침하거나 뒤로 갔다 와도 다시 뜨지 않게 한다.
 * 닫힘은 "이 saved 값을 닫았다" 로 기억한다 — 주소가 바뀌어도 그 자체로 상태가 된다.
 */
export default function SavedPopup() {
  const saved = useSearchParams().get('saved');
  // 주소에서 saved 를 지우면 useSearchParams 도 곧장 null 이 되므로, 본 값은 따로 붙들어 둔다.
  const [seen, setSeen] = useState<string | null>(null);
  if (saved && saved !== seen) setSeen(saved);
  const [closed, setClosed] = useState<string | null>(null);
  const open = !!seen && closed !== seen;

  useEffect(() => {
    if (!saved) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('saved');
    window.history.replaceState(window.history.state, '', url);
  }, [saved]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setClosed(seen), 4000);
    return () => window.clearTimeout(timer);
  }, [open, seen]);

  if (!open) return null;
  return (
    <div className="saved-popup" role="status">
      <span>저장 혹은 수정 됐습니다</span>
      <button type="button" className="button" onClick={() => setClosed(seen)}>닫기</button>
    </div>
  );
}
