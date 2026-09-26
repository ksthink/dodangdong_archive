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

/**
 * 띄어쓰기를 따지지 않는 맞춤. "혼례사진" 으로 「혼례 사진」 이 찾아지고 그 반대도 된다.
 *
 * 집안 기록은 띄어쓰기가 제각각이다 — 같은 사람이 쓴 글에서도 「도당동본가」 와
 * 「도당동 본가」 가 섞인다. 찾는 사람이 그것까지 맞출 까닭이 없다.
 * 대소문자도 따지지 않는다.
 */
export function loose(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, '');
}

/** 여러 칸 가운데 하나라도 띄어쓰기 없이 걸리면 참. 검색어가 비면 늘 참이다. */
export function looseHit(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const q = loose(needle);
  if (!q) return true;
  return fields.some((f) => loose(f).includes(q));
}
