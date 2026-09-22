'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Job = { name: string; percent: number; error?: string; note?: string };

/** 목록에 쓰는 썸네일의 긴 변. 원본은 줄이지 않고 그대로 둔다. */
const THUMB_EDGE = 480;

/**
 * 브라우저가 열 수 있는 사진이면 긴 변 480px JPEG 사본을 만든다.
 * TIFF 처럼 브라우저가 못 여는 형식은 null — 썸네일은 나중에 스크립트로 채운다
 * (scripts/backfill-thumbs.mjs).
 */
async function makeThumb(file: File): Promise<Blob | null> {
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
 * 파일 바이트는 브라우저에서 Drive 로 바로 간다. 우리 서버는 세션 주소를
 * 열어 주고, 끝난 뒤 파일 id 를 표에 적을 뿐이다 — 큰 영상도 견딘다.
 */
export default function Uploader({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  function update(index: number, patch: Partial<Job>) {
    setJobs((list) => list.map((job, i) => (i === index ? { ...job, ...patch } : job)));
  }

  /** 세션 열기 → PUT → 표에 적기. 표에 적힌 file 행 id 를 돌려준다. */
  async function send(
    body: Blob, name: string, mimeType: string,
    extra: { role?: 'original' | 'thumb'; derivedFrom?: string },
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const res = await fetch('/api/drive/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, name, mimeType, size: body.size }),
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

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    event.target.value = '';

    setBusy(true);
    const start = jobs.length;
    setJobs((list) => [...list, ...files.map((f) => ({ name: f.name, percent: 0 }))]);

    for (const [offset, file] of files.entries()) {
      const index = start + offset;
      try {
        const type = file.type || 'application/octet-stream';
        const originalId = await send(file, file.name, type, { role: 'original' }, (p) => update(index, { percent: p }));
        update(index, { percent: 100 });

        // 썸네일이 안 만들어져도 원본은 올라갔다 — 실패로 치지 않는다.
        if (type.startsWith('image/')) {
          const thumb = await makeThumb(file);
          if (!thumb) {
            update(index, { note: '썸네일은 나중에 채운다(브라우저가 열 수 없는 형식)' });
          } else {
            try {
              await send(thumb, `썸네일 ${file.name.replace(/\.[^.]+$/, '')}.jpg`, 'image/jpeg',
                { role: 'thumb', derivedFrom: originalId });
            } catch {
              update(index, { note: '썸네일을 올리지 못했다 — 나중에 채운다' });
            }
          }
        }
      } catch (cause) {
        update(index, { error: cause instanceof Error ? cause.message : '올리지 못했다.' });
      }
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="uploader">
      <label className="drop">
        <input type="file" multiple onChange={onFiles} disabled={busy} hidden />
        <span className="heading">원본 올리기</span>
        <span className="body-sm">
          사진·문서 스캔·음성·영상을 고른다. 원본은 줄이지 않고 그대로 Drive 에 올리고,
          사진이면 목록용 썸네일을 함께 만든다.
        </span>
      </label>

      {jobs.length > 0 && (
        <ul className="joblist">
          {jobs.map((job, i) => (
            <li key={`${job.name}-${i}`}>
              <span className="body-sm">{job.name}{job.note && <><br /><span className="help">{job.note}</span></>}</span>
              {job.error
                ? <span className="meta-value" role="alert">{job.error}</span>
                : <span className="meta-value">{job.percent}%</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
