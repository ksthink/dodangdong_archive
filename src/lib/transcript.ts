/**
 * 녹취록 — 관리자가 적은 글을 구간으로 나눈다.
 *
 * 한 줄이 한 구간이다. 줄 머리에 시각과 말한 사람을 붙일 수 있고, 둘 다 없어도 된다.
 *   [00:12] 할머니: 그때는 전화가 동네에 한 대뿐이었어.
 *   [1:02:05] 나: 그럼 어디서 걸었어요?
 *   할머니: 이장 댁에서.
 *   (웃음)
 *   [02:40]
 *   시각만 적힌 줄은 바로 다음 줄에 붙는다.
 * 빈 줄은 건너뛴다. 원문(full_text)은 그대로 두고, 이 결과(segments)는 보여 줄 때만 쓴다.
 */

export type Segment = { start: number | null; speaker: string | null; text: string };

const TIME = /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*/;
// 말한 사람은 짧은 이름 하나(여덟 글자까지, 띄어쓰기 한 번까지) — 문장 속 쌍점
// ("그 사람이 말하길: …")을 이름으로 잘못 읽지 않게 좁힌다.
const SPEAKER = /^([^\s:：.,?!()[\]]{1,8}(?: [^\s:：.,?!()[\]]{1,8})?)[:：]\s+/;
const MAX_SPEAKER = 8;

export function parseTranscript(raw: string): Segment[] {
  const out: Segment[] = [];
  let pending: number | null = null; // 시각만 적힌 줄 — 다음 줄에 붙인다
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    let rest = line.trim();
    if (!rest) continue;

    let start: number | null = null;
    const t = rest.match(TIME);
    if (t) {
      const [, h, m, s] = t;
      if (Number(s) < 60) {
        start = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
        rest = rest.slice(t[0].length);
      }
    }

    let speaker: string | null = null;
    const sp = rest.match(SPEAKER);
    if (sp && sp[1].replace(' ', '').length <= MAX_SPEAKER) {
      speaker = sp[1].trim();
      rest = rest.slice(sp[0].length);
    }

    if (!rest && !speaker) { if (start !== null) pending = start; continue; }
    out.push({ start: start ?? pending, speaker, text: rest.trim() });
    pending = null;
  }
  return out;
}

/** 초 → [m:ss] 또는 [h:mm:ss] */
export function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
