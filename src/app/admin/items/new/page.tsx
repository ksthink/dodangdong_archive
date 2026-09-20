import { createClient } from '@/lib/supabase/server';
import { createItem } from '@/lib/actions';
import ItemForm from '../item-form';

export const dynamic = 'force-dynamic';

export default async function NewItemPage() {
  const supabase = await createClient();
  const [{ data: bundles }, { data: places }, { data: subjects }] = await Promise.all([
    supabase.from('bundle').select('id, identifier, title').order('identifier'),
    supabase.from('place').select('id, family_name').order('family_name'),
    supabase.from('subject').select('id, label').is('parent_id', null).order('sort_order'),
  ]);

  return (
    <main className="page">
      <h1 className="title">자료 등록</h1>
      <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
        식별자는 저장할 때 DA- 로 자동으로 붙는다. 모르는 것은 비워 두고, 지어내지 않는다.
      </p>

      {bundles?.length ? (
        <ItemForm
          action={createItem}
          bundles={bundles} places={places ?? []} subjects={subjects ?? []}
          submitLabel="저장"
        />
      ) : (
        <p className="empty">먼저 묶음을 하나 만들어야 자료를 넣을 수 있다.</p>
      )}
    </main>
  );
}
