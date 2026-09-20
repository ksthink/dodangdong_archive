/**
 * README 가 정한 EDTF 표기만 읽는다.
 *   1978-05-14 정확 · 1978-05 월까지 · 1978 연도 · 1978? 추정 · 1978~ 대략
 *   197X 연대 · 1975/1979 기간
 * 원문(created_edtf)은 그대로 두고, 정렬·연표용 값만 뽑는다.
 * 모르는 것은 모른다고 쓴다 — 읽을 수 없으면 precision 은 unknown 이다.
 */
export type Precision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'interval' | 'unknown';

export type ParsedDate = {
  start: string | null;
  end: string | null;
  precision: Precision;
  uncertain: boolean;
  approx: boolean;
};

const UNKNOWN: ParsedDate = { start: null, end: null, precision: 'unknown', uncertain: false, approx: false };

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function one(raw: string): ParsedDate {
  let s = raw.trim();
  if (!s) return UNKNOWN;

  // 한정자는 뒤에 붙는다: 1978? 추정 · 1978~ 대략 · 1978%  둘 다
  let uncertain = false;
  let approx = false;
  while (s.endsWith('?') || s.endsWith('~') || s.endsWith('%')) {
    if (s.endsWith('?')) uncertain = true;
    else if (s.endsWith('~')) approx = true;
    else { uncertain = true; approx = true; }
    s = s.slice(0, -1);
  }

  const qualified = (p: ParsedDate): ParsedDate => ({ ...p, uncertain, approx });

  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (mo < 1 || mo > 12 || d < 1 || d > lastDay(y, mo)) return UNKNOWN;
    return qualified({ start: s, end: s, precision: 'day', uncertain, approx });
  }

  if ((m = s.match(/^(\d{4})-(\d{2})$/))) {
    const [y, mo] = [+m[1], +m[2]];
    if (mo < 1 || mo > 12) return UNKNOWN;
    return qualified({ start: `${s}-01`, end: `${s}-${pad(lastDay(y, mo))}`, precision: 'month', uncertain, approx });
  }

  if ((m = s.match(/^(\d{4})$/))) {
    return qualified({ start: `${s}-01-01`, end: `${s}-12-31`, precision: 'year', uncertain, approx });
  }

  // 197X = 1970년대 · 19XX = 1900년대
  if ((m = s.match(/^(\d{3})X$/i))) {
    return qualified({ start: `${m[1]}0-01-01`, end: `${m[1]}9-12-31`, precision: 'decade', uncertain, approx });
  }
  if ((m = s.match(/^(\d{2})XX$/i))) {
    return qualified({ start: `${m[1]}00-01-01`, end: `${m[1]}99-12-31`, precision: 'century', uncertain, approx });
  }

  return UNKNOWN;
}

export function parseEdtf(raw: string | null | undefined): ParsedDate {
  if (!raw) return UNKNOWN;
  const s = raw.trim();
  if (!s) return UNKNOWN;

  // 기간: 1975/1979 — 열린 쪽(../1979, 1975/..)도 받는다
  if (s.includes('/')) {
    const [a, b] = s.split('/', 2);
    const from = a === '..' || a === '' ? UNKNOWN : one(a);
    const to = b === '..' || b === '' ? UNKNOWN : one(b);
    if (from.precision === 'unknown' && to.precision === 'unknown') return UNKNOWN;
    return {
      start: from.start,
      end: to.end,
      precision: 'interval',
      uncertain: from.uncertain || to.uncertain,
      approx: from.approx || to.approx,
    };
  }

  return one(s);
}

/** 연표가 이 자료를 놓을 해. 197X 는 1975, 기간은 시작 해. */
export function edtfYear(raw: string | null | undefined): number | null {
  const p = parseEdtf(raw);
  if (p.precision === 'decade' && p.start) return Number(p.start.slice(0, 4)) + 5;
  if (p.start) return Number(p.start.slice(0, 4));
  return null;
}
