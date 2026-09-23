/**
 * 아카이브가 받는 파일 갈래. 올릴 때 이것만 받고, 내보낼 때 이것만 브라우저에 펼친다.
 *
 * 목록을 두는 까닭은 하나다 — `text/html`·`image/svg+xml` 이 한 장이라도 들어오면
 * 같은 출처(`/api/media/…`)에서 스크립트가 돌고, 세션 쿠키가 httpOnly 가 아니라
 * 그 한 번에 계정이 나간다. 사진·소리·영상·문서만 받는다.
 *
 * 브라우저가 갈래를 모르는 파일(`file.type` 이 빈 값)도 여기서 걸린다. 그런 자료를 넣어야 하면
 * 갈래를 이 목록에 더한다 — 스크립트가 될 수 있는 html·svg·xml 만 아니면 된다.
 */
export const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/tiff',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  // 옛 집안 자료에 섞여 있는 것들 — 브라우저가 못 틀어도 보존은 받는다
  'image/bmp', 'audio/x-m4a', 'audio/mp3', 'video/x-msvideo', 'video/x-matroska', 'video/mpeg', 'video/3gpp',
  'application/pdf',
]);

export function isAllowedMime(mime: unknown): mime is string {
  return typeof mime === 'string' && ALLOWED_MIME.has(mime.split(';')[0].trim().toLowerCase());
}
