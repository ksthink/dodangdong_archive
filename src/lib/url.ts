/**
 * 되돌아갈 주소에 쿼리를 붙인다. 값은 URLSearchParams 가 인코딩한다.
 * redirect() 에 한글을 그대로 넣으면 Location 헤더가 깨져 500 이 난다
 * (Invalid character in header content). 키는 영문으로만 쓴다.
 */
export const withQuery = (path: string, query: Record<string, string>) =>
  `${path}?${new URLSearchParams(query).toString()}`;
