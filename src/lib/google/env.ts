/**
 * Google 쪽 값은 모두 서버 전용이다. NEXT_PUBLIC_ 을 붙이지 않는다 —
 * 붙이면 클라이언트 시크릿이 브라우저 번들에 박힌다.
 * (process.env 는 통째로 적는다. 변수로 찾으면 빌드할 때 치환되지 않는다.)
 */
function need(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`환경변수 ${name} 가 없다. Vercel 은 Settings → Environment Variables 에 넣는다.`);
  }
  return value;
}

export const googleClientId = () =>
  need('GOOGLE_OAUTH_CLIENT_ID', process.env.GOOGLE_OAUTH_CLIENT_ID);

export const googleClientSecret = () =>
  need('GOOGLE_OAUTH_CLIENT_SECRET', process.env.GOOGLE_OAUTH_CLIENT_SECRET);

/** 이 앱이 만든 파일에만 닿는다. 드라이브의 다른 파일은 보지 못한다. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** 구글에 등록해 둔 것과 한 글자도 다르면 redirect_uri_mismatch 가 난다. */
export const redirectUri = (origin: string) => `${origin}/api/google/callback`;
