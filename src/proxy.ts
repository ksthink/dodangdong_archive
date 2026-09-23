import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * 사이트 전체에 문을 단다. 로그인하지 않은 사람에게는 어떤 화면도 열리지 않고,
 * 인트로(/intro)로 돌아간다 — 거기서 들어온다. 손님 읽기는 없다.
 *
 * 인트로와 그 화면이 쓰는 파일(글꼴·로고)만 문 밖에 둔다. 아래 matcher 를 보라.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseKey(), {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user) {
    // 그림·파일을 부르는 길은 화면이 아니다 — 인트로 HTML 을 돌려주면 도리어 헷갈린다.
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: '들어와야 볼 수 있다.' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/intro';
    url.search = '';
    // 첫 화면과 옛 로그인 주소는 돌아갈 곳으로 적어 두지 않는다 — 들어오면 첫 화면이다.
    if (path !== '/' && path !== '/login') url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 들어왔다고 관리자는 아니다. 관리 화면은 admin_user 에 있어야 열린다.
  if (path.startsWith('/admin')) {
    const { data: admin } = await supabase
      .from('admin_user').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!admin) return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|fonts/|brand/|intro).*)'],
};
