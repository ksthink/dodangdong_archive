import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 자료마다 목록에 쓸 썸네일 하나(첫 원본의 썸네일)를 찾는다.
 * 손님에게는 RLS 가 공개 자료의 파일만 주므로 따로 거르지 않는다.
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
