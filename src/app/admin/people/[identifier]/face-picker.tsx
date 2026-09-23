'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { saveFace, type FaceCrop } from '@/lib/people-actions';
import { sendToDrive } from '@/lib/upload-client';

/** 잘라 만드는 얼굴 파일의 한 변. 가장 크게 보이는 자리가 144px 이라 두 배로 넉넉하다. */
const FACE_EDGE = 256;
/** 원천이 이보다 작으면 늘려 쓰는 셈이라 흐려진다 — 알려만 주고 막지는 않는다 */
const SOFT_BELOW = 160;
/** 미리보기 한 변(.face.is-l 과 같다) */
const PREVIEW = 144;

export type Candidate = {
  itemId: string; itemIdentifier: string; itemTitle: string;
  originalId: string; thumbId: string | null;
};

/**
 * 얼굴 자르기 — 사진 위에서 네모를 잡아 그 자리만 잘라 올린다.
 *
 * 끌어서 옮기지 않는다. 사진을 **누르면 거기가 네모의 가운데**가 되고, 크기는 슬라이더로 바꾼다.
 * 이 사이트에는 끌어 움직이는 것이 하나도 없고, 누르기+슬라이더면 키보드로도 그대로 된다.
 * 자르기는 썸네일이 아니라 **원본**에서 한다 — 단체 사진에 작게 찍힌 얼굴도 또렷하게.
 */
export default function FacePicker({
  identifier, personId, candidates, currentFileId, currentCrop,
}: {
  identifier: string;
  personId: string;
  candidates: Candidate[];
  currentFileId: string | null;
  currentCrop: FaceCrop | null;
}) {
  const router = useRouter();
  const img = useRef<HTMLImageElement>(null);
  const [pick, setPick] = useState<Candidate | null>(candidates[0] ?? null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<FaceCrop>(currentCrop ?? { x: 0.3, y: 0.15, size: 0.4 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 네모는 픽셀로 정사각형이다 — 세로로는 가로 대비 비율이 달라진다.
  const sizeY = nat ? (crop.size * nat.w) / nat.h : crop.size;
  const maxSize = nat ? Math.min(1, nat.h / nat.w) : 1;
  const sourcePx = nat ? Math.round(crop.size * nat.w) : 0;

  const clamp = (c: FaceCrop, n: { w: number; h: number }): FaceCrop => {
    const size = Math.min(Math.max(c.size, 0.02), Math.min(1, n.h / n.w));
    const sy = (size * n.w) / n.h;
    return {
      size,
      x: Math.min(Math.max(c.x, 0), 1 - size),
      y: Math.min(Math.max(c.y, 0), 1 - sy),
    };
  };

  function onLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const el = event.currentTarget;
    const n = { w: el.naturalWidth, h: el.naturalHeight };
    setNat(n);
    setCrop((c) => clamp(c, n));
  }

  /** 누른 자리가 네모의 가운데가 된다 */
  function onPick(event: React.MouseEvent<HTMLDivElement>) {
    if (!nat) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;
    setCrop((c) => clamp({ ...c, x: fx - c.size / 2, y: fy - (c.size * nat.w) / nat.h / 2 }, nat));
  }

  /** 화살표키로 민다 — 한 번에 1%, shift 를 누르면 5% */
  function onKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!nat) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = move[event.key];
    if (!d) return;
    event.preventDefault();
    setCrop((c) => clamp({ ...c, x: c.x + d[0], y: c.y + d[1] }, nat));
  }

  async function onSave() {
    if (!pick || !nat || !img.current) return;
    setError(null);
    try {
      setBusy('자르는 중');
      const canvas = document.createElement('canvas');
      canvas.width = FACE_EDGE;
      canvas.height = FACE_EDGE;
      const side = crop.size * nat.w;
      canvas.getContext('2d')!.drawImage(
        img.current, crop.x * nat.w, crop.y * nat.h, side, side, 0, 0, FACE_EDGE, FACE_EDGE,
      );
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) throw new Error('사진을 자르지 못했다.');

      setBusy('올리는 중');
      const fileId = await sendToDrive(pick.itemId, blob, 'face.jpg', 'image/jpeg', {
        role: 'face', derivedFrom: pick.originalId, faceOf: identifier,
      });

      setBusy('저장하는 중');
      await saveFace(identifier, personId, fileId, crop);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했다.');
    }
    setBusy(null);
  }

  async function onClear() {
    setError(null);
    setBusy('빼는 중');
    try {
      await saveFace(identifier, personId, null, null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '빼지 못했다.');
    }
    setBusy(null);
  }

  if (!candidates.length) return <p className="empty">이 사람과 이어진 자료에 사진이 없다.</p>;

  return (
    <div className="facecrop">
      {error && <p className="notice" role="alert">{error}</p>}

      <ul className="facepick">
        {candidates.map((c) => (
          <li key={c.originalId}>
            <label className="facepick-one">
              <input type="radio" name="source" value={c.originalId}
                checked={pick?.originalId === c.originalId}
                onChange={() => { setPick(c); setNat(null); }} />
              <span className="face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${c.thumbId ?? c.originalId}`} alt={c.itemTitle} />
              </span>
              <span className="meta-value">{c.itemIdentifier}</span>
            </label>
          </li>
        ))}
      </ul>

      {pick && (
        <div className="facecrop-work">
          <div className="facecrop-stage" onClick={onPick} onKeyDown={onKey} role="application" tabIndex={0}
            aria-label="사진에서 얼굴 자리를 고른다. 누르면 그 자리가 네모의 가운데가 되고, 화살표키로 민다.">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={img} src={`/api/media/${pick.originalId}`} alt={pick.itemTitle} onLoad={onLoad} />
            {nat && (
              <span className="facecrop-box" aria-hidden style={{
                left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                width: `${crop.size * 100}%`, height: `${sizeY * 100}%`,
              }} />
            )}
          </div>

          <div className="facecrop-side">
            <p className="label">이렇게 보인다</p>
            <div className="face is-l is-crop">
              {nat && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${pick.originalId}`} alt="" style={{
                  width: `${PREVIEW / crop.size}px`,
                  left: `${(-PREVIEW * crop.x) / crop.size}px`,
                  top: `${(-PREVIEW * crop.y * nat.h) / (crop.size * nat.w)}px`,
                }} />
              )}
            </div>

            <label className="label" htmlFor="face-size">크기</label>
            <input className="facecrop-size" id="face-size" type="range"
              min={0.05} max={maxSize} step={0.01} value={crop.size} disabled={!nat}
              onChange={(e) => nat && setCrop((c) => clamp({ ...c, size: Number(e.target.value) }, nat))} />
            <p className="help">
              {nat
                ? `원본에서 ${sourcePx}px 를 잘라 ${FACE_EDGE}px 로 만든다.${sourcePx < SOFT_BELOW ? ' 이만큼 작으면 흐릿해진다.' : ''}`
                : '사진을 읽는 중이다.'}
            </p>

            <div className="facecrop-keys">
              <button className="button" type="button" onClick={onSave} disabled={!!busy || !nat}>
                {busy ?? '얼굴로 저장'}
              </button>
              {currentFileId && (
                <button className="button is-secondary" type="button" onClick={onClear} disabled={!!busy}>
                  얼굴 빼기
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
