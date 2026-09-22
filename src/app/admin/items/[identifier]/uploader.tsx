'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Job = { name: string; percent: number; error?: string };

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

  async function putToDrive(url: string, file: File, index: number) {
    await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) update(index, { percent: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error(`Drive 가 ${xhr.status} 로 거절했다.`));
      };
      xhr.onerror = () => reject(new Error('Drive 로 보내지 못했다. 연결을 확인한다.'));
      xhr.send(file);
    }).then(async (text) => {
      const driveFileId = JSON.parse(text).id as string;
      const res = await fetch('/api/drive/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, driveFileId, originalFilename: file.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '파일을 붙이지 못했다.');
    });
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
        const res = await fetch('/api/drive/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, name: file.name, mimeType: file.type, size: file.size }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '업로드 세션을 열지 못했다.');

        await putToDrive(json.url, file, index);
        update(index, { percent: 100 });
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
          사진·문서 스캔·음성·영상을 고른다. 원본을 줄이지 않고 그대로 Drive 에 올린다.
        </span>
      </label>

      {jobs.length > 0 && (
        <ul className="joblist">
          {jobs.map((job, i) => (
            <li key={`${job.name}-${i}`}>
              <span className="body-sm">{job.name}</span>
              {job.error ? (
                <span className="meta-value" role="alert">{job.error}</span>
              ) : (
                <span className="meta-value">{job.percent}%</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
