/**
 * 한 사람의 생애를 한 줄 위에 놓는다. 가는 선 = 살아온 기간,
 * 번갈아 칠한 막대 = 인생 시기, 점 = 그해의 자료.
 * 장식이 아니라 색인이다 — 누구의 자료가 어느 시기에 비어 있는지가 보여야 한다.
 */
export type Lane = {
  name: string;
  born: number | null;
  died: number | null;
  periods: { label: string; from: number | null; to: number | null }[];
  records: number[];
};

export default function LifeLane({ lane, from, to }: { lane: Lane; from: number; to: number }) {
  const span = Math.max(1, to - from);
  const x = (year: number) => `${((Math.min(Math.max(year, from), to) - from) / span) * 100}%`;
  const w = (a: number, b: number) => `${((Math.min(b, to) - Math.max(a, from)) / span) * 100}%`;
  const end = lane.died ?? to;

  return (
    <div className="lane" aria-label={`${lane.name}의 생애`}>
      <span className="lane-name">{lane.name}</span>
      <div className="lane-track">
        {lane.born !== null && (
          <span className="lane-life" style={{ left: x(lane.born), width: w(lane.born, end) }} />
        )}
        {lane.periods.map((p, i) =>
          p.from === null ? null : (
            <span key={`${p.label}-${i}`} className={i % 2 ? 'lane-period is-alt' : 'lane-period'}
              style={{ left: x(p.from), width: w(p.from, p.to ?? end) }} title={`${p.label} ${p.from}–${p.to ?? ''}`}>
              <span className="lane-period-label">{p.label}</span>
            </span>
          ),
        )}
        {lane.records.map((year, i) => (
          <span key={`${year}-${i}`} className="lane-dot" style={{ left: x(year) }} title={`${year}년 자료`} />
        ))}
      </div>
    </div>
  );
}

/** 축 눈금 — 10년마다. */
export function LaneAxis({ from, to }: { from: number; to: number }) {
  const ticks: number[] = [];
  for (let y = Math.ceil(from / 10) * 10; y <= to; y += 10) ticks.push(y);
  const span = Math.max(1, to - from);
  return (
    <div className="lane">
      <span className="lane-name" />
      <div className="lane-axis">
        {ticks.map((y) => (
          <span key={y} style={{ left: `${((y - from) / span) * 100}%` }} className="meta-value">{y}</span>
        ))}
      </div>
    </div>
  );
}
