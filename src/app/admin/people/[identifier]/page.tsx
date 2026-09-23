import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  updatePerson, deletePerson, addLifePeriod, removeLifePeriod, addRelation, removeRelation,
} from '@/lib/people-actions';
import type { FaceCrop } from '@/lib/people-actions';
import FacePicker, { type Candidate } from './face-picker';
import PersonForm from '../person-form';
import DeleteBox from '../../items/[identifier]/delete-box';

export const dynamic = 'force-dynamic';

const KIND = { parent: '부모', spouse: '배우자' } as const;

export default async function EditPersonPage({
  params, searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { identifier } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const { data: person } = await supabase.from('person').select('*').eq('identifier', identifier).maybeSingle();
  if (!person) notFound();

  // 얼굴 후보: 이 사람이 나오거나 만든 자료의 사진 원본(자르기는 원본에서 한다)
  const [{ data: appears }, { data: made }] = await Promise.all([
    supabase.from('item_person').select('item_id').eq('person_id', person.id),
    supabase.from('item').select('id').eq('creator_person_id', person.id),
  ]);
  const itemIds = [...new Set([...(appears ?? []).map((r) => r.item_id), ...(made ?? []).map((r) => r.id)])];
  const { data: photos } = itemIds.length
    ? await supabase.from('file')
        .select('id, item_id, role, mime, derived_from, item(identifier, title)')
        .in('item_id', itemIds).in('role', ['original', 'thumb']).order('created_at')
    : { data: [] };
  // 원본마다 딸린 썸네일을 짝지어 둔다 — 고르는 줄에는 썸네일을 보여 주는 게 가볍다
  const thumbOf = new Map<string, string>();
  for (const f of photos ?? []) if (f.role === 'thumb' && f.derived_from) thumbOf.set(f.derived_from, f.id);
  const candidates: Candidate[] = (photos ?? [])
    .filter((f) => f.role === 'original' && f.mime?.startsWith('image/'))
    .map((f) => {
      const it = (Array.isArray(f.item) ? f.item[0] : f.item) as { identifier: string; title: string } | null;
      return {
        itemId: f.item_id, itemIdentifier: it?.identifier ?? '', itemTitle: it?.title ?? '',
        originalId: f.id, thumbId: thumbOf.get(f.id) ?? null,
      };
    });

  const [{ data: periods }, { data: others }, { data: out }, { data: into }] = await Promise.all([
    supabase.from('life_period').select('*').eq('person_id', person.id).order('sort_order'),
    supabase.from('person').select('id, display_name').neq('id', person.id).order('born_year'),
    // 이 사람에게서 나가는 관계: parent 면 상대가 이 사람의 부모
    supabase.from('person_relation').select('to_person_id, kind, person:to_person_id(display_name)').eq('from_person_id', person.id),
    // 이 사람에게 들어오는 parent: 상대가 이 사람의 자녀
    supabase.from('person_relation').select('from_person_id, kind, person:from_person_id(display_name)')
      .eq('to_person_id', person.id).eq('kind', 'parent'),
  ]);

  const name = (v: unknown) => (Array.isArray(v) ? v[0] : v as { display_name: string } | null)?.display_name ?? '?';

  const save = updatePerson.bind(null, identifier);
  const remove = deletePerson.bind(null, identifier);
  const addPeriod = addLifePeriod.bind(null, identifier, person.id);
  const addRel = addRelation.bind(null, identifier, person.id);

  return (
    <main className="page">
      <p className="meta-value">{identifier}</p>
      <h1 className="title">{person.display_name}</h1>
      {saved && <p className="notice" role="status">저장했다.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <PersonForm action={save} person={person} submitLabel="고친 것 저장" />

      <section className="section">
        <h2 className="section-title">얼굴 사진</h2>
        <p className="help" style={{ marginBottom: 'var(--space-4)' }}>
          사진을 따로 올리지 않는다. 이 사람이 <strong>나오거나 만든 자료</strong>의 사진에서 얼굴 자리를 잘라 쓴다 —
          그래야 얼굴에도 출처가 남고, 원본은 손대지 않으며, 그 자료를 지우면 얼굴도 저절로 떨어진다.
          목록에 없으면 먼저 그 자료의 등장인물에 이 사람을 넣는다.
        </p>
        <FacePicker
          identifier={identifier}
          personId={person.id}
          candidates={candidates}
          currentFileId={person.face_file_id ?? null}
          currentCrop={(person.face_crop as FaceCrop | null) ?? null}
        />
      </section>

      <section className="section">
        <h2 className="section-title">
          <span>인생 시기</span><span className="label-code">dcterms:temporal</span>
        </h2>
        <p className="help" style={{ marginBottom: 'var(--space-4)' }}>
          시기분류의 하위 항목이 되고, 연표에서 이 사람의 띠가 된다. 예: 유년기 · 혼인과 분가 · 자녀 양육기
        </p>
        {periods?.length ? (
          <ul className="filelist">
            {periods.map((p) => (
              <li key={p.id}>
                <span>{p.label} <span className="meta-value">{p.from_edtf ?? '?'}–{p.to_edtf ?? ''}</span></span>
                <form action={removeLifePeriod.bind(null, identifier, p.id)}>
                  <button className="button is-secondary" type="submit">빼기</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addPeriod} className="inline-form">
          <input className="field" name="label" placeholder="시기 이름" required />
          <input className="field is-mono" name="from_edtf" placeholder="1936" />
          <input className="field is-mono" name="to_edtf" placeholder="1955 (비우면 지금까지)" />
          <button className="button is-secondary" type="submit">더하기</button>
        </form>
      </section>

      <section className="section">
        <h2 className="section-title">가족 관계</h2>
        {out?.length || into?.length ? (
          <ul className="filelist">
            {(out ?? []).map((r) => (
              <li key={`o-${r.to_person_id}-${r.kind}`}>
                <span>{name(r.person)} <span className="meta-value">{KIND[r.kind as keyof typeof KIND]}</span></span>
                <form action={removeRelation.bind(null, identifier, person.id, r.to_person_id, r.kind)}>
                  <button className="button is-secondary" type="submit">빼기</button>
                </form>
              </li>
            ))}
            {(into ?? []).map((r) => (
              <li key={`i-${r.from_person_id}`}>
                <span>{name(r.person)} <span className="meta-value">자녀</span></span>
                <form action={removeRelation.bind(null, identifier, r.from_person_id, person.id, 'parent')}>
                  <button className="button is-secondary" type="submit">빼기</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        {others?.length ? (
          <form action={addRel} className="inline-form">
            <select className="field" name="other_id" required>
              {others.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
            </select>
            <span className="body-sm">은(는) 이 사람의</span>
            <select className="field" name="kind">
              <option value="parent">부모</option>
              <option value="child">자녀</option>
              <option value="spouse">배우자</option>
            </select>
            <button className="button is-secondary" type="submit">잇기</button>
          </form>
        ) : (
          <p className="help">다른 인물을 더 등록하면 관계를 이을 수 있다.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">지우기</h2>
        <DeleteBox identifier={identifier} action={remove} />
      </section>

      <p style={{ marginTop: 'var(--space-8)' }}><Link href="/admin/people">← 인물 목록</Link></p>
    </main>
  );
}
