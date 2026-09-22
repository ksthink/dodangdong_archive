import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

/**
 * 서버 자신의 권한으로 읽는 클라이언트. RLS 를 우회한다.
 *
 * 딱 한 가지에만 쓴다: 원본을 흘려보낼 때 필요한 Google 리프레시 토큰 읽기.
 * 그 토큰은 app_setting 에 있고 RLS 가 관리자만 읽게 막아 두었는데,
 * 손님이 공개 자료의 사진을 볼 때도 서버는 그 토큰이 있어야 한다.
 * 요청한 사람의 권한으로 읽으면 손님에게는 늘 null 이라 사진이 500 이 났다.
 *
 * 쓰기에는 쓰지 않는다 — 쓰기는 관리자 세션과 RLS 를 거쳐야만 한다.
 * 'server-only' 가 이 파일이 브라우저 번들에 들어가는 것을 막는다.
 */
export function createServiceClient() {
  // 통째로 적는다 — process.env[name] 은 빌드 때 치환되지 않는다.
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      '환경변수 SUPABASE_SECRET_KEY 가 없다. 원본을 손님에게 보여 주려면 필요하다. ' +
        'Supabase 대시보드 → Project Settings → API Keys 의 secret 키를 Vercel 에 넣고 다시 배포한다.',
    );
  }
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
