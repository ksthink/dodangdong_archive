/**
 * 되돌아갈 주소에 쿼리를 붙인다. 값은 URLSearchParams 가 인코딩한다.
 * redirect() 에 한글을 그대로 넣으면 Location 헤더가 깨져 500 이 난다
 * (Invalid character in header content). 키는 영문으로만 쓴다.
 */
export const withQuery = (path: string, query: Record<string, string>) =>
  `${path}?${new URLSearchParams(query).toString()}`;

/**
 * 로그인 뒤 돌아갈 곳(next)을 거른다 — 같은 사이트의 경로만 받는다.
 *
 * `//evil.com` 만 막으면 모자란다. 브라우저는 `/\evil.com` 의 백슬래시를 슬래시로 읽어
 * `//evil.com` = 바깥 사이트로 보낸다(SECURITY.md M1). 그래서 더미 origin 에 붙여 파싱한 뒤
 * origin 이 그대로인지 확인하고, 경로와 쿼리만 다시 조립해 돌려준다. 문(/intro) 자신은 받지 않는다.
 */
export function safeNext(next: string | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || /^\/[\/\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, 'http://next.invalid');
    if (url.origin !== 'http://next.invalid' || !url.pathname.startsWith('/')) return fallback;
    if (url.pathname === '/intro' || url.pathname.startsWith('/intro/')) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
