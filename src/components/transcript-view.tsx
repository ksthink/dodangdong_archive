'use client';

import { useEffect, useId, useState } from 'react';
import { formatTime, type Segment } from '@/lib/transcript';

/**
 * 녹취록 — 자료 상세의 재생기 아래.
 *
 * 목록은 **닫힌 채로 시작한다**. 녹취록은 길고, 먼저 오는 것은 듣기이기 때문이다.
 * 제목 줄의 손잡이(▼/▲)로 펴고 접는다. 찾기에 글을 넣으면 그 말이 든 구간만 남고,
 * 결과를 봐야 하므로 저절로 펴진다.
 *
 * 시각이 붙은 구간은 누르면 그 자리부터 재생한다. 재생 중에는 지금 구간을 먹색 띠로 짚는다.
 * 재생기가 없으면(원본이 아직 없으면) 시각은 글자로만 남는다.
 */
export default function TranscriptView({
  segments, playerId, reviewed,
}: {
  segments: Segment[];
  playerId: string | null;
  reviewed: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listId = useId();

  useEffect(() => {
    const el = playerId ? (document.getElementById(playerId) as HTMLMediaElement | null) : null;
    if (!el) return;
    const tick = () => setNow(el.currentTime);
    el.addEventListener('timeupdate', tick);
    el.addEventListener('seeked', tick);
    return () => {
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('seeked', tick);
    };
  }, [playerId]);

  const seek = (sec: number) => {
    const el = playerId ? (document.getElementById(playerId) as HTMLMediaElement | null) : null;
    if (!el) return;
    // preload="none" 이면 길이를 모르는 채로 옮기면 무시될 수 있다 — 머리를 받은 뒤에 옮긴다.
    const go = () => { el.currentTime = sec; void el.play().catch(() => {}); };
    if (el.readyState >= 1) go();
    else { el.addEventListener('loadedmetadata', go, { once: true }); el.load(); }
    setNow(sec);
  };

  // 지금 구간: 시작 시각이 지금 이전인 것 가운데 마지막. 같은 시각이 여럿이면 그 첫 구간.
  let active = -1;
  if (now !== null) {
    segments.forEach((s, i) => {
      if (s.start !== null && s.start <= now + 0.25 && (active < 0 || s.start > (segments[active].start as number))) active = i;
    });
  }

  // 찾기 — 말한 사람도 함께 본다("김순덕" 으로 그 사람 말만 추릴 수 있게).
  const needle = query.trim().toLowerCase();
  const rows = segments
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !needle || `${s.speaker ?? ''} ${s.text}`.toLowerCase().includes(needle));

  // 찾는 동안에는 결과를 봐야 하므로 접혀 있어도 편다.
  const shown = open || needle.length > 0;

  return (
    <>
      <h2 className="section-title transcript-head">
        <span className="transcript-head-left">
          <button type="button" className="transcript-toggle" aria-expanded={shown} aria-controls={listId}
            onClick={() => setOpen(!shown)}>
            <span aria-hidden>{shown ? '▲' : '▼'}</span>
            <span className="sr-only">{shown ? '녹취록 접기' : '녹취록 펼치기'}</span>
          </button>
          <span>녹취록</span>
          <input type="search" className="field transcript-search" value={query} placeholder="녹취록에서 찾기"
            aria-label="녹취록에서 찾기" onChange={(e) => setQuery(e.target.value)} />
        </span>
        <span className="meta-value">
          {needle ? `${rows.length}건` : `구간 ${segments.length}개`}
        </span>
      </h2>

      {shown && (
        <div id={listId}>
          <p className="help transcript-state">
            {reviewed ? '원음과 대조해 검토한 녹취록이다.' : '아직 원음과 대조하지 않은 녹취록이다. 들리는 것과 다를 수 있다.'}
          </p>
          {rows.length === 0 ? (
            <p className="help">그 말이 든 구간이 없다.</p>
          ) : (
            <ol className="transcript">
              {rows.map(({ s, i }) => (
                <li key={i} className={i === active ? 'is-now' : undefined} aria-current={i === active ? 'true' : undefined}>
                  {s.start !== null ? (
                    playerId ? (
                      <button type="button" className="transcript-time" onClick={() => seek(s.start as number)}
                        aria-label={`${formatTime(s.start)}부터 듣기`}>
                        {formatTime(s.start)}
                      </button>
                    ) : (
                      <span className="transcript-time">{formatTime(s.start)}</span>
                    )
                  ) : <span className="transcript-time" aria-hidden />}
                  <p>
                    {s.speaker && <span className="transcript-speaker">{s.speaker}</span>}
                    {s.text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}
