'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { playbackProblems, readMp4 } from '@/lib/mp4';
import { makeVideoThumb, sendToDrive } from '@/lib/upload-client';

/**
 * 재생용 올리기 — 원본(보존용) 하나에 손님이 트는 파일 하나를 붙인다(role 'stream').
 * 재생 규격(MP4 · H.264 · AAC · 웹 최적화)에 맞는 파일만 받는다. 변환은 관리자 PC 에서 한다
 * (HandBrake "Fast 1080p30" + Web Optimized, 아이폰은 카메라 포맷 "높은 호환성").
 * 원본에 썸네일이 없으면(브라우저가 원본을 풀지 못했으면) 이 파일에서 한 장면을 떠 붙인다.
 */
export default function StreamUploader({
  itemId, originalId, hasThumb,
}: { itemId: string; originalId: string; hasThumb: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ percent?: number; error?: string; note?: string }>({});
  const busy = state.percent !== undefined && state.percent < 100 && !state.error;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const info = await readMp4(file).catch(() => null);
    const problems = playbackProblems(info);
    if (problems.length) {
      setState({ error: `재생 규격이 아니다: ${problems.join(', ')}` });
      return;
    }

    try {
      setState({ percent: 0 });
      await sendToDrive(itemId, file, file.name, 'video/mp4', { role: 'stream', derivedFrom: originalId, media: info },
        (percent) => setState({ percent }));
      setState({ percent: 100 });
      if (!hasThumb) {
        const thumb = await makeVideoThumb(file);
        if (thumb) {
          await sendToDrive(itemId, thumb, `썸네일 ${file.name.replace(/\.[^.]+$/, '')}.jpg`, 'image/jpeg',
            { role: 'thumb', derivedFrom: originalId }).catch(() => setState({ percent: 100, note: '썸네일은 올리지 못했다' }));
        }
      }
      router.refresh();
    } catch (cause) {
      setState({ error: cause instanceof Error ? cause.message : '올리지 못했다.' });
    }
  }

  return (
    <span className="stream-uploader">
      <label className="button is-secondary">
        <input type="file" accept="video/mp4,.mp4,.m4v" onChange={onFile} disabled={busy} hidden />
        재생용 올리기
      </label>
      {state.percent !== undefined && !state.error && <span className="meta-value">{state.percent}%</span>}
      {state.error && <span className="help" role="alert">{state.error}</span>}
      {state.note && <span className="help">{state.note}</span>}
    </span>
  );
}
