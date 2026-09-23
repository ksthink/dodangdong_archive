'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Segment } from '@/lib/transcript';

/**
 * 녹취록이 있는 음성의 재생기 — 소리를 따라 대목이 흘러간다.
 *
 * 지나간 줄과 올 줄을 위아래로 함께 두고, 지금 대목만 먹색으로 짙다. 재생을 따라
 * 화면이 그 줄로 부드럽게 흐른다. 이 사이트에서 움직이는 두 번째 자리다(첫째는 인트로).
 * 움직임을 줄여 달라고 한 사람에게는 흐르지 않고 한 번에 바뀐다.
 *
 * **녹취록이 없으면 이 화면을 쓰지 않는다** — 그때는 재생기만 둔다(자료 상세가 가른다).
 *
 * `<audio>` 는 브라우저 것을 그대로 쓴다. 아래의 녹취록 목록(transcript-view.tsx)이
 * `media-<파일 id>` 로 이 요소를 찾아 자리를 옮기므로 id 를 바꾸지 않는다.
 */

/** 시각이 같은 줄과 시각 없는 줄은 한 대목이다 — 묻고 답하는 대목, `(웃음)` 따위. */
type Group = { start: number | null; lines: Segment[] };

function groupsOf(segments: Segment[]): Group[] {
  const groups: Group[] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    // 시각이 없는 줄은 앞 대목에 얹힌다. 앞이 없으면(머리의 `(웃음)`) 시각 없는 대목이 된다.
    if (last && (s.start === null || s.start === last.start)) last.lines.push(s);
    else groups.push({ start: s.start, lines: [s] });
  }
  return groups;
}

export default function TranscriptPlayer({
  fileId, src, segments,
}: {
  fileId: string;
  src: string;
  segments: Segment[];
}) {
  const groups = useMemo(() => groupsOf(segments), [segments]);
  const [now, setNow] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 지금 대목 — 시작 시각이 지금 이전인 마지막 대목. 아직 아무것도 안 틀었으면 첫 대목을 짚는다.
  let active = groups.findIndex((g) => g.start !== null);
  groups.forEach((g, i) => { if (g.start !== null && g.start <= now + 0.25) active = i; });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const tick = () => setNow(audio.currentTime);
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('seeked', tick);
    return () => {
      audio.removeEventListener('timeupdate', tick);
      audio.removeEventListener('seeked', tick);
    };
  }, []);

  // 지금 대목이 바뀌면 그 줄이 가운데 오게 흐른다.
  useEffect(() => {
    const box = boxRef.current;
    const line = box?.querySelector<HTMLElement>('[data-now="true"]');
    if (!box || !line) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({
      top: line.offsetTop - (box.clientHeight - line.offsetHeight) / 2,
      behavior: still ? 'auto' : 'smooth',
    });
  }, [active]);

  const seek = (sec: number | null) => {
    const audio = audioRef.current;
    if (!audio || sec === null) return;
    // preload="none" 이면 길이를 모르는 채로 옮기면 무시될 수 있다 — 머리를 받은 뒤에 옮긴다.
    const go = () => { audio.currentTime = sec; void audio.play().catch(() => {}); };
    if (audio.readyState >= 1) go();
    else { audio.addEventListener('loadedmetadata', go, { once: true }); audio.load(); }
    setNow(sec);
  };

  return (
    <div className="lyrics">
      {/*
        아래에 같은 글이 녹취록 목록으로 한 번 더 있다 — 읽어 주는 기계에는 그쪽만 보이면 된다.
        여기서는 눈으로 따라 읽고, 누르면 그 자리부터 듣는다.
      */}
      <div className="lyrics-box" ref={boxRef} aria-hidden>
        {groups.map((g, i) => (
          <div key={i} className={`lyrics-group${i === active ? ' is-now' : ''}`} data-now={i === active || undefined}
            onClick={() => seek(g.start)}>
            {g.lines.map((s, j) => (
              <p key={j}>
                {s.speaker && <span className="lyrics-speaker">{s.speaker}</span>}
                {s.text}
              </p>
            ))}
          </div>
        ))}
      </div>
      <audio ref={audioRef} id={`media-${fileId}`} controls preload="none" src={src} />
    </div>
  );
}
