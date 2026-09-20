import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * 서버에서 쓰는 클라이언트. 손님에게는 세션 쿠키가 없으므로 anon 으로 읽고,
 * RLS 가 공개 자료만 돌려준다 — 비공개는 행 자체가 오지 않는다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서는 쓸 수 없다. 세션 갱신은 미들웨어가 맡는다.
          }
        },
      },
    },
  );
}

/** 지금 보는 사람이 관리자인가. admin_user 에 없으면 손님이다. */
export async function getAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('admin_user').select('user_id, label').eq('user_id', user.id).maybeSingle();
  return data ? { ...user, label: data.label } : null;
}
