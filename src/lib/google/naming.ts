/**
 * Drive 에 저장하는 파일 이름 규칙.
 *
 *   DA-0017_20260922190012.jpg         원본 — 식별자_올린 시각(한국 시간, 초까지)
 *   DA-0017_20260922190012-2.jpg       같은 이름이 이미 있으면 -2, -3 …
 *   DA-0017_20260922190012_thumb.jpg   썸네일 — 원본 이름 + _thumb
 *
 * 이름에는 한글·공백이 들어가지 않는다 — 영문 식별자, 숫자, 영문 확장자만(ASCII).
 * 날짜는 올린 시각이지 자료가 만들어진 날(dc:date)이 아니다.
 * 올린 원래 파일 이름은 file.original_filename 에 따로 남는다.
 * scripts/rename-drive-files.mjs 가 같은 규칙을 쓴다 — 바꾸면 함께 바꾼다.
 */

const STAMP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** 20260922190012 — 한국 시간 */
export function uploadStamp(at: Date): string {
  const p = Object.fromEntries(STAMP.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

/** 올린 파일 이름의 확장자(소문자, 점 포함). 알 수 없으면 빈 문자열. */
export function extOf(filename: string): string {
  const m = filename.match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? `.${m[1].toLowerCase()}` : '';
}

/** 한글·공백 따위가 섞이면 멈춘다 — 규칙이 깨진 이름을 Drive 에 남기지 않는다. */
function ascii(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`파일 이름 규칙에 맞지 않는다: ${name}`);
  return name;
}

/** 원본 이름. n 이 2 이상이면 겹침을 피하는 순번을 붙인다. */
export function originalName(identifier: string, at: Date, ext: string, n = 1): string {
  const base = `${identifier}_${uploadStamp(at)}`;
  return ascii(`${n > 1 ? `${base}-${n}` : base}${ext}`);
}

/** 썸네일 이름 — 원본의 Drive 이름에서 확장자를 떼고 _thumb.jpg */
export function thumbName(originalDriveName: string): string {
  return ascii(`${originalDriveName.replace(/\.[^.]+$/, '')}_thumb.jpg`);
}
