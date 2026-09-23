import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL, ACCESS_LABEL } from '@/lib/labels';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import TranscriptView from '@/components/transcript-view';
import TranscriptPlayer from '@/components/transcript-player';
import type { Segment } from '@/lib/transcript';

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

  const [{ data: files }, { data: subjects }, { data: people }, { data: transcript }] = await Promise.all([
    // 원본과, 원본에서 만든 재생용 사본(stream)·썸네일(thumb, 영상 포스터로 쓴다)
    supabase.from('file').select('id, role, derived_from, mime, original_filename, width, height, bytes, codec')
      .eq('item_id', item.id).in('role', ['original', 'stream', 'thumb']).order('created_at'),
    supabase.from('item_subject').select('subject(label)').eq('item_id', item.id),
    supabase.from('item_person').select('role, person(display_name, identifier)').eq('item_id', item.id),
    supabase.from('transcript').select('segments, reviewed').eq('item_id', item.id).maybeSingle(),
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

  // 상세정보 표 — 디자인 시스템(README '상세정보 표', MetadataTable)이 정한 순서.
  // 값이 없는 행은 숨긴다. "기록 없음"은 관리 화면에서만 드러낸다(MetadataTable showEmpty).
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
  ];

  const originals = (files ?? []).filter((f) => f.role === 'original');
  const derived = (id: string, role: string) => (files ?? []).find((f) => f.derived_from === id && f.role === role);
  const images = originals.filter((f) => f.mime?.startsWith('image/'));
  const others = originals.filter((f) => !f.mime?.startsWith('image/'));
  // 녹취록의 시각은 첫 음성·영상 원본을 따른다.
  const player = others.find((f) => f.mime?.startsWith('audio/') || f.mime?.startsWith('video/'));
  const segments = (transcript?.segments ?? []) as Segment[];

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
                  // 녹취록이 있는 음성만 대목이 흐르는 재생기다. 없으면 재생기만 둔다.
                  segments.length > 0 && player?.id === f.id ? (
                    <TranscriptPlayer fileId={f.id} src={`/api/media/${f.id}`} segments={segments} />
                  ) : (
                    <audio id={`media-${f.id}`} controls preload="none" src={`/api/media/${f.id}`} />
                  )
                ) : f.mime?.startsWith('video/') ? (() => {
                  // 재생용 사본(H.264·목차 앞)이 있으면 그것을 튼다. 원본은 아래 링크로 받는다.
                  const stream = derived(f.id, 'stream');
                  const poster = derived(f.id, 'thumb');
                  return (
                    <>
                      <video id={`media-${f.id}`} controls preload="none" playsInline
                        src={`/api/media/${stream?.id ?? f.id}`}
                        poster={poster ? `/api/media/${poster.id}` : undefined} />
                      {stream && (
                        <p className="help">
                          재생용 사본이다.{' '}
                          <a href={`/api/media/${f.id}`} download>원본 받기</a>
                          <span className="meta-value">
                            {' '}{[f.codec?.split(',')[0]?.toUpperCase(), f.width && f.height ? `${f.width}×${f.height}` : null,
                              f.bytes ? `${Math.round(f.bytes / 1e5) / 10}MB` : null].filter(Boolean).join(' · ')}
                          </span>
                        </p>
                      )}
                    </>
                  );
                })() : (
                  <a href={`/api/media/${f.id}`}>{f.original_filename ?? '원본 보기'}</a>
                )}
              </li>
            ))}
          </ul>
        )}

        {segments.length > 0 && (
          <section className="section" id="transcript">
            {/* 제목 줄에 펼침 손잡이와 찾기가 붙어 있어 h2 도 컴포넌트가 그린다 */}
            <TranscriptView segments={segments} playerId={player ? `media-${player.id}` : null}
              reviewed={!!transcript?.reviewed} />
          </section>
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
