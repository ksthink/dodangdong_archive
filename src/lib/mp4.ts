/**
 * mp4·mov 머리 읽기 — 브라우저에서 파일 전체를 읽지 않고 상자(box) 몇 개만 본다.
 *
 * Drive 는 영상의 길이·크기를 늦게 주거나 주지 않고, 코덱은 알려 주지 않는다.
 * 올릴 때 여기서 읽어 file 표에 적는다. 코덱을 풀 수 있는지와 상관없이 읽힌다
 * (브라우저가 HEVC 를 재생하지 못해도 머리는 읽는다).
 *
 *   ftyp · moov(mvhd 길이 · trak(tkhd 크기 · mdia(hdlr 종류 · minf/stbl/stsd 코덱))) · mdat
 */

export type Mp4Info = {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** 영상 코덱 먼저, 음성 코덱 뒤 — 예: ['hvc1', 'mp4a'] */
  codecs: string[];
  /** moov 가 mdat 보다 앞인가 */
  faststart: boolean;
};

/** 브라우저에서 재생이 널리 되는 영상 코덱. 나머지(HEVC 따위)는 일부 브라우저에서 재생되지 않는다. */
export const WIDE_VIDEO_CODECS = ['avc1', 'avc3'];
export const VIDEO_CODECS = ['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4v', 'dvh1', 'dvhe'];

const MAX_MOOV = 64 * 1024 * 1024; // 목차가 이보다 크면 읽지 않는다

type Box = { type: string; start: number; size: number; header: number };

async function bytes(blob: Blob, start: number, end: number) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

/** 파일 맨 위의 상자들 — 머리 16바이트씩만 읽는다 */
async function topBoxes(file: Blob): Promise<Box[]> {
  const out: Box[] = [];
  let pos = 0;
  while (pos + 8 <= file.size && out.length < 64) {
    const v = await bytes(file, pos, Math.min(pos + 16, file.size));
    let size = v.getUint32(0);
    const type = String.fromCharCode(v.getUint8(4), v.getUint8(5), v.getUint8(6), v.getUint8(7));
    let header = 8;
    if (size === 1 && v.byteLength >= 16) { size = Number(v.getBigUint64(8)); header = 16; }
    if (size === 0) size = file.size - pos;
    if (size < header) break;
    out.push({ type, start: pos, size, header });
    pos += size;
  }
  return out;
}

/** 메모리에 올린 상자 안의 자식 상자들 */
function children(v: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to) {
    let size = v.getUint32(pos);
    const type = String.fromCharCode(v.getUint8(pos + 4), v.getUint8(pos + 5), v.getUint8(pos + 6), v.getUint8(pos + 7));
    let header = 8;
    if (size === 1) { size = Number(v.getBigUint64(pos + 8)); header = 16; }
    if (size === 0) size = to - pos;
    if (size < header || pos + size > to) break;
    out.push({ type, start: pos, size, header });
    pos += size;
  }
  return out;
}

const find = (v: DataView, box: Box, type: string) =>
  children(v, box.start + box.header, box.start + box.size).find((b) => b.type === type);

export async function readMp4(file: Blob): Promise<Mp4Info | null> {
  const top = await topBoxes(file);
  const moovTop = top.find((b) => b.type === 'moov');
  if (!moovTop || moovTop.size > MAX_MOOV) return null;
  const mdat = top.find((b) => b.type === 'mdat');

  // moov 하나만 통째로 읽는다(보통 수십 KB)
  const v = await bytes(file, moovTop.start, moovTop.start + moovTop.size);
  const moov: Box = { ...moovTop, start: 0 };

  let durationMs: number | null = null;
  const mvhd = find(v, moov, 'mvhd');
  if (mvhd) {
    const p = mvhd.start + mvhd.header;
    const version = v.getUint8(p);
    const timescale = version === 1 ? v.getUint32(p + 20) : v.getUint32(p + 12);
    const duration = version === 1 ? Number(v.getBigUint64(p + 24)) : v.getUint32(p + 16);
    if (timescale) durationMs = Math.round((duration / timescale) * 1000);
  }

  let width: number | null = null;
  let height: number | null = null;
  const video: string[] = [];
  const audio: string[] = [];
  for (const trak of children(v, moov.header, moov.size).filter((b) => b.type === 'trak')) {
    const mdia = find(v, trak, 'mdia');
    const hdlr = mdia && find(v, mdia, 'hdlr');
    const kind = hdlr
      ? String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(hdlr.start + hdlr.header + 8 + i)))
      : '';
    const stbl = mdia && find(v, mdia, 'minf') && find(v, find(v, mdia, 'minf')!, 'stbl');
    const stsd = stbl && find(v, stbl, 'stsd');
    // stsd: 버전·플래그 4바이트, 항목 수 4바이트, 그다음 첫 표본 항목의 크기 4 + 형식 4
    const codec = stsd
      ? String.fromCharCode(...[4, 5, 6, 7].map((i) => v.getUint8(stsd.start + stsd.header + 8 + i)))
      : null;
    if (kind === 'vide') {
      if (codec) video.push(codec);
      const tkhd = find(v, trak, 'tkhd');
      if (tkhd && width === null) {
        const end = tkhd.start + tkhd.size; // 너비·높이는 끝 8바이트(16.16 고정소수)
        width = Math.round(v.getUint32(end - 8) / 65536) || null;
        height = Math.round(v.getUint32(end - 4) / 65536) || null;
      }
    } else if (kind === 'soun' && codec) {
      audio.push(codec);
    }
  }

  return {
    durationMs,
    width,
    height,
    codecs: [...new Set([...video, ...audio])],
    faststart: mdat ? moovTop.start < mdat.start : true,
  };
}

/**
 * 이 사이트의 재생 규격: MP4 · 영상 H.264 · 음성 AAC(또는 없음) · 목차 앞(웹 최적화).
 * 맞지 않는 까닭을 돌려준다. 빈 배열이면 규격에 맞다.
 * 규격 밖의 원본도 보존용으로는 받는다 — 손님 재생에는 따로 올린 재생용(stream)을 쓴다.
 */
export function playbackProblems(info: Mp4Info | null): string[] {
  if (!info) return ['MP4 로 읽히지 않는다'];
  const problems: string[] = [];
  const video = info.codecs.find((c) => VIDEO_CODECS.includes(c));
  const audio = info.codecs.find((c) => !VIDEO_CODECS.includes(c));
  if (!video) problems.push('영상 트랙이 없다');
  else if (!WIDE_VIDEO_CODECS.includes(video)) {
    problems.push(`영상 코덱이 ${video === 'hvc1' || video === 'hev1' ? 'HEVC(H.265)' : video} 다 — H.264 여야 한다`);
  }
  if (audio && audio !== 'mp4a') problems.push(`음성 코덱이 ${audio} 다 — AAC 여야 한다`);
  if (!info.faststart) problems.push('목차가 파일 끝에 있다 — "웹 최적화"로 저장해야 한다');
  return problems;
}
