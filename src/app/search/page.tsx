import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL } from '@/lib/labels';
import { looseHit } from '@/lib/search';
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

  // 이 범위(전체 또는 묶음 하나)의 자료를 모두 받아 여기서 거른다. 자료가 100건 대이고,
  // 검색어가 걸린 사람·장소·주제·묶음의 이름까지 봐야 하는데 그것은 item 표의 칸이 아니기 때문이다.
  // 비공개 자료는 RLS 가 행 자체를 주지 않는다 — 여기서 따로 거르지 않는다.
  const names4 = 'identifier, display_name, short_name, real_name, aliases';
  const select = 'id, identifier, title, type, doc_type, description, creator, contributor, publisher, source,'
    + ' created_edtf, created_start, date_verified, place(family_name, admin_name),'
    + ` bundle(title, source), creator_person:creator_person_id(${names4}), item_subject(subject(label))`;
  const base = supabase.from('item').select(select)
    .order('created_start', { ascending: true, nullsFirst: false });
  const { data: all } = params.bundle
    ? await base.eq('bundle_id', bundle?.id ?? '00000000-0000-0000-0000-000000000000')
    : await base;

  type Place = { family_name: string; admin_name: string | null };
  type Person = {
    identifier: string; display_name: string; short_name: string | null;
    real_name: string | null; aliases: string[] | null;
  };
  type Subject = { label: string };
  type Row = {
    id: string; identifier: string; title: string; type: string; doc_type: string | null;
    description: string | null; creator: string | null; contributor: string | null;
    source: string | null; created_edtf: string | null; created_start: string | null;
    publisher: string | null;
    date_verified: boolean; place: Place | Place[] | null;
    bundle: { title: string; source: string | null } | { title: string; source: string | null }[] | null;
    creator_person: Person | Person[] | null;
    item_subject: { subject: Subject | Subject[] | null }[] | null;
  };
  // 관계는 하나여도 배열로 올 수 있다. 첫 것만 쓴다.
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;
  const rows = (all ?? []) as unknown as Row[];

  // 자료에 걸린 사람. RLS 가 못 볼 사람은 애초에 주지 않는다.
  const { data: links } = rows.length
    ? await supabase.from('item_person')
      .select(`item_id, person!inner(${names4})`)
      .in('item_id', rows.map((i) => i.id))
    : { data: [] };

  type Link2 = { item_id: string; person: Person | Person[] };
  const peopleOf = new Map<string, Person[]>();
  const names = new Map<string, string>();
  for (const row of (links ?? []) as unknown as Link2[]) {
    const p = one(row.person);
    if (!p) continue;
    names.set(p.identifier, p.display_name);
    // 한 사람이 한 자료에 두 역할로 걸려도 한 번만 센다.
    const list = peopleOf.get(row.item_id) ?? [];
    if (!list.some((x) => x.identifier === p.identifier)) list.push(p);
    peopleOf.set(row.item_id, list);
  }

  const yearOf = (v: string | null) => (v ? Number(v.slice(0, 4)) : null);

  // 검색어는 낱말로 나눠 모두 걸려야 맞는 것으로 본다("할머니 1978").
  // 낱말 하나는 글 칸이든 사람(등장인물·생산자)·장소·주제·묶음의 이름이든 어디에 있어도 된다.
  // 자료 상세의 표에 보이는 말이면 그 말로 찾아져야 한다.
  const words = q.split(/\s+/).filter(Boolean);
  const hitQ = (it: Row) => {
    const place = one(it.place);
    const bundleOf = one(it.bundle);
    const maker = one(it.creator_person);
    const fields = [
      it.title, it.description, it.creator, it.contributor, it.publisher, it.source, it.doc_type,
      it.created_edtf, it.identifier, TYPE_LABEL[it.type], place?.family_name, place?.admin_name,
      bundleOf?.title, bundleOf?.source,
      ...(it.item_subject ?? []).map((s) => one(s.subject)?.label),
      ...[...(peopleOf.get(it.id) ?? []), ...(maker ? [maker] : [])].flatMap((p) => [
        p.display_name, p.short_name, p.real_name, ...(p.aliases ?? []),
      ]),
    ];
    return words.every((w) => looseHit(w, ...fields));
  };
  const hitType = (it: Row) => !type || it.type === type;
  const hitYear = (it: Row) => {
    if (!year) return true;
    const y = yearOf(it.created_start);
    if (year === 'none') return y === null;
    if (y === null) return false;
    const from = Number(year.slice(0, 4));
    return year.endsWith('s') ? y >= from && y <= from + 9 : y === from;
  };
  const hitPerson = (it: Row) =>
    !person || (peopleOf.get(it.id) ?? []).some((p) => p.identifier === person);

  const found = rows.filter(hitQ);
  const matched = found.filter((it) => hitType(it) && hitYear(it) && hitPerson(it));
  const items = matched.slice(0, 100);

  const thumbs = await thumbsFor(supabase, items.map((i) => i.id));

  // 분류의 건수는 "이 줄을 누르면 몇 건이 나오는가" 를 말한다. 그래서 검색어와 다른 갈래의
  // 조건은 걸고, 제 갈래의 조건만 풀어서 센다. 건수가 있는데 눌러 보면 비어 있는 일이 없게 한다.
  const byType = found.filter((it) => hitYear(it) && hitPerson(it));
  const counts = new Map<string, number>();
  for (const row of byType) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);

  // 연도 — 연대로 묶어 보여 주고, 고른 연대만 해별로 펼친다. 연도가 없는 자료도 한 줄 둔다.
  const decades = new Map<number, number>();
  const years = new Map<number, number>();
  let undated = 0;
  for (const row of found.filter((it) => hitType(it) && hitPerson(it))) {
    const y = yearOf(row.created_start);
    if (y === null) { undated += 1; continue; }
    years.set(y, (years.get(y) ?? 0) + 1);
    const d = Math.floor(y / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }
  const openDecade = year && year !== 'none'
    ? Math.floor(Number(year.slice(0, 4)) / 10) * 10
    : null;
  // 고른 줄은 0건이어도 남긴다 — 사라지면 풀 길이 없다.
  if (openDecade !== null && !decades.has(openDecade)) decades.set(openDecade, 0);
  if (year && /^\d{4}$/.test(year) && !years.has(Number(year))) years.set(Number(year), 0);

  // 인물 — 몇 건에 걸렸는지. 많이 걸린 사람부터.
  const people = new Map<string, { name: string; n: number }>();
  for (const row of found.filter((it) => hitType(it) && hitYear(it))) {
    for (const p of peopleOf.get(row.id) ?? []) {
      const seen = people.get(p.identifier) ?? { name: p.display_name, n: 0 };
      people.set(p.identifier, { name: seen.name, n: seen.n + 1 });
    }
  }
  if (person && !people.has(person)) people.set(person, { name: names.get(person) ?? person, n: 0 });
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
                  <span>전체</span><span className="meta-value">{byType.length}</span>
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
                {(undated > 0 || year === 'none') && (
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
                ].filter(Boolean).map((x) => `${x} · `).join('')}전체 {matched.length}건
              </span>
            </p>

            {items.length ? (
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
