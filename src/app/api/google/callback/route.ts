import { NextResponse, type NextRequest } from 'next/server';
import { getAdmin } from '@/lib/supabase/server';
import { googleClientId, googleClientSecret, redirectUri } from '@/lib/google/env';
import { saveRefreshToken } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

const back = (request: NextRequest, message?: string) => {
  const url = new URL('/admin/drive', request.url);
  if (message) url.searchParams.set('오류', message);
  return NextResponse.redirect(url);
};

export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL('/login?next=/admin/drive', request.url));

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return back(request, `구글이 연결을 거절했다: ${params.get('error')}`);

  // state 가 맞지 않으면 남이 시작시킨 연결이다.
  const state = params.get('state');
  const expected = request.cookies.get('google_oauth_state')?.value;
  if (!state || !expected || state !== expected) return back(request, '연결 요청이 확인되지 않는다. 다시 시도한다.');

  const code = params.get('code');
  if (!code) return back(request, '인증 코드를 받지 못했다.');

  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: redirectUri(request.nextUrl.origin),
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });
  } catch (cause) {
    return back(request, cause instanceof Error ? cause.message : '토큰을 받지 못했다.');
  }

  const json = await res.json();
  if (!res.ok) return back(request, `토큰을 받지 못했다: ${json.error_description ?? json.error ?? res.status}`);
  if (!json.refresh_token) {
    return back(request, '리프레시 토큰이 오지 않았다. 구글 계정의 앱 권한을 지우고 다시 연결한다.');
  }

  await saveRefreshToken(json.refresh_token);

  const response = NextResponse.redirect(new URL('/admin/drive?연결됨=1', request.url));
  response.cookies.delete('google_oauth_state');
  return response;
}
