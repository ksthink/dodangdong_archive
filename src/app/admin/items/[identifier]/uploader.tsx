'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { playbackProblems, readMp4, VIDEO_CODECS, type Mp4Info } from '@/lib/mp4';
import { makeThumb, makeVideoThumb, sendToDrive } from '@/lib/upload-client';

type Job = { name: string; percent: number; error?: string; note?: string };

/** 올린 영상이 재생 규격 밖이면 — 원본으로 보존하고 재생용을 따로 올리라고 알린다 */
function mediaNotes(file: File, info: Mp4Info | null): string[] {
  if (!file.type.startsWith('video/')) return [];
  if (info && !info.codecs.some((c) => VIDEO_CODECS.includes(c))) return [];
  const problems = playbackProblems(info);
  return problems.length
    ? [`재생 규격(H.264·AAC·웹 최적화 MP4)이 아니다: ${problems.join(', ')}`, '원본으로 보존한다 — 아래 목록에서 "재생용 올리기"로 재생 파일을 붙인다']
    : [];
}

/** 원본 올리기 — 형식을 가리지 않고 받아 보존한다. 사진·영상이면 목록용 썸네일도 만든다. */
export default function Uploader({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  function update(index: number, patch: Partial<Job>) {
    setJobs((list) => list.map((job, i) => (i === index ? { ...job, ...patch } : job)));
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
        // 영상·음성이면 mp4 머리를 읽어 길이·크기·코덱을 함께 적는다(Drive 는 늦게 주거나 안 준다)
        const media = type.startsWith('video/') || type.startsWith('audio/') ? await readMp4(file).catch(() => null) : null;
        const originalId = await sendToDrive(itemId, file, file.name, type, { role: 'original', media }, (p) => update(index, { percent: p }));
        update(index, { percent: 100 });
        const notes = mediaNotes(file, media);
        if (notes.length) update(index, { note: notes.join(' · ') });

        // 썸네일이 안 만들어져도 원본은 올라갔다 — 실패로 치지 않는다.
        if (type.startsWith('image/') || type.startsWith('video/')) {
          const thumb = type.startsWith('image/') ? await makeThumb(file) : await makeVideoThumb(file);
          if (!thumb) {
            const later = type.startsWith('video/')
              ? '썸네일은 재생용을 올릴 때 만든다(이 브라우저가 풀 수 없는 영상)'
              : '썸네일은 나중에 채운다(이 브라우저가 열 수 없는 형식)';
            update(index, { note: [...notes, later].join(' · ') });
          } else {
            try {
              await sendToDrive(itemId, thumb, `썸네일 ${file.name.replace(/\.[^.]+$/, '')}.jpg`, 'image/jpeg',
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
          사진·영상이면 목록용 썸네일을 함께 만든다.
        </span>
        <span className="help">
          영상은 H.264·AAC·&ldquo;웹 최적화&rdquo; MP4 면 그대로 재생된다. 아니면 원본으로 보존하고,
          규격에 맞춘 파일을 &ldquo;재생용 올리기&rdquo;로 따로 붙인다.
        </span>
        <span className="help">
          Drive 에는 <span className="meta-value">식별자_올린시각</span> 이름으로 저장된다
          (예: <span className="meta-value">DA-0017_20260922190012.jpg</span>, 썸네일은 끝에 <span className="meta-value">_thumb</span>).
          날짜는 올린 시각(한국 시간)이지 자료의 날짜가 아니다. 원래 파일 이름은 따로 남는다.
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
