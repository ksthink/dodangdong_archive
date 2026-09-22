import { createClient } from '@supabase/supabase-js';
import { supabaseKey, supabaseUrl } from './env';

/**
 * 세션 없는 손님 권한 클라이언트. 누가 보든 "손님에게 보이는 것"을 고를 때 쓴다
 * (첫 화면 히어로). 관리자가 보더라도 비공개 이야기가 히어로에 걸려 보이지 않게.
 */
export function createAnonClient() {
  return createClient(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
