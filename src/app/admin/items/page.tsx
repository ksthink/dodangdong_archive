import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL, ACCESS_LABEL } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ 지움?: string }>;
}) {
  const { 지움 } = await searchParams;
  const supabase = await createClient();
  const { data: items } = await supabase
    .from('item')
    .select('identifier, title, type, access_level, created_edtf, modified_at')
    .order('modified_at', { ascending: false });

  return (
    <main className="page">
      <h1 className="title">자료 목록</h1>

      {지움 && <p className="notice" role="status">{지움} 을(를) 지웠다. 되돌릴 수 없다.</p>}

      <section className="section">
        <h2 className="section-title">
          <span>전체 {items?.length ?? 0}건</span>
          <Link className="button is-secondary" href="/admin/items/new">자료 등록</Link>
        </h2>

        {items?.length ? (
          <table className="table">
            <thead>
              <tr><th>식별자</th><th>제목</th><th>형태</th><th>생산일자</th><th>공개 범위</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.identifier}>
                  <td className="meta-value"><Link href={`/admin/items/${it.identifier}`}>{it.identifier}</Link></td>
                  <td><Link href={`/admin/items/${it.identifier}`}>{it.title}</Link></td>
                  <td className="meta-value">{TYPE_LABEL[it.type] ?? it.type}</td>
                  <td className="meta-value">{it.created_edtf ?? '기록 없음'}</td>
                  <td className="meta-value">
                    <span className={it.access_level === 'public' ? 'badge is-public' : 'badge'}>
                      {ACCESS_LABEL[it.access_level]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">아직 등록한 자료가 없다.</p>
        )}
      </section>
    </main>
  );
}
