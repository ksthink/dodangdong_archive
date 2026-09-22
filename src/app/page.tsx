import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SiteFooter from '@/components/site-footer';

// 첫 화면은 로그인 화면이 아니라 아카이브 그 자체다.
// 손님은 세션 없이 여기에 닿고, RLS 가 공개 자료만 돌려준다.
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  StillImage: '사진',
  Text: '문서',
  MovingImage: '영상',
  Sound: '음성',
  PhysicalObject: '실물',
  Event: '사건',
  Collection: '묶음',
};

export default async function Home() {
  const supabase = await createClient();

  const [{ data: items }, { data: stories }, { data: counts }] = await Promise.all([
    supabase
      .from('item')
      .select('id, identifier, title, type, created_edtf, date_verified')
      .order('submitted_at', { ascending: false })
      .limit(8),
    supabase
      .from('collection')
      .select('id, title, summary, period_edtf')
      .eq('kind', 'story')
      // /story 와 같은 순서 — 편성 순서, 같으면 최근 것 먼저
      .order('sort_order')
      .order('created_at', { ascending: false })
      .limit(2),
    supabase.from('item').select('type'),
  ]);

  const byType = new Map<string, number>();
  for (const row of counts ?? []) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  const total = counts?.length ?? 0;

  return (
    <main className="page">
      <h1 className="display">도당동 아카이브</h1>
      <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
        한 집안의 사진·편지·음성·영상과 그에 얽힌 사건을 모아 기술해 둔 곳이다.
        지금 공개된 자료는 {total}건이다.
      </p>

      <form action="/search" style={{ marginTop: 'var(--space-8)', display: 'flex', gap: 'var(--space-2)' }}>
        <input className="field" type="search" name="q" placeholder="자료 찾기" aria-label="자료 찾기" />
        <button className="button" type="submit">찾기</button>
      </form>

      <section className="section">
        <h2 className="section-title">
          형태분류 <span className="meta-value">전체 {total}건</span>
        </h2>
        <ul className="grid">
          {Object.entries(TYPE_LABEL).map(([code, label]) => (
            <li key={code} className="card">
              <Link href={`/search?type=${code}`}>
                <span className="meta-label">{code}</span>
                <p className="heading" style={{ marginTop: 'var(--space-2)' }}>{label}</p>
                <p className="meta-value">{byType.get(code) ?? 0}건</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title">이야기</h2>
        {stories?.length ? (
          <ul className="grid">
            {stories.map((s) => (
              <li key={s.id} className="card">
                <Link href={`/story/${s.id}`}>
                  <p className="heading">{s.title}</p>
                  {s.period_edtf && <p className="meta-value">{s.period_edtf}</p>}
                  {s.summary && <p className="body-sm" style={{ marginTop: 'var(--space-2)' }}>{s.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">아직 엮은 이야기가 없다.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">최근 등록</h2>
        {items?.length ? (
          <ul className="grid">
            {items.map((item) => (
              <li key={item.id} className="card">
                <Link href={`/item/${item.identifier}`}>
                  <div className="thumb-empty"><span>{item.type}</span></div>
                  <p className="heading" style={{ marginTop: 'var(--space-3)' }}>{item.title}</p>
                  <p className="meta-value">
                    {item.created_edtf ?? '생산일자 기록 없음'}
                    {item.date_verified && <span className="verified">확인됨</span>}
                  </p>
                  <p className="meta-value">{item.identifier}</p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">아직 공개된 자료가 없다.</p>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
