'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseKey, supabaseUrl } from './env';

/** 손님과 관리자가 브라우저에서 쓰는 클라이언트. RLS 가 보이는 범위를 정한다. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey());
}
