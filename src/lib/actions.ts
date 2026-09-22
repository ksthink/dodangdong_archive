'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { parseEdtf } from '@/lib/edtf';
import { withQuery } from '@/lib/url';
import { deleteFile } from '@/lib/google/drive';

/** 쓰기는 관리자만. RLS 가 다시 한 번 막지만, 여기서 먼저 끊는다. */
async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect('/login?next=/admin');
  return admin;
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

function itemFields(form: FormData) {
  const edtf = text(form, 'created_edtf');
  const d = parseEdtf(edtf);

  return {
    title: text(form, 'title') ?? '제목 없음',
    bundle_id: text(form, 'bundle_id'),
    type: text(form, 'type') ?? 'StillImage',
    doc_type: text(form, 'doc_type'),
    description: text(form, 'description'),
    creator: text(form, 'creator'),
    creator_person_id: text(form, 'creator_person_id'),
    contributor: text(form, 'contributor'),
    publisher: text(form, 'publisher'),
    created_edtf: edtf,
    created_start: d.start,
    created_end: d.end,
    created_precision: d.precision,
    created_uncertain: d.uncertain,
    created_approx: d.approx,
    date_verified: form.get('date_verified') === 'on',
    place_id: text(form, 'place_id'),
    language: text(form, 'language'),
    medium: text(form, 'medium'),
    extent: text(form, 'extent'),
    source: text(form, 'source'),
    provenance: text(form, 'provenance'),
    rights: text(form, 'rights'),
    access_level: form.get('access_level') === 'public' ? 'public' : 'private',
    tags: (text(form, 'tags') ?? '').split(/[,·]/).map((s) => s.trim()).filter(Boolean),
  };
}

/** 등장인물(dc:subject). 등록된 인물만 — 기관이나 모르는 사람은 설명에 쓴다. */
async function setPeople(itemId: string, form: FormData) {
  const supabase = await createClient();
  const ids = form.getAll('person_id').map(String).filter(Boolean);
  await supabase.from('item_person').delete().eq('item_id', itemId).eq('role', 'depicted');
  if (ids.length) {
    await supabase.from('item_person').insert(ids.map((person_id) => ({ item_id: itemId, person_id, role: 'depicted' })));
  }
}

async function setSubjects(itemId: string, form: FormData) {
  const supabase = await createClient();
  const ids = form.getAll('subject_id').map(String).filter(Boolean);
  await supabase.from('item_subject').delete().eq('item_id', itemId);
  if (ids.length) {
    await supabase.from('item_subject').insert(ids.map((subject_id) => ({ item_id: itemId, subject_id })));
  }
}

export async function createItem(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.from('item').insert(itemFields(form)).select('id, identifier').single();
  if (error) throw new Error(`자료를 저장하지 못했다: ${error.message}`);

  await setSubjects(data.id, form);
  await setPeople(data.id, form);
  await supabase.from('event_log').insert({ item_id: data.id, action: 'create' });

  revalidatePath('/admin/items');
  redirect(`/admin/items/${data.identifier}`);
}

export async function updateItem(identifier: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('item').update(itemFields(form)).eq('identifier', identifier).select('id').single();
  if (error) throw new Error(`자료를 고치지 못했다: ${error.message}`);

  await setSubjects(data.id, form);
  await setPeople(data.id, form);
  await supabase.from('event_log').insert({ item_id: data.id, action: 'update' });

  revalidatePath('/admin/items');
  revalidatePath(`/admin/items/${identifier}`);
  redirect(withQuery(`/admin/items/${identifier}`, { saved: '1' }));
}

/**
 * 삭제는 되돌릴 수 없다. 식별자를 정확히 다시 써야 지워진다.
 * 원본 파일도 함께 지운다 — file 행은 자료에 딸려 cascade 로 사라지고,
 * Drive 원본은 연결한 뒤 여기에서 함께 지운다.
 */
export async function deleteItem(identifier: string, form: FormData) {
  await requireAdmin();
  if (text(form, 'confirm') !== identifier) {
    redirect(withQuery(`/admin/items/${identifier}`, { error: '식별자가 맞지 않다.' }));
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from('item').select('*').eq('identifier', identifier).single();

  // 표에서 지우면 file 행은 함께 사라지므로, Drive 파일 id 를 먼저 받아 둔다.
  const { data: files } = await supabase
    .from('file').select('storage_path, provider').eq('item_id', before?.id ?? '');

  const { error } = await supabase.from('item').delete().eq('identifier', identifier);
  if (error) throw new Error(`자료를 지우지 못했다: ${error.message}`);

  // 원본도 남겨 두지 않는다. 한 파일이 실패해도 나머지는 마저 지운다.
  for (const f of files ?? []) {
    if (f.provider === 'gdrive') await deleteFile(f.storage_path).catch(() => {});
  }

  await supabase.from('event_log').insert({ action: 'delete', before });

  revalidatePath('/admin/items');
  redirect(withQuery('/admin/items', { deleted: identifier }));
}

/** 자료에서 원본 하나를 뗀다. Drive 의 파일도 함께 지운다. */
export async function detachFile(identifier: string, fileId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: file } = await supabase
    .from('file').select('storage_path, provider, item_id').eq('id', fileId).single();
  if (!file) return;

  // 이 원본에서 만든 썸네일. 행은 derived_from 으로 함께 지워지지만 Drive 파일은 직접 지운다.
  const { data: derived } = await supabase
    .from('file').select('storage_path, provider').eq('derived_from', fileId);

  const { error } = await supabase.from('file').delete().eq('id', fileId);
  if (error) throw new Error(`원본을 떼지 못했다: ${error.message}`);
  for (const f of [file, ...(derived ?? [])]) {
    if (f.provider === 'gdrive') await deleteFile(f.storage_path).catch(() => {});
  }

  await supabase.from('event_log').insert({ item_id: file.item_id, action: 'file.remove' });
  revalidatePath(`/admin/items/${identifier}`);
}
