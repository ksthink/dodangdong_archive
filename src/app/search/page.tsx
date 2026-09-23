import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL } from '@/lib/labels';
import { ilikeAny } from '@/lib/search';
import { thumbsFor } from '@/lib/thumbs';
import Thumb from '@/components/thumb';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const dynamic = 'force-dynamic';


export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; bundle?: string; year?: string; person?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 80);
  const type = params.type && params.type in TYPE_LABEL ? params.type : null;
  // 연도는 '1978'(해) · '1980s'(연대) · 'none'(기록 없음) 셋 가운데 하나다.
  const year = params.year && /^(\d{4}s?|none)$/.test(params.year) ? params.year : null;
  const person = params.person && /^DP-\d+$/.test(params.person) ? params.person : null;

  const supabase = await createClient();

  // 묶음으로 좁히기(첫 화면 "새로 들어온 기록"이 여기로 온다). 손님에게는 공개 자료가 있는 묶음만 보인다.
  const { data: bundle } = params.bundle && /^DC-\d+$/.test(params.bundle)
    ? await supabase.from('bundle').select('id, identifier, title').eq('identifier', params.bundle).maybeSingle()
    : { data: null };

  // 인물로 좁힐 때는 그 사람이 걸린 자료 id 를 먼저 받는다.
  // 이음표를 select 에 끼우면(!inner) 타입 추론이 깨지고, 어차피 자료가 100건 대다.
  const pickedItems = person
    ? ((await supabase.from('item_person').select('item_id, person!inner(identifier)')
        .eq('person.identifier', person)).data ?? []).map((r) => r.item_id)
    : null;

  // 비공개 자료는 RLS 가 행 자체를 주지 않는다 — 여기서 따로 거르지 않는다.
  let query = supabase
    .from('item')
    .select('id, identifier, title, type, doc_type, description, created_edtf, date_verified, source')
    .order('created_start', { ascending: true, nullsFirst: false })
    .limit(100);
  if (type) query = query.eq('type', type);
  if (params.bundle) query = query.eq('bundle_id', bundle?.id ?? '00000000-0000-0000-0000-000000000000');
  if (year === 'none') query = query.is('created_start', null);
  else if (year?.endsWith('s')) {
    const from = Number(year.slice(0, 4));
    query = query.gte('created_start', `${from}-01-01`).lte('created_start', `${from + 9}-12-31`);
  } else if (year) {
    query = query.gte('created_start', `${year}-01-01`).lte('created_start', `${year}-12-31`);
  }
  // 아무 자료도 안 걸린 사람이면 빈 목록이 되게 한다(id 가 없는 in 은 전부를 주기 때문).
  if (pickedItems) query = query.in('id', pickedItems.length ? pickedItems : ['00000000-0000-0000-0000-000000000000']);
  if (q) {
    const cond = ilikeAny(
      ['title', 'description', 'creator', 'source', 'doc_type', 'created_edtf', 'identifier'], q);
    // 쓸 만한 글자가 없는 검색어("*")는 전부가 아니라 아무것도 아닌 것으로 본다.
    query = cond ? query.or(cond) : query.eq('identifier', '');
  }

  // 분류의 건수는 검색어·분류와 무관하게 "이 범위에 무엇이 얼마나 있는지" 를 말한다.
  const scope = bundle
    ? supabase.from('item').select('id, type, created_start').eq('bundle_id', bundle.id)
    : supabase.from('item').select('id, type, created_start');
  const [{ data: items }, { data: all }] = await Promise.all([query, scope]);

  // 인물 분류 — 이 범위의 자료에 걸린 사람과 건수. RLS 가 못 볼 사람은 애초에 주지 않는다.
  const { data: links } = (all ?? []).length
    ? await supabase.from('item_person')
      .select('item_id, person!inner(identifier, display_name)')
      .in('item_id', (all ?? []).map((i) => i.id))
    : { data: [] };

  const thumbs = await thumbsFor(supabase, (items ?? []).map((i) => i.id));

  const counts = new Map<string, number>();
  for (const row of all ?? []) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);

  // 연도 — 연대로 묶어 보여 주고, 고른 연대만 해별로 펼친다. 연도가 없는 자료도 한 줄 둔다.
  const yearOf = (v: string | null) => (v ? Number(v.slice(0, 4)) : null);
  const decades = new Map<number, number>();
  const years = new Map<number, number>();
  let undated = 0;
  for (const row of all ?? []) {
    const y = yearOf(row.created_start as string | null);
    if (y === null) { undated += 1; continue; }
    years.set(y, (years.get(y) ?? 0) + 1);
    const d = Math.floor(y / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }
  const openDecade = year && year !== 'none'
    ? Math.floor(Number(year.slice(0, 4)) / 10) * 10
    : null;

  // 인물 — 이 범위에서 몇 건에 걸렸는지. 많이 걸린 사람부터.
  type Link2 = { item_id: string; person: { identifier: string; display_name: string } };
  const people = new Map<string, { name: string; n: number }>();
  for (const row of (links ?? []) as unknown as Link2[]) {
    const p = Array.isArray(row.person) ? row.person[0] : row.person;
    if (!p) continue;
    const seen = people.get(p.identifier) ?? { name: p.display_name, n: 0 };
    people.set(p.identifier, { name: seen.name, n: seen.n + 1 });
  }
  const peopleRows = [...people.entries()].sort((a, b) => b[1].n - a[1].n);

  const href = (next: { q?: string | null; type?: string | null; year?: string | null; person?: string | null }) => {
    const p = new URLSearchParams();
    if (bundle) p.set('bundle', bundle.identifier);
    const nq = next.q === undefined ? q : next.q;
    const nt = next.type === undefined ? type : next.type;
    const ny = next.year === undefined ? year : next.year;
    const np = next.person === undefined ? person : next.person;
    if (nq) p.set('q', nq);
    if (nt) p.set('type', nt);
    if (ny) p.set('year', ny);
    if (np) p.set('person', np);
    const s = p.toString();
    return s ? `/search?${s}` : '/search';
  };

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="title">자료 찾기</h1>

        <form action="/search" className="searchbar">
          {type && <input type="hidden" name="type" value={type} />}
          {bundle && <input type="hidden" name="bundle" value={bundle.identifier} />}
          <input className="field" type="search" name="q" defaultValue={q}
            placeholder="제목, 사람, 장소, 연도 — 예: 할머니 1978" aria-label="자료 찾기" />
          <button className="button" type="submit">찾기</button>
        </form>

        <div className="search-layout">
          <aside>
            <h2 className="facet-title">
              <span>형태분류</span><span className="label-code">dc:type</span>
            </h2>
            <ul className="facets">
              <li>
                <Link href={href({ type: null })} className={type ? 'facet' : 'facet is-on'}>
                  <span>전체</span><span className="meta-value">{all?.length ?? 0}</span>
                </Link>
              </li>
              {Object.entries(TYPE_LABEL).map(([code, label]) => {
                const n = counts.get(code) ?? 0;
                const on = type === code;
                // 0건인 분류도 지우지 않는다 — 무엇이 없는지도 정보다.
                return (
                  <li key={code}>
                    {n > 0 || on ? (
                      <Link href={href({ type: on ? null : code })} className={on ? 'facet is-on' : 'facet'}>
                        <span>{label}</span><span className="meta-value">{n}</span>
                      </Link>
                    ) : (
                      <span className="facet is-empty"><span>{label}</span><span className="meta-value">0</span></span>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* 연도·인물은 접어 둔다. 형태분류가 먼저 오는 갈래이기 때문이다. */}
            <details className="facet-group" open={Boolean(year)}>
              <summary className="facet-title">
                <span>연도</span><span className="label-code">dcterms:created</span>
              </summary>
              <ul className="facets">
                {[...decades.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => {
                  const on = year === `${d}s`;
                  return (
                    <li key={d}>
                      <Link href={href({ year: on ? null : `${d}s` })} className={on ? 'facet is-on' : 'facet'}>
                        <span>{d}년대</span><span className="meta-value">{n}</span>
                      </Link>
                      {/* 고른 연대만 해별로 펼친다 — 스무 해를 늘 늘어놓지 않는다 */}
                      {openDecade === d && (
                        <ul className="facets is-nested">
                          {[...years.entries()].filter(([y]) => Math.floor(y / 10) * 10 === d)
                            .sort((a, b) => a[0] - b[0]).map(([y, yn]) => {
                              const yOn = year === String(y);
                              return (
                                <li key={y}>
                                  <Link href={href({ year: yOn ? `${d}s` : String(y) })}
                                    className={yOn ? 'facet is-on' : 'facet'}>
                                    <span>{y}년</span><span className="meta-value">{yn}</span>
                                  </Link>
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {undated > 0 && (
                  <li>
                    <Link href={href({ year: year === 'none' ? null : 'none' })}
                      className={year === 'none' ? 'facet is-on' : 'facet'}>
                      <span>연도 모름</span><span className="meta-value">{undated}</span>
                    </Link>
                  </li>
                )}
              </ul>
            </details>

            <details className="facet-group" open={Boolean(person)}>
              <summary className="facet-title">
                <span>인물</span><span className="label-code">dc:contributor</span>
              </summary>
              {peopleRows.length ? (
                <ul className="facets">
                  {peopleRows.map(([id, { name, n }]) => {
                    const on = person === id;
                    return (
                      <li key={id}>
                        <Link href={href({ person: on ? null : id })} className={on ? 'facet is-on' : 'facet'}>
                          <span>{name}</span><span className="meta-value">{n}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="help">걸린 사람이 없다.</p>
              )}
            </details>
          </aside>

          <section>
            <p className="result-head">
              {bundle && (
                <span className="heading">묶음 {bundle.identifier} {bundle.title}{' '}
                  <Link className="meta-value" href={q || type ? `/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}) })}` : '/search'}>묶음 풀기 ×</Link>
                </span>
              )}
              {q && <span className="heading">‘{q}’ 검색 결과</span>}
              <span className="meta-value">
                {[
                  type ? TYPE_LABEL[type] : null,
                  year === 'none' ? '연도 모름' : year?.endsWith('s') ? `${year.slice(0, 4)}년대` : year ? `${year}년` : null,
                  person ? people.get(person)?.name ?? person : null,
                ].filter(Boolean).map((x) => `${x} · `).join('')}전체 {items?.length ?? 0}건
              </span>
            </p>

            {items?.length ? (
              <ul className="results">
                {items.map((it) => (
                  <li key={it.identifier}>
                    <Link href={`/item/${it.identifier}`} className="result">
                      <Thumb fileId={thumbs.get(it.id)} type={it.type} alt={it.title} />
                      <div>
                        <p className="heading">{it.title}</p>
                        {it.description && <p className="body-sm clamp2">{it.description}</p>}
                        <p className="meta-value">
                          {TYPE_LABEL[it.type]}{it.doc_type ? ` > ${it.doc_type}` : ''}
                          {' · '}{it.created_edtf ?? '생산일자 기록 없음'}
                          {it.date_verified && <span className="verified">확인됨</span>}
                          {' · '}{it.identifier}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                {q || type || year || person
                  ? '맞는 자료가 없다. 검색어를 줄이거나 분류를 하나씩 풀어 본다.'
                  : '아직 공개된 자료가 없다.'}
              </p>
            )}
          </section>
        </div>

        <SiteFooter />
      </main>
    </>
  );
}
