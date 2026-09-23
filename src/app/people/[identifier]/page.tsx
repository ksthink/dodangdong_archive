import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL } from '@/lib/labels';
import { edtfYear } from '@/lib/edtf';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import LifeLane, { LaneAxis, LaneLegend, LaneScroller, type LaneRecord } from '@/components/life-lane';
import { thumbsFor } from '@/lib/thumbs';
import Thumb from '@/components/thumb';
import Face from '@/components/face';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ identifier: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { identifier } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('person').select('display_name').eq('identifier', identifier).maybeSingle();
  return { title: data ? `${data.display_name} · 도당동 아카이브` : '도당동 아카이브' };
}

type ItemRow = { id: string; identifier: string; title: string; type: string; created_edtf: string | null; date_verified: boolean };

function ItemList({ items, empty, thumbs }: { items: ItemRow[]; empty: string; thumbs: Map<string, string> }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="results">
      {items.map((it) => (
        <li key={it.identifier}>
          <Link href={`/item/${it.identifier}`} className="result">
            <Thumb fileId={thumbs.get(it.id)} type={it.type} alt={it.title} />
            <div>
              <p className="heading">{it.title}</p>
              <p className="meta-value">
                {TYPE_LABEL[it.type]} · {it.created_edtf ?? '생산일자 기록 없음'}
                {it.date_verified && <span className="verified">확인됨</span>} · {it.identifier}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PersonPage({ params }: Params) {
  const { identifier } = await params;
  const supabase = await createClient();

  // 공개 자료에 나오지 않는 사람은 손님에게 행이 오지 않는다 — 없는 사람과 같은 404.
  const { data: person } = await supabase.from('person').select('*').eq('identifier', identifier).maybeSingle();
  if (!person) notFound();

  const cols = 'id, identifier, title, type, created_edtf, created_start, date_verified';
  const [{ data: periods }, { data: made }, { data: appears }, { data: parents }, { data: children }, { data: spouses }] =
    await Promise.all([
      supabase.from('life_period').select('label, from_edtf, to_edtf, from_year, to_year').eq('person_id', person.id).order('sort_order'),
      supabase.from('item').select(cols).eq('creator_person_id', person.id).order('created_start', { nullsFirst: false }),
      supabase.from('item_person').select(`item(${cols})`).eq('person_id', person.id).eq('role', 'depicted'),
      supabase.from('person_relation').select('p:to_person_id(identifier, display_name)').eq('from_person_id', person.id).eq('kind', 'parent'),
      supabase.from('person_relation').select('p:from_person_id(identifier, display_name)').eq('to_person_id', person.id).eq('kind', 'parent'),
      supabase.from('person_relation').select('p:to_person_id(identifier, display_name)').eq('from_person_id', person.id).eq('kind', 'spouse'),
    ]);

  const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null;
  const appearsItems = (appears ?? []).map((r) => one<ItemRow & { created_start: string | null }>(r.item)).filter(Boolean) as (ItemRow & { created_start: string | null })[];
  appearsItems.sort((a, b) => (a.created_start ?? '9999').localeCompare(b.created_start ?? '9999'));
  const thumbs = await thumbsFor(supabase, [...appearsItems, ...(made ?? [])].map((i) => i.id));

  // 관계 상대 중 손님에게 보이지 않는 사람은 RLS 가 null 로 돌려준다 — 이름만 빠지고 링크는 달지 않는다.
  const kin = (rows: { p: unknown }[] | null) =>
    (rows ?? []).map((r) => one<{ identifier: string; display_name: string }>(r.p)).filter(Boolean) as { identifier: string; display_name: string }[];
  const family: [string, { identifier: string; display_name: string }[]][] = [
    ['부모', kin(parents)], ['배우자', kin(spouses)], ['자녀', kin(children)],
  ];

  // 만든 자료와 나오는 자료. 둘 다인 자료는 한 번만 센다.
  const recordMap = new Map<string, LaneRecord>();
  for (const it of [...((made ?? []) as ItemRow[]), ...appearsItems]) {
    const year = edtfYear(it.created_edtf);
    if (year !== null) recordMap.set(it.identifier, { year, type: it.type, verified: it.date_verified, title: it.title, date: it.created_edtf });
  }
  const records = [...recordMap.values()];
  const years = records.map((r) => r.year);
  const born = person.born_year as number | null;
  const died = person.died_year as number | null;
  const nowYear = new Date().getFullYear();
  const from = Math.floor(((born ?? Math.min(...years, nowYear)) - 2) / 10) * 10;
  const to = died ?? nowYear;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <p className="meta-value"><Link href="/people">인물</Link> · {person.identifier}</p>

        <div className="person-head" style={{ marginTop: 'var(--space-4)' }}>
          <Face fileId={person.face_file_id} name={person.short_name ?? person.display_name} size="l" />
          <div>
            {/* 호칭을 크게, 실명을 작게 — 가족 사이트에서는 "할머니"가 이름보다 먼저 읽힌다 */}
            <h1 className="display">{person.short_name ?? person.display_name}</h1>
            {person.real_name && <p className="heading">{person.real_name}</p>}
            <dl className="facts">
              <dt>생몰</dt><dd className="meta-value">{person.birth_edtf ?? '?'}–{person.death_edtf ?? ''}</dd>
              {person.relation_to_root && (<><dt>관계</dt><dd>{person.relation_to_root}</dd></>)}
              {person.aliases?.length > 0 && (<><dt>다른 이름</dt><dd>{person.aliases.join(' · ')}</dd></>)}
              {family.filter(([, list]) => list.length).map(([label, list]) => (
                <span key={label} style={{ display: 'contents' }}>
                  <dt>{label}</dt>
                  <dd>{list.map((k, i) => (
                    <span key={k.identifier}>{i > 0 && ' · '}<Link href={`/people/${k.identifier}`}>{k.display_name}</Link></span>
                  ))}</dd>
                </span>
              ))}
            </dl>
            {person.note && <p className="measure" style={{ marginTop: 'var(--space-4)' }}>{person.note}</p>}
          </div>
        </div>

        <section className="section">
          <h2 className="section-title"><span>생애</span><span className="label-code">dcterms:temporal</span></h2>
          <LaneLegend />
          <LaneScroller from={from} to={to}>
            <LaneAxis from={from} to={to} />
            <LifeLane from={from} to={to} showPeriodList lane={{
              identifier: person.identifier,
              name: person.short_name ?? person.display_name, born, died,
              periods: (periods ?? []).map((p) => ({ label: p.label, from: p.from_year, to: p.to_year })),
              records,
            }} />
          </LaneScroller>
        </section>

        <section className="section">
          <h2 className="section-title"><span>나오는 자료</span><span className="meta-value">{appearsItems.length}건</span></h2>
          <ItemList items={appearsItems} thumbs={thumbs} empty="이 사람이 나오는 공개 자료가 없다." />
        </section>

        <section className="section">
          <h2 className="section-title"><span>만든 자료</span><span className="meta-value">{made?.length ?? 0}건</span></h2>
          <ItemList items={(made ?? []) as ItemRow[]} thumbs={thumbs} empty="이 사람이 만든 공개 자료가 없다." />
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
