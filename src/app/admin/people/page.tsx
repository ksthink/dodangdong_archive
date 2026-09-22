import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data: people } = await supabase
    .from('person')
    .select('identifier, display_name, short_name, birth_edtf, death_edtf, relation_to_root, item_person(count)')
    .order('born_year', { ascending: true, nullsFirst: false });

  return (
    <main className="page">
      <h1 className="title">인물</h1>
      {deleted && <p className="notice" role="status">{deleted} 을(를) 지웠다.</p>}

      <section className="section">
        <h2 className="section-title">
          <span>전체 {people?.length ?? 0}명</span>
          <Link className="button is-secondary" href="/admin/people/new">인물 등록</Link>
        </h2>

        {people?.length ? (
          <table className="table">
            <thead><tr><th>식별자</th><th>이름</th><th>생몰</th><th>관계</th><th>자료</th></tr></thead>
            <tbody>
              {people.map((p) => {
                const n = (p.item_person as unknown as { count: number }[])?.[0]?.count ?? 0;
                return (
                  <tr key={p.identifier}>
                    <td className="meta-value"><Link href={`/admin/people/${p.identifier}`}>{p.identifier}</Link></td>
                    <td><Link href={`/admin/people/${p.identifier}`}>{p.display_name}</Link></td>
                    <td className="meta-value">{p.birth_edtf ?? '?'}–{p.death_edtf ?? ''}</td>
                    <td className="meta-value">{p.relation_to_root ?? '관계 미입력'}</td>
                    <td className="meta-value">{n}건</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty">아직 등록한 인물이 없다. 자료의 생산자·등장인물로 고르려면 먼저 등록한다.</p>
        )}
      </section>
    </main>
  );
}
