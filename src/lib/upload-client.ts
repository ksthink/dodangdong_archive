/**
 * 브라우저 쪽 올리기 도우미 — 원본 업로더와 재생용 업로더가 함께 쓴다.
 *
 * 파일 바이트는 브라우저에서 Drive 로 바로 간다. 우리 서버는 세션 주소를
 * 열어 주고(/api/drive/session), 끝난 뒤 파일 id 를 표에 적을 뿐이다(/api/drive/register).
 * Drive 에 저장할 이름은 서버가 규칙대로 정한다(src/lib/google/naming.ts).
 */
import type { Mp4Info } from './mp4';

/** 목록에 쓰는 썸네일의 긴 변. 원본은 줄이지 않고 그대로 둔다. */
const THUMB_EDGE = 480;

export type SendExtra = { role?: 'original' | 'thumb' | 'stream'; derivedFrom?: string; media?: Mp4Info | null };

/** 세션 열기 → PUT → 표에 적기. 표에 적힌 file 행 id 를 돌려준다. */
export async function sendToDrive(
  itemId: string, body: Blob, name: string, mimeType: string,
  extra: SendExtra, onProgress?: (percent: number) => void,
): Promise<string> {
  const res = await fetch('/api/drive/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, name, mimeType, size: body.size, ...extra }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? '업로드 세션을 열지 못했다.');

  const text = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', json.url, true);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve(xhr.responseText)
      : reject(new Error(`Drive 가 ${xhr.status} 로 거절했다.`)));
    xhr.onerror = () => reject(new Error('Drive 로 보내지 못했다. 연결을 확인한다.'));
    xhr.send(body);
  });

  const reg = await fetch('/api/drive/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId, driveFileId: JSON.parse(text).id, originalFilename: name, ...extra }),
  });
  const regJson = await reg.json();
  if (!reg.ok) throw new Error(regJson.error ?? '파일을 붙이지 못했다.');
  return regJson.id as string;
}

/**
 * 브라우저가 열 수 있는 사진이면 긴 변 480px JPEG 사본을 만든다.
 * TIFF 처럼 브라우저가 못 여는 형식은 null — 썸네일은 나중에 스크립트로 채운다
 * (scripts/backfill-thumbs.mjs).
 */
export async function makeThumb(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
}

/**
 * 영상의 한 장면(1초, 짧으면 가운데)을 긴 변 480px JPEG 로 뜬다.
 * 이 브라우저가 코덱을 풀지 못하면(HEVC 따위) null — 재생용(H.264)을 올릴 때 거기서 뜬다.
 */
export async function makeVideoThumb(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('video/')) return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const wait = (event: string) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('decode')); }, { once: true });
  });
  try {
    await wait('loadedmetadata');
    const at = Math.min(1, (video.duration || 2) / 2);
    const seeked = wait('seeked');
    video.currentTime = at;
    await seeked;
    if (!video.videoWidth) return null;
    const scale = Math.min(1, THUMB_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
