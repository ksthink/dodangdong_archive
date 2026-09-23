/**
 * Drive 에 저장하는 파일 이름 규칙.
 *
 *   DA-0017_20260922190012.jpg         원본 — 식별자_올린 시각(한국 시간, 초까지)
 *   DA-0017_20260922190012-2.jpg       같은 이름이 이미 있으면 -2, -3 …
 *   DA-0017_20260922190012_thumb.jpg   썸네일 — 원본 이름 + _thumb
 *   DA-0053_20260922195142_stream.mp4  재생용 사본(영상) — 원본 이름 + _stream
 *   DA-0007_20260922190012_face_DP-002.jpg  얼굴 — 원본 이름 + _face_인물식별자
 *                                           (한 사진에서 여럿을 잘라내므로 사람을 붙인다)
 *
 * 이름에는 한글·공백이 들어가지 않는다 — 영문 식별자, 숫자, 영문 확장자만(ASCII).
 * 날짜는 올린 시각이지 자료가 만들어진 날(dc:date)이 아니다.
 * 올린 원래 파일 이름은 file.original_filename 에 따로 남는다.
 * 폴더도 같다: 바깥 폴더 dodangdong-archive, 그 안에 묶음마다 DC-003 처럼 식별자만.
 * scripts/rename-drive-files.mjs 가 같은 규칙을 쓴다 — 바꾸면 함께 바꾼다.
 */

/** 아카이브 전체가 들어가는 바깥 폴더 */
export const ROOT_FOLDER_NAME = 'dodangdong-archive';

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

/** 묶음 폴더 이름 — 식별자만(DC-003). 묶음 제목은 한글이라 넣지 않는다. */
export function bundleFolderName(identifier: string): string {
  return ascii(identifier);
}

/** 썸네일 이름 — 원본의 Drive 이름에서 확장자를 떼고 _thumb.jpg */
export function thumbName(originalDriveName: string): string {
  return ascii(`${originalDriveName.replace(/\.[^.]+$/, '')}_thumb.jpg`);
}

/** 재생용 사본 이름 — 원본의 Drive 이름에서 확장자를 떼고 _stream.mp4 */
export function streamName(originalDriveName: string): string {
  return ascii(`${originalDriveName.replace(/\.[^.]+$/, '')}_stream.mp4`);
}

/**
 * 얼굴 이름 — 원본 이름 + _face_인물식별자.
 * 한 사진(혼례식 따위)에서 여러 사람의 얼굴을 잘라내므로 사람까지 붙여야 겹치지 않는다.
 * 같은 사람을 다시 자르면 옛 파일이 아직 있을 수 있어 -2, -3 을 붙인다.
 */
export function faceName(originalDriveName: string, person: string, n = 1): string {
  const base = `${originalDriveName.replace(/\.[^.]+$/, '')}_face_${person}`;
  return ascii(`${n > 1 ? `${base}-${n}` : base}.jpg`);
}

/**
 * 이 앱이 규칙대로 만든 이름인가. 지우기 전에 확인하는 데 쓴다 —
 * 잘못된 요청 하나로 앱이 만들지 않은 Drive 파일까지 지우지 않게.
 */
export function isArchiveName(name: string): boolean {
  return /^DA-\d+_\d{14}(-\d+)?(_thumb|_stream|_face_DP-\d+(-\d+)?)?\.[A-Za-z0-9]{1,5}$/.test(name);
}

/** Drive 파일 id 의 모양. 경로에 넣기 전에 거른다 — `/` `?` 가 섞이면 부르는 주소가 달라진다. */
export function isDriveId(id: unknown): id is string {
  return typeof id === 'string' && /^[\w-]{5,128}$/.test(id);
}
