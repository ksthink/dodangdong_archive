'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { parseTranscript } from '@/lib/transcript';
import { withQuery } from '@/lib/url';

/**
 * 녹취록 저장. 자료 하나에 하나 — 있으면 덮어쓰고, 글을 비우면 지운다.
 * 원문은 적은 그대로 두고, 구간은 저장할 때마다 원문에서 다시 만든다.
 */
export async function saveTranscript(identifier: string, form: FormData) {
  if (!(await getAdmin())) redirect('/login?next=/admin');
  const back = `/admin/items/${identifier}`;

  const supabase = await createClient();
  const { data: item } = await supabase.from('item').select('id').eq('identifier', identifier).maybeSingle();
  if (!item) redirect(withQuery('/admin/items', { error: `${identifier} 자료가 없다.` }));

  const raw = String(form.get('full_text') ?? '').trim();

  if (!raw) {
    const { error } = await supabase.from('transcript').delete().eq('item_id', item.id);
    if (error) throw new Error(`녹취록을 지우지 못했다: ${error.message}`);
  } else {
    const { error } = await supabase.from('transcript').upsert({
      item_id: item.id,
      source: 'manual',
      reviewed: form.get('reviewed') === 'on',
      full_text: raw,
      segments: parseTranscript(raw),
      modified_at: new Date().toISOString(),
    }, { onConflict: 'item_id' });
    if (error) throw new Error(`녹취록을 저장하지 못했다: ${error.message}`);
  }

  revalidatePath(back);
  revalidatePath(`/item/${identifier}`);
  redirect(withQuery(back, { saved: 'transcript' }) + '#transcript');
}
