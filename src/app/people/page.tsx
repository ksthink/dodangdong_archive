import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import FamilyTree from '@/components/family-tree';
import { layoutFamily, type TreeRelation } from '@/lib/family-tree';

export const dynamic = 'force-dynamic';
export const metadata = { title: '인물 · 도당동 아카이브' };

type Person = {
  id: string; identifier: string; display_name: string; short_name: string | null; real_name: string | null;
  birth_edtf: string | null; death_edtf: string | null; born_year: number | null; relation_to_root: string | null;
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'tree' ? 'tree' : 'list';
  const supabase = await createClient();
  // 손님에게는 공개 자료에 한 번이라도 나오는 사람만 온다(RLS).
  const { data: people } = await supabase
    .from('person')
    .select('id, identifier, display_name, short_name, real_name, birth_edtf, death_edtf, born_year, relation_to_root')
    .order('born_year', { ascending: true, nullsFirst: false });

  const ids = (people ?? []).map((p) => p.id);
  const [{ data: made }, { data: appears }, { data: relations }] = await Promise.all([
    supabase.from('item').select('creator_person_id').in('creator_person_id', ids.length ? ids : ['-']),
    supabase.from('item_person').select('person_id').in('person_id', ids.length ? ids : ['-']),
    // 손님에게는 양쪽 사람이 모두 보이는 관계만 온다(RLS) — 숨은 사람은 가계도에서 조용히 빠진다.
    view === 'tree'
      ? supabase.from('person_relation').select('from_person_id, to_person_id, kind')
      : Promise.resolve({ data: [] as TreeRelation[] }),
  ]);
  const tally = (rows: { [k: string]: string | null }[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r[key]) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const madeBy = tally(made, 'creator_person_id');
  const appearsIn = tally(appears, 'person_id');
  const layout = view === 'tree' ? layoutFamily((people ?? []) as Person[], (relations ?? []) as TreeRelation[]) : null;

  const card = (p: Person) => (
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
  );

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="title">인물</h1>
        <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
          자료를 만들었거나 자료에 나오는 사람들이다. 호칭은 아카이브를 만드는 사람을 기준으로 쓴다.
        </p>

        <nav className="view-switch" aria-label="보기">
          <Link href="/people" className={view === 'list' ? 'is-on' : ''} aria-current={view === 'list' ? 'page' : undefined}>목록</Link>
          <Link href="/people?view=tree" className={view === 'tree' ? 'is-on' : ''} aria-current={view === 'tree' ? 'page' : undefined}>가계도</Link>
        </nav>

        {!people?.length ? (
          <section className="section"><p className="empty">아직 공개된 자료에 나오는 사람이 없다.</p></section>
        ) : view === 'list' ? (
          <section className="section">
            <ul className="person-grid">{(people as Person[]).map(card)}</ul>
          </section>
        ) : (
          <>
            <section className="section">
              <h2 className="section-title"><span>가계도</span><span className="meta-value">{layout!.nodes.length}명</span></h2>
              {layout!.nodes.length ? (
                <>
                  <p className="help">위가 윗세대다. 나란히 이은 두 칸은 부부, 아래로 내린 선은 자녀. 굵은 칸이 &ldquo;나&rdquo;다. 칸을 누르면 그 사람에게 간다.</p>
                  <FamilyTree layout={layout!} />
                </>
              ) : (
                <p className="empty">부모·배우자 관계가 아직 없어 가계도를 그릴 수 없다.</p>
              )}
            </section>
            {layout!.outsiders.length > 0 && (
              <section className="section">
                <h2 className="section-title"><span>가계도 밖의 인물</span><span className="meta-value">{layout!.outsiders.length}명</span></h2>
                <p className="help" style={{ marginBottom: 'var(--space-4)' }}>부모·배우자 관계로 &ldquo;나&rdquo;와 이어지지 않은 사람 — 측근, 지인 등.</p>
                <ul className="person-grid">{layout!.outsiders.map(card)}</ul>
              </section>
            )}
          </>
        )}

        <SiteFooter />
      </main>
    </>
  );
}
