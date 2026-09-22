import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const dynamic = 'force-dynamic';
export const metadata = { title: '이야기 · 도당동 아카이브' };

export default async function StoriesPage() {
  const supabase = await createClient();
  // 비공개 이야기는 손님에게 행이 오지 않는다.
  const { data: stories, error } = await supabase
    .from('collection')
    .select('id, title, summary, period_edtf, curation_block!curation_block_collection_id_fkey(count)')
    .eq('kind', 'story')
    .order('sort_order').order('created_at', { ascending: false });
  if (error) throw new Error(`이야기 목록을 읽지 못했다: ${error.message}`);

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="title">이야기</h1>
        <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
          여러 자료를 엮어 글과 함께 읽는다. 이야기 속 글은 엮은 사람의 말이고, 자료의 기술은 원래 그대로다.
        </p>
        <section className="section">
          {stories?.length ? (
            <ul className="story-grid">
              {stories.map((s, i) => (
                <li key={s.id} className="card">
                  <Link href={`/story/${s.id}`} className="story-card">
                    <span className="meta-label">이야기 #{i + 1}</span>
                    <p className="title">{s.title}</p>
                    {s.period_edtf && <p className="meta-value">{s.period_edtf}</p>}
                    {s.summary && <p className="body-sm">{s.summary}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">아직 엮은 이야기가 없다.</p>
          )}
        </section>
        <SiteFooter />
      </main>
    </>
  );
}
