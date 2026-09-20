import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateItem, deleteItem } from '@/lib/actions';
import ItemForm from '../item-form';
import DeleteBox from './delete-box';

export const dynamic = 'force-dynamic';

export default async function EditItemPage({
  params, searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ 저장됨?: string; 오류?: string }>;
}) {
  const { identifier } = await params;
  const { 저장됨, 오류 } = await searchParams;
  const supabase = await createClient();

  const { data: item } = await supabase.from('item').select('*').eq('identifier', identifier).maybeSingle();
  if (!item) notFound();

  const [{ data: bundles }, { data: places }, { data: subjects }, { data: chosen }] = await Promise.all([
    supabase.from('bundle').select('id, identifier, title').order('identifier'),
    supabase.from('place').select('id, family_name').order('family_name'),
    supabase.from('subject').select('id, label').is('parent_id', null).order('sort_order'),
    supabase.from('item_subject').select('subject_id').eq('item_id', item.id),
  ]);

  const save = updateItem.bind(null, identifier);
  const remove = deleteItem.bind(null, identifier);

  return (
    <main className="page">
      <p className="meta-value">{identifier}</p>
      <h1 className="title">{item.title}</h1>

      {저장됨 && <p className="notice" role="status">저장했다.</p>}
      {오류 && <p className="notice" role="alert">{오류}</p>}

      <ItemForm
        action={save}
        item={item}
        bundles={bundles ?? []} places={places ?? []} subjects={subjects ?? []}
        chosen={chosen?.map((c) => c.subject_id) ?? []}
        submitLabel="고친 것 저장"
      />

      <section className="section">
        <h2 className="section-title">지우기</h2>
        <DeleteBox identifier={identifier} action={remove} />
      </section>

      <p style={{ marginTop: 'var(--space-8)' }}>
        <Link href="/admin/items">← 자료 목록</Link>
      </p>
    </main>
  );
}
