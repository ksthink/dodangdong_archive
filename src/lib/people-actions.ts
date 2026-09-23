'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { edtfYear } from '@/lib/edtf';
import { withQuery } from '@/lib/url';

async function requireAdmin() {
  if (!(await getAdmin())) redirect('/login?next=/admin/people');
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

function personFields(form: FormData) {
  const birth = text(form, 'birth_edtf');
  const death = text(form, 'death_edtf');
  const short = text(form, 'short_name');
  const real = text(form, 'real_name');
  return {
    short_name: short,
    real_name: real,
    // 화면에 쓰는 이름: "김순자(할머니)" — 실명과 호칭을 함께. 하나뿐이면 그것만.
    display_name: text(form, 'display_name') ?? (real && short ? `${real}(${short})` : real ?? short ?? '이름 없음'),
    aliases: (text(form, 'aliases') ?? '').split(/[,·]/).map((s) => s.trim()).filter(Boolean),
    birth_edtf: birth,
    death_edtf: death,
    // 정렬·나이 계산용. 불확실성은 원문(birth_edtf)이 진다.
    born_year: edtfYear(birth),
    died_year: edtfYear(death),
    relation_to_root: text(form, 'relation_to_root'),
    note: text(form, 'note'),
    // 첫 화면이 "최근 손댄 인물" 을 이 값으로 고른다. 고칠 때마다 찍는다.
    modified_at: new Date().toISOString(),
  };
}

export async function createPerson(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from('person').insert(personFields(form)).select('identifier').single();
  if (error) throw new Error(`인물을 저장하지 못했다: ${error.message}`);
  revalidatePath('/admin/people');
  redirect(`/admin/people/${data.identifier}`);
}

export async function updatePerson(identifier: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from('person').update(personFields(form)).eq('identifier', identifier);
  if (error) throw new Error(`인물을 고치지 못했다: ${error.message}`);
  revalidatePath(`/admin/people/${identifier}`);
  redirect(withQuery(`/admin/people/${identifier}`, { saved: '1' }));
}

export async function deletePerson(identifier: string, form: FormData) {
  await requireAdmin();
  if (text(form, 'confirm') !== identifier) {
    redirect(withQuery(`/admin/people/${identifier}`, { error: '식별자가 맞지 않다.' }));
  }
  const supabase = await createClient();
  const { error } = await supabase.from('person').delete().eq('identifier', identifier);
  if (error) throw new Error(`인물을 지우지 못했다: ${error.message}`);
  revalidatePath('/admin/people');
  redirect(withQuery('/admin/people', { deleted: identifier }));
}

/** 인생 시기 — 시기분류(dcterms:temporal)의 실체이자 연표 레인의 띠. */
export async function addLifePeriod(identifier: string, personId: string, form: FormData) {
  await requireAdmin();
  const from = text(form, 'from_edtf');
  const to = text(form, 'to_edtf');
  const supabase = await createClient();
  const { count } = await supabase.from('life_period').select('*', { count: 'exact', head: true }).eq('person_id', personId);
  const { error } = await supabase.from('life_period').insert({
    person_id: personId,
    label: text(form, 'label') ?? '이름 없는 시기',
    from_edtf: from, to_edtf: to,
    from_year: edtfYear(from), to_year: edtfYear(to),
    sort_order: count ?? 0,
  });
  if (error) throw new Error(`시기를 더하지 못했다: ${error.message}`);
  revalidatePath(`/admin/people/${identifier}`);
}

export async function removeLifePeriod(identifier: string, periodId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('life_period').delete().eq('id', periodId);
  revalidatePath(`/admin/people/${identifier}`);
}

/**
 * 관계. kind 는 to 가 from 에게 무엇인지를 말한다 — parent 면 to 가 from 의 부모.
 * 배우자는 방향이 없으므로 양쪽 모두 넣는다.
 */
export async function addRelation(identifier: string, personId: string, form: FormData) {
  await requireAdmin();
  const other = text(form, 'other_id');
  const kind = text(form, 'kind');
  if (!other || other === personId) return;

  const supabase = await createClient();
  const rows =
    kind === 'spouse'
      ? [{ from_person_id: personId, to_person_id: other, kind: 'spouse' },
         { from_person_id: other, to_person_id: personId, kind: 'spouse' }]
      : kind === 'child'
        ? [{ from_person_id: other, to_person_id: personId, kind: 'parent' }]
        : [{ from_person_id: personId, to_person_id: other, kind: 'parent' }];

  const { error } = await supabase.from('person_relation').upsert(rows, { ignoreDuplicates: true });
  if (error) throw new Error(`관계를 잇지 못했다: ${error.message}`);
  revalidatePath(`/admin/people/${identifier}`);
}

export async function removeRelation(identifier: string, from: string, to: string, kind: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('person_relation').delete().match({ from_person_id: from, to_person_id: to, kind });
  if (kind === 'spouse') {
    await supabase.from('person_relation').delete().match({ from_person_id: to, to_person_id: from, kind });
  }
  revalidatePath(`/admin/people/${identifier}`);
}

/**
 * 얼굴 사진을 정한다 — 이 사람과 이어진 자료(나오거나 만든)의 썸네일 가운데 하나.
 *
 * 사진을 따로 올리지 않고 아카이브에 이미 있는 것을 가리킨다. 그래야 얼굴에도
 * 출처가 남고, 자료를 지우면 얼굴도 저절로 떨어진다(face_file_id 는 on delete set null).
 */
export async function setFace(identifier: string, personId: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const fileId = text(form, 'file_id');

  if (fileId) {
    const { data: file } = await supabase.from('file').select('id, item_id, mime').eq('id', fileId).maybeSingle();
    if (!file || !file.mime?.startsWith('image/')) {
      redirect(withQuery(`/admin/people/${identifier}`, { error: '사진이 아니다.' }));
    }
    // 이 사람과 이어진 자료의 사진만 받는다 — 아무 파일이나 얼굴로 붙지 않게.
    const [{ count: appears }, { count: made }] = await Promise.all([
      supabase.from('item_person').select('*', { count: 'exact', head: true })
        .eq('item_id', file.item_id).eq('person_id', personId),
      supabase.from('item').select('*', { count: 'exact', head: true })
        .eq('id', file.item_id).eq('creator_person_id', personId),
    ]);
    if (!appears && !made) {
      redirect(withQuery(`/admin/people/${identifier}`, { error: '이 사람과 이어진 자료의 사진이 아니다.' }));
    }
  }

  const { error } = await supabase
    .from('person')
    .update({ face_file_id: fileId, modified_at: new Date().toISOString() })
    .eq('identifier', identifier);
  if (error) throw new Error(`얼굴 사진을 저장하지 못했다: ${error.message}`);

  revalidatePath(`/admin/people/${identifier}`);
  revalidatePath(`/people/${identifier}`);
  revalidatePath('/people');
  revalidatePath('/');
  redirect(withQuery(`/admin/people/${identifier}`, { saved: 'face' }));
}
