'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { withQuery } from '@/lib/url';

/**
 * 분류 — 자료에 붙일 말을 미리 정해 두는 곳. 주제와 장소를 한 화면에서 손본다.
 *
 * 둘은 표가 다르다. 주제는 자료에 **여럿** 붙고(item_subject) 부모–자식 위계가 있다.
 * 장소는 자료당 **하나**이고(item.place_id) 위계 없이 행정주소를 따로 적는다.
 * 그래서 표를 합치지 않고 화면만 합친다.
 *
 * 주제의 위계는 **두 층까지**다. 자료 등록 화면이 두 층만 그리기 때문이다
 * (src/app/admin/items/item-form.tsx). 더 깊게 넣으려 하면 여기서 막는다.
 */
async function requireAdmin() {
  if (!(await getAdmin())) redirect('/intro?next=/admin/taxonomy');
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

/**
 * 돌아가며 알림을 남긴다. 화살표가 아니라 함수 선언이라야 타입 검사기가
 * "여기서 끝난다(never)" 로 읽어, 아래의 널 검사가 그다음 줄까지 좁혀진다.
 */
function back(extra: Record<string, string>): never {
  redirect(withQuery('/admin/taxonomy', extra));
}

/* ── 주제 ───────────────────────────────────────────────── */

export async function createSubject(form: FormData) {
  await requireAdmin();
  const label = text(form, 'label');
  if (!label) back({ error: '주제 이름을 적어야 한다.' });
  const parentId = text(form, 'parent_id');

  const supabase = await createClient();

  // 두 층까지다 — 고른 부모가 이미 누군가의 자식이면 그 아래로 더 넣지 않는다.
  if (parentId) {
    const { data: parent } = await supabase
      .from('subject').select('parent_id').eq('id', parentId).maybeSingle();
    if (!parent) back({ error: '큰 주제를 찾지 못했다.' });
    if (parent.parent_id) back({ error: '주제는 두 층까지다. 하위 주제 아래에 또 두지 않는다.' });
  }

  // 같은 자리(같은 부모 아래)에서 맨 뒤에 붙인다.
  let siblingQuery = supabase.from('subject').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1);
  siblingQuery = parentId ? siblingQuery.eq('parent_id', parentId) : siblingQuery.is('parent_id', null);
  const { data: siblings } = await siblingQuery;
  const next = (siblings?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from('subject').insert({
    label, parent_id: parentId, sort_order: next, note: text(form, 'note'),
  });
  if (error) throw new Error(`주제를 만들지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ saved: label });
}

export async function updateSubject(id: string, form: FormData) {
  await requireAdmin();
  const label = text(form, 'label');
  if (!label) back({ error: '주제 이름을 적어야 한다.' });
  const supabase = await createClient();
  const { error } = await supabase.from('subject')
    .update({ label, note: text(form, 'note') }).eq('id', id);
  if (error) throw new Error(`주제를 고치지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ saved: label });
}

export async function deleteSubject(id: string, label: string) {
  await requireAdmin();
  const supabase = await createClient();

  // 붙어 있는 자료나 하위 주제가 있으면 지우지 않는다 — 말없이 떨어져 나가면 안 된다.
  const [{ count: used }, { count: children }] = await Promise.all([
    supabase.from('item_subject').select('*', { count: 'exact', head: true }).eq('subject_id', id),
    supabase.from('subject').select('*', { count: 'exact', head: true }).eq('parent_id', id),
  ]);
  if (used) back({ error: `「${label}」 은 자료 ${used}건에 붙어 있어 지울 수 없다.` });
  if (children) back({ error: `「${label}」 아래에 하위 주제 ${children}개가 있다.` });

  const { error } = await supabase.from('subject').delete().eq('id', id);
  if (error) throw new Error(`주제를 지우지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ deleted: label });
}

/* ── 장소 ───────────────────────────────────────────────── */

export async function createPlace(form: FormData) {
  await requireAdmin();
  const name = text(form, 'family_name');
  if (!name) back({ error: '집안에서 부르던 이름을 적어야 한다.' });
  const supabase = await createClient();
  const { error } = await supabase.from('place').insert({
    family_name: name, admin_name: text(form, 'admin_name'), note: text(form, 'note'),
  });
  if (error) throw new Error(`장소를 만들지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ saved: name });
}

export async function updatePlace(id: string, form: FormData) {
  await requireAdmin();
  const name = text(form, 'family_name');
  if (!name) back({ error: '집안에서 부르던 이름을 적어야 한다.' });
  const supabase = await createClient();
  const { error } = await supabase.from('place')
    .update({ family_name: name, admin_name: text(form, 'admin_name'), note: text(form, 'note') })
    .eq('id', id);
  if (error) throw new Error(`장소를 고치지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ saved: name });
}

export async function deletePlace(id: string, name: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { count } = await supabase
    .from('item').select('*', { count: 'exact', head: true }).eq('place_id', id);
  if (count) back({ error: `「${name}」 은 자료 ${count}건에 붙어 있어 지울 수 없다.` });

  const { error } = await supabase.from('place').delete().eq('id', id);
  if (error) throw new Error(`장소를 지우지 못했다: ${error.message}`);
  revalidatePath('/admin/taxonomy');
  back({ deleted: name });
}
