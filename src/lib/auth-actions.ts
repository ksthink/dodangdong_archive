'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * 나가기. 자기 세션을 지우는 일이라 관리자인지 따로 묻지 않는다.
 * 나간 뒤에는 문(인트로)으로 보낸다 — 어차피 다른 화면은 열리지 않는다.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/intro');
}
