import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * 쓸 수 있는 전체 용량. **손으로 정한 값이다** — Supabase 요금제 한도도, Drive 계정 할당량도
 * DB 나 API 로 알아낼 수 없거나(요금제), 계정 전체를 뜻해(Drive) 아카이브 몫과 맞지 않는다.
 * 요금제나 계정을 바꾸면 이 두 줄을 고친다.
 */
const DB_LIMIT = 300 * 1e6;      // Supabase 300MB
const DRIVE_LIMIT = 300 * 1e9;   // Google Drive 300GB

/** 갈래 이름. mime 앞머리로 가른다 — 형식 이름(MP4·WAV)은 그 뒤에서 딴다. */
const KIND_LABEL: Record<string, string> = {
  image: '사진', audio: '소리', video: '영상', application: '문서', text: '글',
};

/** image/jpeg → JPEG, audio/x-m4a → M4A. 형식 이름을 짧게 딴다. */
function formatName(mime: string): string {
  const sub = (mime.split('/')[1] ?? mime).replace(/^x-/, '').split(';')[0];
  return sub.toUpperCase();
}

/** 표 이름은 영문이다 — 화면에는 우리말로 적는다. 없는 이름은 그대로 둔다. */
const TABLE_LABEL: Record<string, string> = {
  item: '자료', file: '파일', person: '인물', bundle: '묶음', collection: '이야기',
  curation_block: '이야기 블록', curation_ref: '이야기가 건 자료', transcript: '녹취록',
  item_person: '자료–인물', item_subject: '자료–주제', item_collection: '자료–묶음',
  item_life_period: '자료–생애', person_relation: '인물 관계', life_period: '생애 구간',
  place: '장소', subject: '주제분류', world_event: '세상일', hero_slot: '첫 화면 자리',
  event_log: '기록', acquisition: '수집', admin_user: '관리자', app_setting: '설정',
};

/** 1.4GB, 12.4MB 처럼 한 자리까지. 1000 으로 나눈다(디스크가 파는 단위와 같게). */
function readableBytes(n: number): string {
  if (n >= 1e9) return `${Math.round(n / 1e8) / 10}GB`;
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}MB`;
  return `${Math.round(n / 1e2) / 10}KB`;
}

/** 전체에 견준 비중. 1% 아래를 반올림하면 0% 이 되어 "없다" 로 읽힌다 — 그때는 <1% 로 적는다. */
function sharePercent(part: number, whole: number): string {
  if (!whole) return '0%';
  const percent = (part / whole) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

/**
 * 조각을 가르는 회색 단계. 흑백이라 색으로 나눌 수 없어 네 단계와 들어간 면뿐이다.
 * 그래서 유형은 **큰 것 넷과 "그 밖"** 으로 묶는다 — 더 잘게 나누면 회색이 모자라 구별이 안 된다.
 */
const SHADES = ['var(--ink)', 'var(--ink-muted)', 'var(--rule-strong)', 'var(--rule)', 'var(--paper-sunken)'];

type Slice = { label: string; note: string; bytes: number };

/** 큰 것부터 줄 세우고, 회색이 모자라면 나머지를 "그 밖" 한 조각으로 묶는다. */
function toSlices(all: Slice[]): Slice[] {
  const sorted = [...all].sort((a, b) => b.bytes - a.bytes);
  if (sorted.length <= SHADES.length) return sorted;
  const rest = sorted.slice(SHADES.length - 1);
  return [...sorted.slice(0, SHADES.length - 1), {
    label: '그 밖',
    note: `${rest.length}가지`,
    bytes: rest.reduce((sum, x) => sum + x.bytes, 0),
  }];
}

/** 원 위의 한 자리. 12시에서 시계 방향으로 잰다(turn 은 한 바퀴가 1). */
function point(c: number, r: number, turn: number) {
  const a = 2 * Math.PI * turn;
  return `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
}

