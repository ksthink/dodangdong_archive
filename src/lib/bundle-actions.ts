'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { withQuery } from '@/lib/url';

/**
 * 묶음은 자료를 담는 그릇이다 — Drive 폴더 하나가 묶음 하나다.
 * 식별자(DC-00N)는 DB 의 채번 함수가 주고, 폴더 id 는 그 묶음에 처음 올릴 때 저절로 붙는다
 * (src/lib/google/drive.ts 의 bundleFolder). 둘 다 사람이 적지 않는다.
 */
async function requireAdmin() {
  if (!(await getAdmin())) redirect('/intro?next=/admin/bundles');
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

const KINDS = ['album', 'roll', 'bundle', 'tape', 'folder', 'single'];

function bundleFields(form: FormData) {
  const kind = String(form.get('kind') ?? '');
  return {
    title: text(form, 'title') ?? '이름 없는 묶음',
    // 출처는 비워 둘 수 없는 칸이다. 모르면 모른다고 적는다 — 지어내지 않는다.
    source: text(form, 'source') ?? '출처 모름',
    kind: KINDS.includes(kind) ? kind : 'folder',
    provenance: text(form, 'provenance'),
    rights: text(form, 'rights'),
    period_edtf: text(form, 'period_edtf'),
    note: text(form, 'note'),
    default_access_level: form.get('default_access_level') === 'public' ? 'public' : 'private',
  };
}

export async function createBundle(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bundle').insert(bundleFields(form)).select('id').single();
  if (error) throw new Error(`묶음을 만들지 못했다: ${error.message}`);
  revalidatePath('/admin/bundles');
  redirect(`/admin/bundles/${data.id}`);
}

export async function updateBundle(id: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from('bundle').update({ ...bundleFields(form), modified_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`묶음을 고치지 못했다: ${error.message}`);
  revalidatePath(`/admin/bundles/${id}`);
  redirect(withQuery(`/admin/bundles/${id}`, { saved: '1' }));
}

export async function deleteBundle(id: string, identifier: string, form: FormData) {
  await requireAdmin();
  if (text(form, 'confirm') !== identifier) {
    redirect(withQuery(`/admin/bundles/${id}`, { error: '식별자가 맞지 않다.' }));
  }
  const supabase = await createClient();

  // 자료가 하나라도 들어 있으면 지우지 않는다 — 자료가 묶음 없이 떠돌게 둘 수 없다.
  const { count } = await supabase
    .from('item').select('*', { count: 'exact', head: true }).eq('bundle_id', id);
  if (count) {
    redirect(withQuery(`/admin/bundles/${id}`, { error: `자료 ${count}건이 들어 있어 지울 수 없다.` }));
  }

  const { error } = await supabase.from('bundle').delete().eq('id', id);
  if (error) throw new Error(`묶음을 지우지 못했다: ${error.message}`);
  // Drive 폴더는 지우지 않는다. 빈 폴더가 남는 편이 낫다 — 바이트를 지우는 일은 손으로 한다.
  revalidatePath('/admin/bundles');
  redirect(withQuery('/admin/bundles', { deleted: identifier }));
}
