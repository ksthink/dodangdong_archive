import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { resolveHero } from '@/lib/hero';
import Hero from '@/components/hero';
import { thumbsFor } from '@/lib/thumbs';
import Thumb from '@/components/thumb';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

// 첫 화면은 로그인 화면이 아니라 아카이브 그 자체다. 문(인트로)을 지나온 사람만 여기에 닿는다.
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
  // 히어로에는 공개 이야기·자료만 건다 — resolveHero 가 직접 거른다.
  const heroSlides = await resolveHero(supabase);

  const [{ data: items }, { data: people, count: peopleCount }, { data: counts }] = await Promise.all([
    supabase
      .from('item')
      .select('id, identifier, title, type, created_edtf, date_verified')
      .order('submitted_at', { ascending: false })
      .limit(8),
    // 이야기는 히어로가 이미 걸고 있다 — 여기서는 인물을 보인다. 최근에 손댄 여덟 명.
    supabase
      .from('person')
      .select('id, identifier, display_name, short_name, real_name, birth_edtf, death_edtf', { count: 'exact' })
      .order('modified_at', { ascending: false })
      .limit(8),
    supabase.from('item').select('type'),
  ]);

  const thumbs = await thumbsFor(supabase, (items ?? []).map((i) => i.id));

  const byType = new Map<string, number>();
  for (const row of counts ?? []) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  const total = counts?.length ?? 0;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="display">도당동 아카이브</h1>
        <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
          한 집안의 사진·편지·음성·영상과 그에 얽힌 사건을 모아 기술해 둔 곳이다.
          지금 공개된 자료는 {total}건이다.
        </p>

        <Hero slides={heroSlides} />

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
                  {/* 이름 왼쪽 끝, 건수 오른쪽 끝. 크기는 같고 굵기와 색만 낮춰 이름이 먼저 읽히게 한다 */}
                  <p className="type-line">
                    <span className="heading">{label}</span>
                    <span className="type-count">{byType.get(code) ?? 0}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2 className="section-title">
            인물 <Link className="meta-value" href="/people">최근 수정 순 8명 · 전체 {peopleCount ?? 0}명</Link>
          </h2>
          {/* 형태분류와 같은 격자(넓은 화면에서 네 장) — 그래서 카드도 작게 짠다 */}
          {people?.length ? (
            <ul className="grid">
              {people.map((p) => (
                <li key={p.id} className="card">
                  <Link href={`/people/${p.identifier}`} className="person-mini">
                    {/* 얼굴 사진이 없으면 디더 면에 호칭 첫 글자 */}
                    <div className="face is-s"><span>{(p.short_name ?? p.display_name).slice(0, 1)}</span></div>
                    <div className="person-mini-text">
                      <p className="heading">{p.short_name ?? p.display_name}</p>
                      {p.real_name && p.real_name !== p.short_name && <p className="body-sm">{p.real_name}</p>}
                      <p className="meta-value">{p.birth_edtf ?? '?'}–{p.death_edtf ?? ''}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">아직 등록된 인물이 없다.</p>
          )}
        </section>

        <section className="section">
          <h2 className="section-title">최근 등록</h2>
          {items?.length ? (
            <ul className="grid">
              {items.map((item) => (
                <li key={item.id} className="card">
                  <Link href={`/item/${item.identifier}`}>
                    <Thumb fileId={thumbs.get(item.id)} type={item.type} alt={item.title} />
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
    </>
  );
}
