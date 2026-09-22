'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { withQuery } from '@/lib/url';

const AUTO = ['story', 'today', 'recent'] as const;

/**
 * 자리 하나의 편성. 이야기를 걸거나(collection_id) 자동 종류를 고른다(auto_kind) — 둘 중 하나만.
 * 기간은 비우면 열어 둔다. 기간이 지나면 그 자리는 자동으로 채워진다.
 */
export async function updateHeroSlot(slot: number, form: FormData) {
  if (!(await getAdmin())) redirect('/login?next=/admin/hero');
  const back = '/admin/hero';

  const pick = String(form.get('pick') ?? '');
  const date = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const starts_on = date('starts_on');
  const ends_on = date('ends_on');
  if (starts_on && ends_on && ends_on < starts_on) {
    redirect(withQuery(back, { error: `자리 ${slot}: 끝나는 날이 시작하는 날보다 앞이다.` }));
  }

  let row: { collection_id: string | null; auto_kind: string | null };
  if (pick.startsWith('auto:') && AUTO.includes(pick.slice(5) as (typeof AUTO)[number])) {
    row = { collection_id: null, auto_kind: pick.slice(5) };
  } else if (pick.startsWith('story:')) {
    row = { collection_id: pick.slice(6), auto_kind: null };
  } else {
    redirect(withQuery(back, { error: `자리 ${slot}: 무엇을 걸지 고르지 않았다.` }));
  }

  const supabase = await createClient();
  const { error } = await supabase.from('hero_slot').update({
    ...row, starts_on, ends_on,
    note: String(form.get('note') ?? '').trim() || null,
    modified_at: new Date().toISOString(),
  }).eq('slot', slot);
  if (error) throw new Error(`편성을 저장하지 못했다: ${error.message}`);

  revalidatePath('/');
  revalidatePath(back);
  redirect(withQuery(back, { saved: String(slot) }));
}
