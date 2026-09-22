import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL } from '@/lib/labels';
import { edtfYear, parseEdtf } from '@/lib/edtf';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import LifeLane, { LaneAxis } from '@/components/life-lane';

export const dynamic = 'force-dynamic';
export const metadata = { title: '연표 · 도당동 아카이브' };

type Row = {
  identifier: string; title: string; type: string;
  created_edtf: string | null; created_start: string | null; date_verified: boolean;
};

// 한 해 안에서는 정확한 날짜 → 월까지 → 연도 → 추정 순.
const RANK: Record<string, number> = { day: 0, month: 1, year: 2, interval: 3, decade: 4, century: 5, unknown: 6 };
const rank = (edtf: string | null) => {
  const p = parseEdtf(edtf);
  return RANK[p.precision] * 2 + (p.uncertain || p.approx ? 1 : 0);
};
const uncertainBirth = (edtf: string | null) => !!edtf && /[?~%X]/i.test(edtf);

export default async function ChroniclePage({ searchParams }: { searchParams: Promise<{ decade?: string }> }) {
  const supabase = await createClient();

  // 비공개 자료는 RLS 가 행을 주지 않는다 — 연표에서도 조용히 빠진다.
  const [{ data: items }, { data: people }, { data: periods }, { data: world }, { data: links }] = await Promise.all([
    supabase.from('item').select('identifier, title, type, created_edtf, created_start, date_verified').not('created_edtf', 'is', null),
    supabase.from('person').select('id, identifier, short_name, display_name, birth_edtf, born_year, died_year')
      .not('born_year', 'is', null).order('born_year'),
    supabase.from('life_period').select('person_id, label, from_year, to_year, sort_order').order('sort_order'),
    supabase.from('world_event').select('year, label').order('year').order('sort_order'),
    supabase.from('item_person').select('person_id, item(created_edtf)'),
  ]);

  // 해마다 묶는다. 197X 는 1975, 기간은 시작 해에 놓는다.
  const byYear = new Map<number, Row[]>();
  for (const it of (items ?? []) as Row[]) {
    const y = edtfYear(it.created_edtf);
    if (y === null) continue;
    byYear.set(y, [...(byYear.get(y) ?? []), it]);
  }
  // 정밀도 순으로 먼저, 같은 정밀도끼리는 날짜순(1976-02 → 1976-04).
  for (const list of byYear.values()) {
    list.sort((a, b) => rank(a.created_edtf) - rank(b.created_edtf)
      || (a.created_start ?? '').localeCompare(b.created_start ?? ''));
  }

  const worldByYear = new Map<number, string[]>();
  for (const w of world ?? []) worldByYear.set(w.year, [...(worldByYear.get(w.year) ?? []), w.label]);

  // 연대별 건수
  const decades = new Map<number, number>();
  for (const [y, list] of byYear) decades.set(Math.floor(y / 10) * 10, (decades.get(Math.floor(y / 10) * 10) ?? 0) + list.length);
  const decadeKeys = [...decades.keys()].sort((a, b) => a - b);
  const allDecades: number[] = [];
  if (decadeKeys.length) for (let d = decadeKeys[0]; d <= decadeKeys[decadeKeys.length - 1]; d += 10) allDecades.push(d);
  const max = Math.max(1, ...decades.values());

  const { decade: asked } = await searchParams;
  const busiest = decadeKeys.reduce<number | null>((best, d) => (best === null || (decades.get(d) ?? 0) > (decades.get(best) ?? 0) ? d : best), null);
  const current = asked && /^\d{4}$/.test(asked) ? Number(asked) : busiest;

  const years = current === null ? [] : [...byYear.keys()].filter((y) => y >= current && y < current + 10).sort((a, b) => a - b);

  // 생애 띠 — 사람마다 그 사람이 나오는 자료의 해를 점으로
  const recordsOf = new Map<string, number[]>();
  for (const l of links ?? []) {
    const it = (Array.isArray(l.item) ? l.item[0] : l.item) as { created_edtf: string | null } | null;
    const y = edtfYear(it?.created_edtf);
    if (y !== null) recordsOf.set(l.person_id, [...(recordsOf.get(l.person_id) ?? []), y]);
  }
  const nowYear = new Date().getFullYear();
  const laneFrom = Math.floor(Math.min(...(people ?? []).map((p) => p.born_year as number), ...byYear.keys(), nowYear) / 10) * 10;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="title">연표</h1>
        <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
          자료를 시간으로 꿴다. 언제였는지, 그때 누가 몇 살이었는지로 찾는다.
          추정 날짜는 적힌 그대로 두고, 축 위에서는 그 해에 놓는다.
        </p>

        {decadeKeys.length === 0 ? (
          <p className="empty" style={{ marginTop: 'var(--space-8)' }}>아직 날짜가 있는 공개 자료가 없다.</p>
        ) : (
          <>
            <nav className="decades" aria-label="연대">
              {allDecades.map((d) => {
                const n = decades.get(d) ?? 0;
                const cells = n ? Math.max(1, Math.round((n / max) * 8)) : 0;
                return (
                  <Link key={d} href={`/chronicle?decade=${d}`}
                    className={['decade', d === current ? 'is-on' : '', n ? '' : 'is-empty'].join(' ')}>
                    <span className="decade-bar" aria-hidden>
                      {Array.from({ length: 8 }, (_, i) => <i key={i} className={i < cells ? 'on' : ''} />)}
                    </span>
                    <span className="meta-value">{d}</span>
                    <span className="meta-value">{n}건</span>
                  </Link>
                );
              })}
            </nav>

            {people?.length ? (
              <section className="section">
                <h2 className="section-title">가족 생애</h2>
                <LaneAxis from={laneFrom} to={nowYear} />
                {people.map((p) => (
                  <LifeLane key={p.id} from={laneFrom} to={nowYear} lane={{
                    name: p.short_name ?? p.display_name,
                    born: p.born_year as number, died: p.died_year as number | null,
                    periods: (periods ?? []).filter((x) => x.person_id === p.id).map((x) => ({ label: x.label, from: x.from_year, to: x.to_year })),
                    records: recordsOf.get(p.id) ?? [],
                  }} />
                ))}
              </section>
            ) : null}

            <section className="section">
              <h2 className="section-title"><span>{current}년대</span></h2>
              {years.length === 0 && <p className="empty">이 연대에는 공개 자료가 없다.</p>}
              {years.map((y) => {
                const list = byYear.get(y) ?? [];
                const events = list.filter((it) => it.type === 'Event');
                const records = list.filter((it) => it.type !== 'Event');
                // 나이는 태어난 해가 기록된 사람만 — 그해 − 태어난 해. 추정 생년이면 ~.
                const ages = (people ?? [])
                  .filter((p) => (p.born_year as number) <= y && (p.died_year === null || (p.died_year as number) >= y))
                  .map((p) => ({ id: p.identifier, name: p.short_name ?? p.display_name, age: y - (p.born_year as number), approx: uncertainBirth(p.birth_edtf) }));
                return (
                  <article key={y} className="year">
                    <h3 className="title">{y}</h3>
                    {ages.length > 0 && (
                      <p className="meta-value ages">
                        {ages.map((a, i) => (
                          <span key={a.id}>{i > 0 && ' · '}<Link href={`/people/${a.id}`}>{a.name}</Link> {a.approx ? '~' : ''}{a.age}살</span>
                        ))}
                      </p>
                    )}
                    <div className="year-cols">
                      <div>
                        <p className="label">집안 일</p>
                        {events.length ? events.map((e) => (
                          <p key={e.identifier} className="event">
                            <span className="mark-square" aria-hidden />
                            <Link href={`/item/${e.identifier}`}><b>{e.title}</b></Link>{' '}
                            <span className="meta-value">{e.created_edtf}</span>
                            {e.date_verified && <span className="verified">확인됨</span>}
                          </p>
                        )) : <p className="help">기록 없음</p>}
                      </div>
                      <div>
                        <p className="label">자료 {records.length}건</p>
                        {records.map((r) => (
                          <p key={r.identifier} className="record">
                            <span className="meta-value">{r.created_edtf}</span>{' '}
                            <span className="meta-label">{TYPE_LABEL[r.type]}</span>{' '}
                            <Link href={`/item/${r.identifier}`}>{r.title}</Link>
                            {r.date_verified && <span className="verified">확인됨</span>}
                          </p>
                        ))}
                      </div>
                      <div className="world">
                        <p className="label">바깥 세상</p>
                        {(worldByYear.get(y) ?? []).map((w) => <p key={w} className="body-sm">{w}</p>)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}

        <SiteFooter />
      </main>
    </>
  );
}
