import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * 관리 화면에만 문을 단다. 첫 화면을 비롯한 공개 구간은 미들웨어를 타지 않는다
 * — 손님에게는 세션 쿠키조차 없다.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 로그인했다고 관리자는 아니다. admin_user 에 있어야 한다.
  const { data: admin } = await supabase
    .from('admin_user').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return NextResponse.redirect(new URL('/', request.url));

  return response;
}

export const config = { matcher: ['/admin/:path*'] };
