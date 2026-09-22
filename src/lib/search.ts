/**
 * 검색어를 PostgREST 의 or=(...ilike...) 조건으로 만든다.
 *
 * - LIKE 와일드카드(% _)와 백슬래시는 글자 그대로 찾도록 이스케이프한다.
 *   그러지 않으면 "_" 한 글자로 모든 자료가 나온다.
 * - 값을 큰따옴표로 감싸 쉼표·괄호가 or() 문법을 깨지 않게 한다.
 * - "*" 는 PostgREST 가 % 로 바꾸므로 지운다.
 *
 * 쓸 만한 글자가 하나도 없으면 null — 부르는 쪽은 "아무것도 찾지 않음"으로 다룬다.
 */
export function ilikeAny(columns: string[], raw: string): string | null {
  const q = raw.replace(/\*/g, '').trim().slice(0, 80);
  if (!q) return null;
  const like = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const quoted = `"${`%${like}%`.replace(/[\\"]/g, (m) => `\\${m}`)}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}
