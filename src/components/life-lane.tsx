import Link from 'next/link';
import { TYPE_LABEL } from '@/lib/labels';
import ScrollToCursor from './scroll-to-cursor';

/**
 * 생애 띠 — 여러 사람의 생애를 한 가로축에 놓는 색인.
 * 장식이 아니라 색인이다: 누구의 자료가 어느 해에 몰려 있고 어느 시기가 비어 있는지 보여야 한다.
 *
 * - 가는 선 = 살아온 기간, 위쪽 옅은 띠 = 인생 시기(번갈아 칠함)
 * - 해마다 막대 하나. 자료 한 건 = 4px 블록 하나, 자료 유형별 색으로 쌓는다
 *   (같은 해 자료가 한 점으로 겹쳐 사라지던 것을 막는다)
 * - 사건은 먹색 꽉 찬 네모, 증빙으로 확인된 사건은 인장색 네모(인장색은 사건에만 —
 *   자료 칸에 두르면 '빨강'이라는 유형이 하나 더 있는 것처럼 읽힌다)
 * - 막대를 누르면 연표의 그해로 간다. 이름을 누르면 인물 페이지로 간다
 */

export type LaneRecord = { year: number; type: string; verified: boolean };
export type Lane = {
  identifier: string;
  name: string;
  born: number | null;
  died: number | null;
  periods: { label: string; from: number | null; to: number | null }[];
  records: LaneRecord[];
};

/** 쌓는 순서(아래 → 위). 색맹 시뮬레이션에서 이웃끼리 구분되도록 검증한 순서다. */
export const STACK_ORDER = ['Sound', 'StillImage', 'Text', 'MovingImage', 'PhysicalObject'] as const;
export const TYPE_TOKEN: Record<string, string> = {
  Sound: 'var(--tl-sound)',
  StillImage: 'var(--tl-photo)',
  Text: 'var(--tl-text)',
  MovingImage: 'var(--tl-video)',
  PhysicalObject: 'var(--tl-object)',
};

/** 한 해가 최소 이만큼(px)은 되게 한다. 모자라면 가로로 밀어 본다. */
export const MIN_YEAR_PX = 6;
const MAX_BLOCKS = 8;
const LABEL_PX_PER_CHAR = 11; // Galmuri11 한 글자

export const yearHref = (year: number) => `/chronicle?decade=${Math.floor(year / 10) * 10}#y${year}`;

