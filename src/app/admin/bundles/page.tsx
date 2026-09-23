import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createBundle } from '@/lib/bundle-actions';
import { ACCESS_LABEL } from '@/lib/labels';
import { BUNDLE_KIND_LABEL } from './kinds';

export const dynamic = 'force-dynamic';

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const { data: bundles, error } = await supabase
    .from('bundle')
    .select('id, identifier, title, kind, source, default_access_level, drive_folder_id, item(count)')
    .order('identifier');
  if (error) throw new Error(`묶음 목록을 읽지 못했다: ${error.message}`);

  return (
    <main className="page">
      <h1 className="title">묶음</h1>
      <p className="measure body-sm" style={{ marginTop: 'var(--space-4)' }}>
        묶음은 자료를 담는 그릇이다 — 앨범 한 권, 필름 한 통, 편지 한 다발. 자료는 반드시 묶음 하나에 든다.
        Drive 폴더도 묶음마다 하나씩이고, 그 묶음에 처음 올릴 때 저절로 만들어진다.
      </p>
      {deleted && <p className="notice" role="status">{deleted} 을(를) 지웠다.</p>}

      <section className="section">
        <h2 className="section-title">새 묶음</h2>
        <form action={createBundle} className="inline-form">
          <input className="field" name="title" placeholder="묶음 이름 — 예: 안방 장롱 앨범" required />
          <input className="field" name="source" placeholder="출처 — 예: 어머니 보관" />
          <button className="button" type="submit">만들기</button>
        </form>
        <p className="help" style={{ marginTop: 'var(--space-2)' }}>
          식별자는 저장할 때 DC- 로 자동으로 붙는다. 갈래와 나머지는 만든 뒤에 고친다.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">전체 {bundles?.length ?? 0}개</h2>
        {bundles?.length ? (
          <table className="table">
            <thead><tr><th>식별자</th><th>이름</th><th>갈래</th><th>자료</th><th>Drive</th><th>기본 공개 범위</th></tr></thead>
            <tbody>
              {bundles.map((b) => (
                <tr key={b.id}>
                  <td className="meta-value">{b.identifier}</td>
                  <td><Link href={`/admin/bundles/${b.id}`}>{b.title}</Link></td>
                  <td className="meta-value">{BUNDLE_KIND_LABEL[b.kind] ?? b.kind}</td>
                  <td className="meta-value">{(b.item as unknown as { count: number }[])?.[0]?.count ?? 0}건</td>
                  <td className="meta-value">{b.drive_folder_id ? '있음' : '아직'}</td>
                  <td>
                    <span className={b.default_access_level === 'public' ? 'badge is-public' : 'badge'}>
                      {ACCESS_LABEL[b.default_access_level]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">아직 묶음이 없다. 하나 만들어야 자료를 넣을 수 있다.</p>
        )}
      </section>
    </main>
  );
}
