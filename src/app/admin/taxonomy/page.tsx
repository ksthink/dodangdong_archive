import { createClient } from '@/lib/supabase/server';
import {
  createSubject, updateSubject, deleteSubject,
  createPlace, updatePlace, deletePlace,
} from '@/lib/taxonomy-actions';

export const dynamic = 'force-dynamic';

type Params = { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> };

export default async function TaxonomyPage({ searchParams }: Params) {
  const { saved, deleted, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: subjects }, { data: places }, { data: used }, { data: placed }] = await Promise.all([
    supabase.from('subject').select('id, label, parent_id, note').order('sort_order'),
    supabase.from('place').select('id, family_name, admin_name, note').order('family_name'),
    supabase.from('item_subject').select('subject_id'),
    supabase.from('item').select('place_id'),
  ]);

  const subjectCount = new Map<string, number>();
  for (const row of used ?? []) subjectCount.set(row.subject_id, (subjectCount.get(row.subject_id) ?? 0) + 1);
  const placeCount = new Map<string, number>();
  for (const row of placed ?? []) {
    if (row.place_id) placeCount.set(row.place_id, (placeCount.get(row.place_id) ?? 0) + 1);
  }

  const tops = (subjects ?? []).filter((s) => !s.parent_id);
  const childrenOf = (id: string) => (subjects ?? []).filter((s) => s.parent_id === id);

  return (
    <main className="page">
      <h1 className="title">분류</h1>
      <p className="measure body-sm" style={{ marginTop: 'var(--space-4)' }}>
        자료에 붙일 말을 미리 정해 두는 곳이다. 주제는 한 자료에 여럿 붙고 두 층까지 둘 수 있다.
        장소는 자료 하나에 한 곳이고, 집안에서 부르던 이름으로 적는다.
      </p>
      {saved && <p className="notice" role="status">「{saved}」 을(를) 저장했다.</p>}
      {deleted && <p className="notice" role="status">「{deleted}」 을(를) 지웠다.</p>}
      {error && <p className="notice is-danger" role="alert">{error}</p>}

      <section className="section">
        <h2 className="section-title">
          <span>주제</span><span className="label-code">dc:subject</span>
        </h2>

        <form action={createSubject} className="inline-form">
          <input className="field" name="label" placeholder="새 주제 — 예: 제사" required />
          <select className="field" name="parent_id" defaultValue="">
            <option value="">큰 주제로 만든다</option>
            {tops.map((t) => <option key={t.id} value={t.id}>{t.label} 아래에</option>)}
          </select>
          <button className="button" type="submit">더하기</button>
        </form>

        <ul className="taxo">
          {tops.map((top) => (
            <li key={top.id}>
              <SubjectRow id={top.id} label={top.label} note={top.note} n={subjectCount.get(top.id) ?? 0} />
              {childrenOf(top.id).length > 0 && (
                <ul className="taxo is-nested">
                  {childrenOf(top.id).map((c) => (
                    <li key={c.id}>
                      <SubjectRow id={c.id} label={c.label} note={c.note} n={subjectCount.get(c.id) ?? 0} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title">
          <span>장소</span><span className="label-code">dcterms:spatial</span>
        </h2>

        <form action={createPlace} className="inline-form">
          <input className="field" name="family_name" placeholder="집안에서 부르던 이름 — 예: 뒷집" required />
          <input className="field" name="admin_name" placeholder="행정주소 — 예: 경기 부천시 원미구 도당동" />
          <button className="button" type="submit">더하기</button>
        </form>

        <ul className="taxo">
          {(places ?? []).map((p) => {
            const n = placeCount.get(p.id) ?? 0;
            const save = updatePlace.bind(null, p.id);
            const remove = deletePlace.bind(null, p.id, p.family_name);
            return (
              <li key={p.id}>
                <form action={save} className="taxo-row has-address">
                  <input className="field" name="family_name" defaultValue={p.family_name} aria-label="집안 이름" />
                  <input className="field" name="admin_name" defaultValue={p.admin_name ?? ''}
                    aria-label="행정주소" placeholder="행정주소" />
                  <input className="field" name="note" defaultValue={p.note ?? ''}
                    aria-label="메모" placeholder="메모" />
                  <span className="meta-value taxo-count">{n}건</span>
                  <button className="taxo-button" type="submit">저장</button>
                  <button className="taxo-button is-danger" type="submit" formAction={remove}
                    disabled={n > 0} title={n > 0 ? '붙은 자료가 있어 지울 수 없다' : undefined}>지우기</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

/** 주제 한 줄 — 이름과 메모를 고치고, 붙은 자료가 없을 때만 지운다. */
function SubjectRow({ id, label, note, n }: { id: string; label: string; note: string | null; n: number }) {
  const save = updateSubject.bind(null, id);
  const remove = deleteSubject.bind(null, id, label);
  return (
    <form action={save} className="taxo-row">
      <input className="field" name="label" defaultValue={label} aria-label="주제 이름" />
      <input className="field" name="note" defaultValue={note ?? ''} aria-label="메모" placeholder="메모" />
      <span className="meta-value taxo-count">{n}건</span>
      <button className="taxo-button" type="submit">저장</button>
      <button className="taxo-button is-danger" type="submit" formAction={remove}
        disabled={n > 0} title={n > 0 ? '붙은 자료가 있어 지울 수 없다' : undefined}>지우기</button>
    </form>
  );
}
