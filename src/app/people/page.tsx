import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const dynamic = 'force-dynamic';
export const metadata = { title: '인물 · 도당동 아카이브' };

export default async function PeoplePage() {
  const supabase = await createClient();
  // 손님에게는 공개 자료에 한 번이라도 나오는 사람만 온다(RLS).
  const { data: people } = await supabase
    .from('person')
    .select('id, identifier, display_name, short_name, real_name, birth_edtf, death_edtf, relation_to_root')
    .order('born_year', { ascending: true, nullsFirst: false });

  const ids = (people ?? []).map((p) => p.id);
  const [{ data: made }, { data: appears }] = await Promise.all([
    supabase.from('item').select('creator_person_id').in('creator_person_id', ids.length ? ids : ['-']),
    supabase.from('item_person').select('person_id').in('person_id', ids.length ? ids : ['-']),
  ]);
  const tally = (rows: { [k: string]: string | null }[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r[key]) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const madeBy = tally(made, 'creator_person_id');
  const appearsIn = tally(appears, 'person_id');

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="title">인물</h1>
        <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
          자료를 만들었거나 자료에 나오는 사람들이다. 호칭은 아카이브를 만드는 사람을 기준으로 쓴다.
        </p>

        <section className="section">
          {people?.length ? (
            <ul className="person-grid">
              {people.map((p) => (
                <li key={p.id} className="card">
                  <Link href={`/people/${p.identifier}`} className="person-card">
                    {/* 얼굴 사진이 없으면 디더 면에 호칭 첫 글자 */}
                    <div className="face"><span>{(p.short_name ?? p.display_name).slice(0, 1)}</span></div>
                    <div>
                      <p className="heading">{p.short_name ?? p.display_name}</p>
                      {p.real_name && p.real_name !== p.short_name && <p className="body-sm">{p.real_name}</p>}
                      <p className="meta-value">{p.birth_edtf ?? '?'}–{p.death_edtf ?? ''}</p>
                      <p className="meta-value">{p.relation_to_root ?? '관계 미입력'}</p>
                      <p className="meta-value">
                        만든 자료 {madeBy.get(p.id) ?? 0} · 나오는 자료 {appearsIn.get(p.id) ?? 0}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">아직 공개된 자료에 나오는 사람이 없다.</p>
          )}
        </section>

        <SiteFooter />
      </main>
    </>
  );
}
