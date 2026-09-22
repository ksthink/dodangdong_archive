import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL, ACCESS_LABEL } from '@/lib/labels';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ identifier: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { identifier } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('item').select('title').eq('identifier', identifier).maybeSingle();
  return { title: data ? `${data.title} · 도당동 아카이브` : '도당동 아카이브' };
}

export default async function ItemPage({ params }: Params) {
  const { identifier } = await params;
  const supabase = await createClient();

  // 비공개 자료는 손님에게 행이 오지 않는다 — 없는 자료와 똑같이 404 다.
  const { data: item } = await supabase
    .from('item')
    .select('*, bundle(identifier, title, source), place(family_name, admin_name), creator_person:creator_person_id(display_name, identifier)')
    .eq('identifier', identifier)
    .maybeSingle();
  if (!item) notFound();

  const [{ data: files }, { data: subjects }, { data: people }] = await Promise.all([
    supabase.from('file').select('id, mime, original_filename, width, height').eq('item_id', item.id).order('created_at'),
    supabase.from('item_subject').select('subject(label)').eq('item_id', item.id),
    supabase.from('item_person').select('role, person(display_name, identifier)').eq('item_id', item.id),
  ]);

  // 관계는 하나여도 배열로 올 수 있다. 첫 것만 쓴다.
  const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null;
  const bundle = one<{ identifier: string; title: string; source: string }>(item.bundle);
  const place = one<{ family_name: string; admin_name: string | null }>(item.place);
  // 등록된 인물이 생산자면 그 이름을, 아니면 적어 둔 이름(기관·미상)을 쓴다.
  const creatorPerson = one<{ display_name: string; identifier: string }>(item.creator_person);
  const subjectLabels = (subjects ?? []).map((s) => one<{ label: string }>(s.subject)?.label).filter(Boolean);
  const depicted = (people ?? [])
    .filter((p) => p.role === 'depicted')
    .map((p) => one<{ display_name: string; identifier: string }>(p.person))
    .filter(Boolean) as { display_name: string; identifier: string }[];
  const personLink = (p: { display_name: string; identifier: string }) => (
    <Link key={p.identifier} href={`/people/${p.identifier}`}>{p.display_name}</Link>
  );

  // 상세정보 표 — README 가 정한 순서. 값이 없는 행은 숨긴다.
  const rows: [string, string, React.ReactNode][] = [
    ['생산자', 'dc:creator', creatorPerson ? personLink(creatorPerson) : item.creator],
    ['생산일자', 'dc:date', item.created_edtf && (
      <>{item.created_edtf}{item.date_verified && <span className="verified">확인됨</span>}</>
    )],
    ['형태분류', 'dc:type', <Link key="t" href={`/search?type=${item.type}`}>
      {TYPE_LABEL[item.type]}{item.doc_type ? ` > ${item.doc_type}` : ''}</Link>],
    ['출처분류', 'dc:source', [bundle?.source, item.source].filter(Boolean).join(' > ') || null],
    ['주제분류', 'dc:subject', subjectLabels.length ? subjectLabels.join(' · ') : null],
    ['장소', 'dcterms:spatial', place && [place.family_name, place.admin_name].filter(Boolean).join(', ')],
    ['등장인물', 'dc:subject', depicted.length
      ? depicted.map((p, i) => <span key={p.identifier}>{i > 0 && ' · '}{personLink(p)}</span>)
      : null],
    ['참여자', 'dc:contributor', item.contributor],
    ['발행처', 'dc:publisher', item.publisher],
    ['형식', 'dc:format', [item.medium, item.extent].filter(Boolean).join(' · ') || null],
    ['식별자', 'dc:identifier', item.identifier],
    ['언어', 'dc:language', item.language],
    ['이용조건', 'dc:rights', [ACCESS_LABEL[item.access_level], item.rights].filter(Boolean).join(' · ')],
    ['태그', 'dc:subject', item.tags?.length ? item.tags.map((t: string) => `#${t}`).join(' ') : null],
  ];

  const images = (files ?? []).filter((f) => f.mime?.startsWith('image/'));
  const others = (files ?? []).filter((f) => !f.mime?.startsWith('image/'));

  return (
    <>
      <SiteHeader />
      <main className="page">
        <p className="crumbs meta-value">
          <Link href="/search">형태분류</Link> &gt;{' '}
          <Link href={`/search?type=${item.type}`}>{TYPE_LABEL[item.type]}</Link>
          {bundle && <> · 묶음 {bundle.identifier} {bundle.title}</>}
        </p>

        <h1 className="title" style={{ marginTop: 'var(--space-2)' }}>{item.title}</h1>
        {item.description && <p className="measure" style={{ marginTop: 'var(--space-4)' }}>{item.description}</p>}

        {images.length > 0 && (
          <div className={images.length === 1 ? 'figure-one' : 'figure-grid'}>
            {images.map((f) => (
              <a key={f.id} href={`/api/media/${f.id}`} target="_blank" rel="noreferrer">
                {/* 원본 비율을 지킨다. 필터·세피아를 입히지 않는다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${f.id}`} alt={`${item.title} — ${f.original_filename ?? ''}`}
                  width={f.width ?? undefined} height={f.height ?? undefined} loading="lazy" />
              </a>
            ))}
          </div>
        )}

        {others.length > 0 && (
          <ul className="media-list">
            {others.map((f) => (
              <li key={f.id}>
                {f.mime?.startsWith('audio/') ? (
                  <audio controls preload="none" src={`/api/media/${f.id}`} />
                ) : f.mime?.startsWith('video/') ? (
                  <video controls preload="none" src={`/api/media/${f.id}`} />
                ) : (
                  <a href={`/api/media/${f.id}`}>{f.original_filename ?? '원본 보기'}</a>
                )}
              </li>
            ))}
          </ul>
        )}

        <section className="section">
          <h2 className="section-title">상세정보</h2>
          <dl className="meta-table">
            {rows.filter(([, , v]) => v !== null && v !== undefined && v !== '').map(([label, code, value]) => (
              <div key={label + code} className="meta-row">
                <dt><span>{label}</span><span className="label-code">{code}</span></dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
