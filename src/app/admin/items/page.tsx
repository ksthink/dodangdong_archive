import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TYPE_LABEL, ACCESS_LABEL } from '@/lib/labels';
import { thumbsFor } from '@/lib/thumbs';
import { looseHit } from '@/lib/search';
import Thumb from '@/components/thumb';

export const dynamic = 'force-dynamic';

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; q?: string }>;
}) {
  const params = await searchParams;
  const deleted = params.deleted;
  const q = params.q?.trim().slice(0, 80) ?? '';
  const supabase = await createClient();
  const { data: all } = await supabase
    .from('item')
    .select('id, identifier, title, description, type, access_level, created_edtf, modified_at')
    .order('modified_at', { ascending: false });

  // 띄어쓰기를 따지지 않으므로 DB 의 ilike 로는 거를 수 없다. 받아 온 뒤에 고른다 —
  // 관리 목록은 어차피 전부를 받아 오고, 한 집안의 자료라 수가 적다.
  const items = (all ?? []).filter((it) => looseHit(q, it.title, it.description));

  const thumbs = await thumbsFor(supabase, items.map((i) => i.id));

  return (
    <main className="page">
      <h1 className="title">자료 목록</h1>

      {deleted && <p className="notice" role="status">{deleted} 을(를) 지웠다. 되돌릴 수 없다.</p>}

      <form action="/admin/items" className="searchbar">
        <input className="field" type="search" name="q" defaultValue={q}
          placeholder="제목·설명에서 찾기 — 띄어쓰기는 따지지 않는다" aria-label="자료 찾기" />
        <button className="button" type="submit">찾기</button>
      </form>

      <section className="section">
        <h2 className="section-title">
          <span>{q ? `‘${q}’ ${items.length}건` : `전체 ${items.length}건`}</span>
          <Link className="button is-secondary" href="/admin/items/new">자료 등록</Link>
        </h2>

        {items.length ? (
          <table className="table">
            <thead>
              <tr><th aria-label="썸네일" /><th>식별자</th><th>제목</th><th>형태</th><th>생산일자</th><th>공개 범위</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.identifier}>
                  <td className="table-thumb"><Thumb fileId={thumbs.get(it.id)} type={it.type} alt={it.title} /></td>
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
          <p className="empty">
            {q ? '맞는 자료가 없다. 검색어를 줄여 본다.' : '아직 등록한 자료가 없다.'}
          </p>
        )}
      </section>
    </main>
  );
}