function describe(year: number, recs: LaneRecord[]) {
  const counts = new Map<string, number>();
  for (const r of recs) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`);
  return `${year}년 · ${parts.join(' · ')}`;
}

export default function LifeLane({
  lane, from, to, cursor, showPeriodList = false,
}: {
  lane: Lane; from: number; to: number;
  cursor?: { from: number; to: number } | null;
  showPeriodList?: boolean;
}) {
  const span = Math.max(1, to - from + 1);
  const pct = (year: number) => ((Math.min(Math.max(year, from), to + 1) - from) / span) * 100;
  const x = (year: number) => `${pct(year)}%`;
  const w = (a: number, b: number) => `${Math.max(0, pct(b) - pct(a))}%`;
  const end = (lane.died ?? to) + 1;

  // 해마다 묶는다
  const byYear = new Map<number, LaneRecord[]>();
  for (const r of lane.records) {
    if (r.year < from || r.year > to) continue;
    byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
  }

  // 띠 안에 이름이 다 들어가지 않는 시기는 글자를 띠 밖(목록)으로 뺀다
  const fits = (p: { label: string; from: number | null; to: number | null }) =>
    p.from !== null && ((p.to ?? to) - p.from + 1) * MIN_YEAR_PX >= p.label.length * LABEL_PX_PER_CHAR + 8;

  return (
    <div className="lane">
      <Link href={`/people/${lane.identifier}`} className="lane-name">{lane.name}</Link>
      <div className="lane-track" role="group" aria-label={`${lane.name}의 생애`}>
        {cursor && <span className="lane-cursor" style={{ left: x(cursor.from), width: w(cursor.from, cursor.to + 1) }} aria-hidden />}

        {lane.periods.map((p, i) =>
          p.from === null ? null : (
            <span key={`${p.label}-${i}`} className={i % 2 ? 'lane-period is-b' : 'lane-period'}
              style={{ left: x(p.from), width: w(p.from, (p.to ?? end - 1) + 1) }}
              title={`${p.label} ${p.from}–${p.to ?? ''}`}>
              {fits(p) && <span className="lane-period-label">{p.label}</span>}
            </span>
          ),
        )}

        {lane.born !== null && <span className="lane-life" style={{ left: x(lane.born), width: w(lane.born, end) }} aria-hidden />}

        {[...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, recs]) => {
          const events = recs.filter((r) => r.type === 'Event');
          const blocks = STACK_ORDER.flatMap((t) => recs.filter((r) => r.type === t));
          const shown = blocks.slice(0, MAX_BLOCKS);
          const label = describe(year, recs);
          return (
            <Link key={year} href={yearHref(year)} className="lane-year"
              style={{ left: x(year), width: w(year, year + 1) }}
              title={label} aria-label={`${lane.name} ${label}`}>
              {events.length > 0 && (
                <span className={events.some((e) => e.verified) ? 'lane-event is-verified' : 'lane-event'} aria-hidden />
              )}
              <span className="lane-stack" aria-hidden>
                {shown.map((r, i) => (
                  <i key={i} style={{ background: TYPE_TOKEN[r.type] }} />
                ))}
                {blocks.length > MAX_BLOCKS && <i className="is-more" />}
              </span>
            </Link>
          );
        })}
      </div>
      {showPeriodList && lane.periods.some((p) => !fits(p)) && (
        <p className="lane-periods meta-value">
          {lane.periods.map((p, i) => (
            <span key={`${p.label}-${i}`}>{i > 0 && ' · '}
              <span className={i % 2 ? 'swatch is-b' : 'swatch'} aria-hidden /> {p.label} {p.from ?? '?'}–{p.to ?? ''}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** 축 눈금 — 10년마다. */
export function LaneAxis({ from, to }: { from: number; to: number }) {
  const ticks: number[] = [];
  for (let y = Math.ceil(from / 10) * 10; y <= to; y += 10) ticks.push(y);
  const span = Math.max(1, to - from + 1);
  return (
    <div className="lane lane-axis-row" aria-hidden>
      <span className="lane-name" />
      <div className="lane-axis">
        {ticks.map((y) => (
          <span key={y} style={{ left: `${((y - from) / span) * 100}%` }} className="meta-value">{y}</span>
        ))}
      </div>
    </div>
  );
}

/** 범례 — 색만으로 뜻을 전하지 않도록 이름을 함께 쓴다. */
export function LaneLegend() {
  return (
    <p className="lane-legend meta-value">
      {STACK_ORDER.map((t) => (
        <span key={t}><i style={{ background: TYPE_TOKEN[t] }} aria-hidden /> {TYPE_LABEL[t]}</span>
      ))}
      <span><i className="is-event" aria-hidden /> 사건</span>
      <span><i className="is-event-verified" aria-hidden /> 증빙으로 확인된 사건</span>
      <span className="help">자료 한 건이 한 칸. 막대를 누르면 그해로 간다.</span>
    </p>
  );
}

/** 여러 줄을 한 번에 — 좁은 화면에서는 가로로 밀어 본다. */
export function LaneScroller({ from, to, children }: { from: number; to: number; children: React.ReactNode }) {
  const minWidth = 180 + (to - from + 1) * MIN_YEAR_PX;
  return (
    <ScrollToCursor>
      <div style={{ minWidth }}>{children}</div>
    </ScrollToCursor>
  );
}
