import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL } from '@/lib/labels';
import { edtfYear } from '@/lib/edtf';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };
type Item = { id: string; identifier: string; title: string; type: string; created_edtf: string | null; date_verified: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: '도당동 아카이브' };
  const supabase = await createClient();
  const { data } = await supabase.from('collection').select('title').eq('id', id).maybeSingle();
  return { title: data ? `${data.title} · 도당동 아카이브` : '도당동 아카이브' };
}

const ms = (v: number) => {
  const s = Math.round(v / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Source({ item }: { item: Item }) {
  return (
    <span className="meta-value">
      {item.type} · <Link href={`/item/${item.identifier}`}>{item.title}</Link> · {item.created_edtf ?? '생산일자 기록 없음'}
      {item.date_verified && <span className="verified">확인됨</span>} · {item.identifier}
    </span>
  );
}

export default async function StoryPage({ params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  // 비공개 이야기는 손님에게 행이 오지 않는다 — 없는 이야기와 같은 404.
  const { data: story } = await supabase.from('collection').select('*').eq('id', id).eq('kind', 'story').maybeSingle();
  if (!story) notFound();

  // 공개된 출처가 하나도 없는 자료 블록은 정책이 이미 걸러 준다(0007).
  const { data: blocks } = await supabase
    .from('curation_block')
    .select('id, kind, body, caption, timecode_ms, speaker:speaker_id(identifier, display_name), curation_ref(sort_order, item(id, identifier, title, type, created_edtf, date_verified))')
    .eq('collection_id', id)
    .order('position');

  const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null;
  const refsOf = (b: { curation_ref: unknown }) =>
    ((b.curation_ref ?? []) as { sort_order: number; item: unknown }[])
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((r) => one<Item>(r.item))
      .filter(Boolean) as Item[];

  // 엮은 자료 전체 — 끝에 목록으로, 연표 블록의 재료로.
  const all = new Map<string, Item>();
  for (const b of blocks ?? []) for (const it of refsOf(b)) all.set(it.identifier, it);
  const allItems = [...all.values()];

  const { data: files } = allItems.length
    ? await supabase.from('file').select('id, item_id, mime, width, height').in('item_id', allItems.map((i) => i.id)).order('created_at')
    : { data: [] as { id: string; item_id: string; mime: string | null; width: number | null; height: number | null }[] };
  const imageOf = new Map<string, { id: string; width: number | null; height: number | null }>();
  for (const f of files ?? []) if (f.mime?.startsWith('image/') && !imageOf.has(f.item_id)) imageOf.set(f.item_id, f);

  const Picture = ({ item, square }: { item: Item; square?: boolean }) => {
    const img = imageOf.get(item.id);
    if (!img) return <div className="thumb-empty"><span>{item.type}</span></div>;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/media/${img.id}`} alt={item.title} loading="lazy" className={square ? 'is-square' : ''}
        width={img.width ?? undefined} height={img.height ?? undefined} />
    );
  };

  const timeline = (items: Item[]) => {
    const byYear = new Map<number, Item[]>();
    for (const it of items) {
      const y = edtfYear(it.created_edtf);
      if (y !== null) byYear.set(y, [...(byYear.get(y) ?? []), it]);
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  };

  return (
    <>
      <SiteHeader />
      <main className="page">
        <p className="meta-value"><Link href="/story">이야기</Link></p>
        <h1 className="title" style={{ marginTop: 'var(--space-2)' }}>{story.title}</h1>
        {story.period_edtf && <p className="meta-value">{story.period_edtf}</p>}
        {story.summary && <p className="measure" style={{ marginTop: 'var(--space-4)' }}>{story.summary}</p>}

        <article className="story">
          {(blocks ?? []).map((b) => {
            const refs = refsOf(b);
            const speaker = one<{ identifier: string; display_name: string }>(b.speaker);
            switch (b.kind) {
              case 'heading':
                return <h2 key={b.id} className="heading story-heading">{b.body}</h2>;
              case 'text':
                return <p key={b.id} className="measure">{b.body}</p>;
              case 'record': {
                const it = refs[0];
                return (
                  <figure key={b.id} className="story-record">
                    <Picture item={it} />
                    {b.caption && <figcaption className="body-sm">{b.caption}</figcaption>}
                    <Source item={it} />
                  </figure>
                );
              }
              case 'gallery':
                return (
                  <figure key={b.id} className="story-record is-wide">
                    <div className="figure-grid">{refs.map((it) => <Picture key={it.identifier} item={it} square />)}</div>
                    {b.caption && <figcaption className="body-sm">{b.caption}</figcaption>}
                    <span className="meta-value">
                      {refs.map((it, i) => <span key={it.identifier}>{i > 0 && ' · '}<Link href={`/item/${it.identifier}`}>{it.identifier}</Link></span>)}
                    </span>
                  </figure>
                );
              case 'quote':
                // 인용문은 원 자료에서 한 글자도 고치지 않는다.
                return (
                  <blockquote key={b.id} className="story-quote">
                    <p>{b.body}</p>
                    <footer className="meta-value">
                      {speaker && <Link href={`/people/${speaker.identifier}`}>{speaker.display_name}</Link>}
                      {refs[0] && <> · <Link href={`/item/${refs[0].identifier}`}>{refs[0].title}</Link></>}
                      {b.timecode_ms !== null && <> · {ms(b.timecode_ms)}</>}
                    </footer>
                  </blockquote>
                );
              case 'timeline': {
                const rows = timeline(refs.length ? refs : allItems);
                if (!rows.length) return null;
                return (
                  <div key={b.id} className="story-timeline">
                    {b.caption && <p className="body-sm">{b.caption}</p>}
                    {rows.map(([y, items]) => (
                      <div key={y} className="tl-year">
                        <span className="heading">{y}</span>
                        <div>
                          {items.map((it) => (
                            <p key={it.identifier} className="body-sm">
                              <span className={it.type === 'Event' ? 'mark-square' : 'tl-dot'} aria-hidden />
                              <span className="meta-value">{it.created_edtf}</span>{' '}
                              <Link href={`/item/${it.identifier}`}>{it.type === 'Event' ? <b>{it.title}</b> : it.title}</Link>
                              {it.date_verified && <span className="verified">확인됨</span>}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              default:
                return null;
            }
          })}
        </article>

        {allItems.length > 0 && (
          <section className="section">
            <h2 className="section-title"><span>엮은 자료</span><span className="label-code">dcterms:hasPart</span></h2>
            <ul className="related">
              {allItems.map((it) => (
                <li key={it.identifier}>
                  <span className="meta-label">{TYPE_LABEL[it.type]}</span>{' '}
                  <Link href={`/item/${it.identifier}`}>{it.title}</Link>{' '}
                  <span className="meta-value">{it.created_edtf ?? ''} · {it.identifier}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SiteFooter />
      </main>
    </>
  );
}
