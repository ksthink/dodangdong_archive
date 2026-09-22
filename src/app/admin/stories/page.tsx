import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createStory } from '@/lib/story-actions';
import { ACCESS_LABEL } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data: stories } = await supabase
    .from('collection')
    .select('id, title, period_edtf, access_level, modified_at, curation_block(count)')
    .eq('kind', 'story')
    .order('modified_at', { ascending: false });

  return (
    <main className="page">
      <h1 className="title">이야기</h1>
      <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
        여러 자료를 엮어 하나의 이야기로 보여 준다. 이야기는 자료를 가리킬 뿐 — 원 자료의 기술은 고치지 않고,
        큐레이터의 말은 블록의 글과 설명글에만 쓴다.
      </p>
      {deleted && <p className="notice" role="status">「{deleted}」 을(를) 지웠다. 엮었던 자료는 그대로 남는다.</p>}

      <section className="section">
        <h2 className="section-title">새 이야기</h2>
        <form action={createStory} className="inline-form">
          <input className="field" name="title" placeholder="이야기 제목 — 예: 할머니의 부엌" required />
          <button className="button" type="submit">만들기</button>
        </form>
        <p className="help" style={{ marginTop: 'var(--space-2)' }}>비공개로 시작한다. 다 쓴 뒤 공개로 바꾼다.</p>
      </section>

      <section className="section">
        <h2 className="section-title">전체 {stories?.length ?? 0}편</h2>
        {stories?.length ? (
          <table className="table">
            <thead><tr><th>제목</th><th>기간</th><th>블록</th><th>공개 범위</th></tr></thead>
            <tbody>
              {stories.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/admin/stories/${s.id}`}>{s.title}</Link></td>
                  <td className="meta-value">{s.period_edtf ?? '—'}</td>
                  <td className="meta-value">{(s.curation_block as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                  <td><span className={s.access_level === 'public' ? 'badge is-public' : 'badge'}>{ACCESS_LABEL[s.access_level]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">아직 엮은 이야기가 없다.</p>
        )}
      </section>
    </main>
  );
}
