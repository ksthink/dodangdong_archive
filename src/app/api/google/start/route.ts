import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getAdmin } from '@/lib/supabase/server';
import { DRIVE_SCOPE, googleClientId, redirectUri } from '@/lib/google/env';

export const dynamic = 'force-dynamic';

/** 관리자만 연결을 시작할 수 있다. */
export async function GET(request: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.redirect(new URL('/login?next=/admin/drive', request.url));

  const origin = request.nextUrl.origin;
  const state = randomBytes(16).toString('hex');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', googleClientId());
  url.searchParams.set('redirect_uri', redirectUri(origin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', DRIVE_SCOPE);
  // 리프레시 토큰을 받으려면 둘 다 필요하다. prompt=consent 가 없으면
  // 두 번째 연결부터 refresh_token 이 오지 않는다.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  const response = NextResponse.redirect(url);
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
