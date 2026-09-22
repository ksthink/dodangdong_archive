'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { withQuery } from '@/lib/url';

/**
 * 이야기는 자료가 아니라 자료를 가리키는 "묶음"이다.
 * 원 자료의 메타데이터는 고치지 않고, 큐레이터의 말은 블록의 글·설명글에만 쓴다.
 */
async function requireAdmin() {
  if (!(await getAdmin())) redirect('/login?next=/admin/stories');
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

const KINDS = ['text', 'heading', 'record', 'gallery', 'quote', 'timeline'] as const;

function storyFields(form: FormData) {
  return {
    title: text(form, 'title') ?? '제목 없는 이야기',
    summary: text(form, 'summary'),
    description: text(form, 'description'),
    period_edtf: text(form, 'period_edtf'),
    access_level: form.get('access_level') === 'public' ? 'public' : 'private',
  };
}

export async function createStory(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('collection').insert({ ...storyFields(form), kind: 'story' }).select('id').single();
  if (error) throw new Error(`이야기를 만들지 못했다: ${error.message}`);
  revalidatePath('/admin/stories');
  redirect(`/admin/stories/${data.id}`);
}

export async function updateStory(id: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from('collection').update(storyFields(form)).eq('id', id);
  if (error) throw new Error(`이야기를 고치지 못했다: ${error.message}`);
  revalidatePath(`/admin/stories/${id}`);
  redirect(withQuery(`/admin/stories/${id}`, { saved: '1' }));
}

export async function deleteStory(id: string, title: string, form: FormData) {
  await requireAdmin();
  if (text(form, 'confirm') !== title) {
    redirect(withQuery(`/admin/stories/${id}`, { error: '제목이 맞지 않다.' }));
  }
  const supabase = await createClient();
  // 블록과 블록이 가리키는 자료의 연결은 함께 사라진다. 자료 자체는 남는다.
  const { error } = await supabase.from('collection').delete().eq('id', id);
  if (error) throw new Error(`이야기를 지우지 못했다: ${error.message}`);
  revalidatePath('/admin/stories');
  redirect(withQuery('/admin/stories', { deleted: title }));
}

/** "DA-0001, DA-0003" 처럼 적은 식별자를 자료 id 로 바꾼다. 없는 식별자는 알려 준다. */
async function resolveItems(raw: string | null) {
  const ids = (raw ?? '').split(/[\s,·]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!ids.length) return { found: [] as { id: string; identifier: string }[], missing: [] as string[] };
  const supabase = await createClient();
  const { data } = await supabase.from('item').select('id, identifier').in('identifier', ids);
  const byId = new Map((data ?? []).map((r) => [r.identifier, r]));
  return {
    found: ids.map((i) => byId.get(i)).filter(Boolean) as { id: string; identifier: string }[],
    missing: ids.filter((i) => !byId.has(i)),
  };
}

/** "14:32" 또는 "00:14:32" → 밀리초 */
function timecode(raw: string | null): number | null {
  if (!raw) return null;
  const parts = raw.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
  return secs * 1000;
}

export async function addBlock(storyId: string, form: FormData) {
  await requireAdmin();
  const kind = text(form, 'kind') as (typeof KINDS)[number] | null;
  if (!kind || !KINDS.includes(kind)) return;

  const { found, missing } = await resolveItems(text(form, 'items'));
  if (missing.length) {
    redirect(withQuery(`/admin/stories/${storyId}`, { error: `없는 식별자: ${missing.join(', ')}` }));
  }
  // 구술 인용도 원 자료를 가리켜야 한다 — 출처 없는 인용은 두지 않는다.
  if ((kind === 'record' || kind === 'gallery' || kind === 'quote') && !found.length) {
    redirect(withQuery(`/admin/stories/${storyId}`, { error: '자료·사진 묶음·구술 인용 블록은 자료 식별자가 하나 이상 있어야 한다.' }));
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from('curation_block').select('position').eq('collection_id', storyId)
    .order('position', { ascending: false }).limit(1).maybeSingle();

  const { data: block, error } = await supabase.from('curation_block').insert({
    collection_id: storyId,
    position: (last?.position ?? -1) + 1,
    kind,
    body: text(form, 'body'),
    caption: text(form, 'caption'),
    speaker_id: text(form, 'speaker_id'),
    timecode_ms: timecode(text(form, 'timecode')),
  }).select('id').single();
  if (error) throw new Error(`블록을 더하지 못했다: ${error.message}`);

  if (found.length) {
    await supabase.from('curation_ref').insert(
      found.map((it, i) => ({ block_id: block.id, item_id: it.id, sort_order: i })),
    );
  }
  revalidatePath(`/admin/stories/${storyId}`);
}

/** ↑ ↓ — 이웃 블록과 자리를 바꾼다. */
export async function moveBlock(storyId: string, blockId: string, dir: 'up' | 'down') {
  await requireAdmin();
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from('curation_block').select('id, position').eq('collection_id', storyId).order('position');
  const list = blocks ?? [];
  const i = list.findIndex((b) => b.id === blockId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;

  await supabase.from('curation_block').update({ position: list[j].position }).eq('id', list[i].id);
  await supabase.from('curation_block').update({ position: list[i].position }).eq('id', list[j].id);
  revalidatePath(`/admin/stories/${storyId}`);
}

export async function updateBlock(storyId: string, blockId: string, form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('curation_block').update({
    body: text(form, 'body'),
    caption: text(form, 'caption'),
  }).eq('id', blockId);
  revalidatePath(`/admin/stories/${storyId}`);
}

export async function removeBlock(storyId: string, blockId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from('curation_block').delete().eq('id', blockId);
  revalidatePath(`/admin/stories/${storyId}`);
}