/** 부채꼴 하나. 한 바퀴를 다 돌면 호가 시작점으로 돌아와 아무것도 안 그려지므로 그때는 원을 채운다. */
function Wedge({ c, r, from, share, fill, seam }: {
  c: number; r: number; from: number; share: number; fill: string; seam?: boolean;
}) {
  if (share <= 0) return null;
  if (share >= 0.999) return <circle cx={c} cy={c} r={r} fill={fill} />;
  return (
    <path fill={fill} stroke={seam ? 'var(--paper)' : 'none'} strokeWidth={seam ? 1 : 0}
      d={`M ${c} ${c} L ${point(c, r, from)} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${point(c, r, from + share)} Z`} />
  );
}

/** 얼마나 찼는지 — 조각 하나. 0 이 아니면 아주 작아도 한 조각은 남긴다. */
function UsePie({ ratio, size }: { ratio: number; size: number }) {
  const r = size / 2 - 1;
  const c = size / 2;
  const share = Math.max(0, Math.min(1, ratio));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="var(--paper-sunken)" stroke="var(--ink)" strokeWidth="2" />
      <Wedge c={c} r={r} from={0} share={share > 0 ? Math.max(share, 0.015) : 0} fill="var(--ink)" />
    </svg>
  );
}

/** 유형이 모두 든 원. 조각마다 회색 단계가 다르고, 사이는 종이색 실선으로 끊는다. */
function TypePie({ slices, size }: { slices: Slice[]; size: number }) {
  const r = size / 2 - 1;
  const c = size / 2;
  const total = slices.reduce((sum, x) => sum + x.bytes, 0);
  let turn = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="var(--paper-sunken)" stroke="var(--ink)" strokeWidth="2" />
      {total > 0 && slices.map((slice, i) => {
        const from = turn;
        const share = slice.bytes / total;
        turn += share;
        return <Wedge key={slice.label} c={c} r={r} from={from} share={share} fill={SHADES[i]} seam />;
      })}
      {/* 조각을 다 그린 뒤 테를 다시 두른다 — 조각이 테를 덮기 때문이다 */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ink)" strokeWidth="2" />
    </svg>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  // 관리자에게는 RLS 가 비공개까지 모두 돌려준다.
  const [{ count: items }, { count: pub }, { count: bundles }, { count: stories }, { count: people }] = await Promise.all([
    supabase.from('item').select('*', { count: 'exact', head: true }),
    supabase.from('item').select('*', { count: 'exact', head: true }).eq('access_level', 'public'),
    supabase.from('bundle').select('*', { count: 'exact', head: true }),
    // 이야기는 collection 의 kind='story' 다(그 밖의 kind 는 세지 않는다)
    supabase.from('collection').select('*', { count: 'exact', head: true }).eq('kind', 'story'),
    supabase.from('person').select('*', { count: 'exact', head: true }),
  ]);

  // 저장소 — DB 크기는 함수로 묻고(0016·0017), Drive 는 우리가 올린 파일의 합이다.
  const [{ data: dbSize, error: dbError }, { data: tables }, { data: files }] = await Promise.all([
    supabase.rpc('db_size'),
    supabase.rpc('db_tables'),
    supabase.from('file').select('mime, bytes'),
  ]);
  // 못 읽었으면 0 으로 눙치지 않는다 — 0% 는 "비어 있다" 로 읽혀 거짓말이 된다.
  const dbBytes = dbError || dbSize === null ? null : Number(dbSize);
  const driveBytes = (files ?? []).reduce((sum, f) => sum + Number(f.bytes ?? 0), 0);

  // 형식마다 몇 개에 몇 바이트인지 — 원에 넣을 조각으로 바로 만든다.
  const byFormat = new Map<string, { count: number; bytes: number }>();
  for (const f of files ?? []) {
    const mime = (f.mime ?? '').toLowerCase() || 'application/octet-stream';
    const seen = byFormat.get(mime) ?? { count: 0, bytes: 0 };
    byFormat.set(mime, { count: seen.count + 1, bytes: seen.bytes + Number(f.bytes ?? 0) });
  }
  const fileSlices = toSlices([...byFormat.entries()].map(([mime, { count, bytes }]) => ({
    label: `${KIND_LABEL[mime.split('/')[0]] ?? '그 밖'} ${formatName(mime)}`,
    note: `${count}개`,
    bytes,
  })));

  // 빈 표는 빼고 나머지를 모두 원에 넣는다. 크기는 딸린 인덱스까지 더한 값이다.
  type Table = { name: string; rows: number; bytes: number };
  const tableSlices = toSlices(((tables ?? []) as Table[])
    .filter((t) => t.rows > 0)
    .map((t) => ({ label: TABLE_LABEL[t.name] ?? t.name, note: `${t.rows}행`, bytes: Number(t.bytes ?? 0) })));
  const tableTotal = tableSlices.reduce((sum, t) => sum + t.bytes, 0);

  return (
    <main className="page">
        <h1 className="title">관리</h1>

        <section className="section">
          <h2 className="section-title">지금 아카이브에 있는 것</h2>
          <ul className="grid">
            {[
              ['자료', items, `공개 ${pub ?? 0}건`],
              // 묶음은 자료를 담는 그릇(Drive 폴더 하나)이고, 이야기는 자료를 엮어 읽게 만든 글이다
              ['묶음', bundles, '수집한 꾸러미'],
              ['이야기', stories, '구성한 이야기'],
              ['인물', people, '전거로 등록된 사람'],
            ].map(([label, n, note]) => (
              <li key={String(label)} className="card">
                <span className="meta-label">{String(label)}</span>
                <p className="display" style={{ marginTop: 'var(--space-2)' }}>{Number(n ?? 0)}</p>
                <p className="meta-value">{String(note)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <h2 className="section-title">저장소</h2>
          <ul className="storage-grid">
            <li className="card">
              <span className="meta-label">Supabase</span>
              <div className="storage-use">
                <p className="display">{dbBytes === null ? '—' : sharePercent(dbBytes, DB_LIMIT)}</p>
                {/* 왼쪽 원은 얼마나 찼는지, 오른쪽 원에는 표가 모두 들어 있다 — 아래 목록이 그 범례다 */}
                <UsePie ratio={dbBytes === null ? 0 : dbBytes / DB_LIMIT} size={72} />
                <TypePie slices={tableSlices} size={72} />
              </div>
              <p className="meta-value">
                {dbBytes === null
                  ? `쓴 양을 읽지 못했다 · 전체 ${readableBytes(DB_LIMIT)}`
                  : `${readableBytes(dbBytes)} / ${readableBytes(DB_LIMIT)} · ${readableBytes(DB_LIMIT - dbBytes)} 남음`}
              </p>
              <p className="meta-value">기술(더블린코어)이 사는 곳</p>

              {tableSlices.length > 0 && (
                <ul className="storage-rows">
                  {tableSlices.map((t, i) => (
                    <li key={t.label}>
                      <span className="swatch" style={{ background: SHADES[i] }} aria-hidden />
                      <span className="meta-label">{t.label}</span>
                      <span className="meta-value">{t.note}</span>
                      <span className="meta-value storage-share">{sharePercent(t.bytes, tableTotal)}</span>
                      <span className="meta-value storage-bytes">{readableBytes(t.bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li className="card">
              <span className="meta-label">Google Drive</span>
              <div className="storage-use">
                <p className="display">{sharePercent(driveBytes, DRIVE_LIMIT)}</p>
                <UsePie ratio={driveBytes / DRIVE_LIMIT} size={72} />
                <TypePie slices={fileSlices} size={72} />
              </div>
              <p className="meta-value">
                {readableBytes(driveBytes)} / {readableBytes(DRIVE_LIMIT)}
                {' · '}{readableBytes(DRIVE_LIMIT - driveBytes)} 남음
              </p>
              <p className="meta-value">원본과 파생 {files?.length ?? 0}개</p>

              {/* 파일은 Drive 에 산다 — 형식 내역도 이 칸 안에 둔다 */}
              {fileSlices.length === 0 ? (
                <p className="meta-value" style={{ marginTop: 'var(--space-4)' }}>아직 올린 파일이 없다.</p>
              ) : (
                <ul className="storage-rows">
                  {fileSlices.map((f, i) => (
                    <li key={f.label}>
                      <span className="swatch" style={{ background: SHADES[i] }} aria-hidden />
                      <span className="meta-label">{f.label}</span>
                      <span className="meta-value">{f.note}</span>
                      <span className="meta-value storage-share">{sharePercent(f.bytes, driveBytes)}</span>
                      <span className="meta-value storage-bytes">{readableBytes(f.bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </section>

    </main>
  );
}
