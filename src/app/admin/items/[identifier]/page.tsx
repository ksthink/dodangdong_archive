import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateItem, deleteItem, detachFile } from '@/lib/actions';
import ItemForm from '../item-form';
import DeleteBox from './delete-box';
import Uploader from './uploader';
import { isConnected } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

export default async function EditItemPage({
  params, searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { identifier } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const { data: item } = await supabase.from('item').select('*').eq('identifier', identifier).maybeSingle();
  if (!item) notFound();

  const [{ data: bundles }, { data: places }, { data: subjects }, { data: chosen }, { data: files }, driveReady,
    { data: people }, { data: depicted }] =
    await Promise.all([
      supabase.from('bundle').select('id, identifier, title').order('identifier'),
      supabase.from('place').select('id, family_name').order('family_name'),
      supabase.from('subject').select('id, label, parent_id').order('sort_order'),
      supabase.from('item_subject').select('subject_id').eq('item_id', item.id),
      supabase.from('file').select('id, original_filename, mime, bytes, width, height, duration_ms, thumbs:file!derived_from(id)')
        .eq('item_id', item.id).eq('role', 'original').order('created_at'),
      isConnected(),
      supabase.from('person').select('id, display_name').order('born_year', { nullsFirst: false }),
      supabase.from('item_person').select('person_id').eq('item_id', item.id).eq('role', 'depicted'),
    ]);

  const save = updateItem.bind(null, identifier);
  const remove = deleteItem.bind(null, identifier);

  return (
    <main className="page">
      <p className="meta-value">{identifier}</p>
      <h1 className="title">{item.title}</h1>

      {saved && <p className="notice" role="status">저장했다.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <ItemForm
        action={save}
        item={item}
        bundles={bundles ?? []} places={places ?? []} subjects={subjects ?? []}
        chosen={chosen?.map((c) => c.subject_id) ?? []}
        people={people ?? []}
        chosenPeople={depicted?.map((d) => d.person_id) ?? []}
        submitLabel="고친 것 저장"
      />

      <section className="section">
        <h2 className="section-title">
          <span>원본</span>
          <span className="meta-value">{files?.length ?? 0}개</span>
        </h2>

        {files?.length ? (
          <ul className="filelist">
            {files.map((f) => {
              const detach = detachFile.bind(null, identifier, f.id);
              const thumb = (f.thumbs as unknown as { id: string }[] | null)?.[0]?.id;
              const isImage = f.mime?.startsWith('image/');
              return (
                <li key={f.id} className={isImage ? 'has-thumb' : ''}>
                  {isImage && (
                    <span className="file-thumb">
                      {thumb
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/media/${thumb}`} alt="" />
                        : <span className="help">썸네일 없음</span>}
                    </span>
                  )}
                  <span>
                    <a href={`/api/media/${f.id}`} target="_blank" rel="noreferrer">
                      {f.original_filename ?? '이름 없음'}
                    </a>
                    <br />
                    <span className="meta-value">
                      {[f.mime, f.bytes ? `${Math.round(f.bytes / 1024 / 1024 * 10) / 10} MB` : null,
                        f.width && f.height ? `${f.width}×${f.height}` : null,
                        f.duration_ms ? `${Math.round(f.duration_ms / 1000)}초` : null,
                        isImage ? (thumb ? '썸네일 있음' : '썸네일 없음') : null]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <form action={detach}>
                    <button className="button is-secondary" type="submit">떼기</button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}

        {driveReady ? (
          <div style={{ marginTop: 'var(--space-4)' }}><Uploader itemId={item.id} /></div>
        ) : (
          <p className="empty">
            <Link href="/admin/drive">Google Drive 를 연결</Link>해야 원본을 올릴 수 있다.
          </p>
        )}
      </section>

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
