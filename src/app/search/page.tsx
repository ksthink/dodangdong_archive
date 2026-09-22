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
  searchParams: Promise<{ q?: string; type?: string; bundle?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim().slice(0, 80);
  const type = params.type && params.type in TYPE_LABEL ? params.type : null;

  const supabase = await createClient();

  // 묶음으로 좁히기(첫 화면 "새로 들어온 기록"이 여기로 온다). 손님에게는 공개 자료가 있는 묶음만 보인다.
  const { data: bundle } = params.bundle && /^DC-\d+$/.test(params.bundle)
    ? await supabase.from('bundle').select('id, identifier, title').eq('identifier', params.bundle).maybeSingle()
    : { data: null };

  // 비공개 자료는 RLS 가 행 자체를 주지 않는다 — 여기서 따로 거르지 않는다.
  let query = supabase
    .from('item')
    .select('id, identifier, title, type, doc_type, description, created_edtf, date_verified, source')
    .order('created_start', { ascending: true, nullsFirst: false })
    .limit(100);
  if (type) query = query.eq('type', type);
  if (params.bundle) query = query.eq('bundle_id', bundle?.id ?? '00000000-0000-0000-0000-000000000000');
  if (q) {
    const cond = ilikeAny(
      ['title', 'description', 'creator', 'source', 'doc_type', 'created_edtf', 'identifier'], q);
    // 쓸 만한 글자가 없는 검색어("*")는 전부가 아니라 아무것도 아닌 것으로 본다.
    query = cond ? query.or(cond) : query.eq('identifier', '');
  }

  const [{ data: items }, { data: all }] = await Promise.all([
    query,
    (bundle ? supabase.from('item').select('type').eq('bundle_id', bundle.id) : supabase.from('item').select('type')),
  ]);

  const thumbs = await thumbsFor(supabase, (items ?? []).map((i) => i.id));

  const counts = new Map<string, number>();
  for (const row of all ?? []) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);

  const href = (next: { q?: string | null; type?: string | null }) => {
    const p = new URLSearchParams();
    if (bundle) p.set('bundle', bundle.identifier);
    const nq = next.q === undefined ? q : next.q;
    const nt = next.type === undefined ? type : next.type;
    if (nq) p.set('q', nq);
    if (nt) p.set('type', nt);
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
              형태분류 <span className="label-code">dc:type</span>
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
                {type ? `${TYPE_LABEL[type]} · ` : ''}전체 {items?.length ?? 0}건
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
                {q || type
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
