import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 자료마다 목록에 쓸 썸네일 하나(첫 원본의 썸네일)를 찾는다.
 * 건네받은 자료 id 에 대해서만 찾는다 — 무엇을 보여 줄지는 부르는 쪽이 정한다.
 */
export async function thumbsFor(supabase: SupabaseClient, itemIds: string[]) {
  const map = new Map<string, string>();
  if (!itemIds.length) return map;
  const { data } = await supabase
    .from('file')
    .select('id, item_id')
    .eq('role', 'thumb')
    .in('item_id', itemIds)
    .order('created_at');
  for (const f of data ?? []) if (!map.has(f.item_id)) map.set(f.item_id, f.id);
  return map;
}
