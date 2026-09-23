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

/**
 * 비중 하나를 원 하나로 그린다. 12시에서 시계 방향으로 먹색을 채운다.
 * 0 이 아니면 아주 작아도 한 조각은 보이게 한다 — 비어 있는 것과 조금 든 것은 다르다.
 */
function Pie({ ratio, size, tip }: { ratio: number; size: number; tip: string }) {
  const r = size / 2 - 1;            // 테 두께의 절반만큼 안으로
  const c = size / 2;
  const share = Math.max(0, Math.min(1, ratio));
  // 정확히 한 바퀴면 호가 시작점으로 돌아와 아무것도 그려지지 않는다 — 그때는 원을 채운다.
  const full = share >= 0.999;
  const a = 2 * Math.PI * (full ? 0 : Math.max(share, share > 0 ? 0.015 : 0));
  const x = c + r * Math.sin(a);
  const y = c - r * Math.cos(a);

  return (
    <span className="pie-wrap">
      {/* 같은 값이 줄에 글자로도 있다 — 읽어 주는 기계에는 이 겹말을 보내지 않는다 */}
      <span className="pie-tip" aria-hidden>{tip}</span>
      <svg className="pie" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="var(--paper-sunken)" stroke="var(--ink)" strokeWidth="2" />
        {share > 0 && (full
          ? <circle cx={c} cy={c} r={r} fill="var(--ink)" />
          : <path fill="var(--ink)" d={`M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} />
        )}
      </svg>
    </span>
  );
}

/** 전체에 견준 비중. 1% 아래는 반올림하면 0% 이 되어 "없다" 로 읽힌다 — 그때는 <1% 로 적는다. */
function sharePercent(part: number, whole: number): string {
  if (!whole) return '0%';
  const percent = (part / whole) * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
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

  // 저장소 — DB 크기는 함수로 묻고(0016), Drive 는 우리가 올린 파일의 합이다(파일이 적어 그대로 더한다).
  const [{ data: dbSize, error: dbError }, { data: tables }, { data: files }] = await Promise.all([
    supabase.rpc('db_size'),
    supabase.rpc('db_tables'),
    supabase.from('file').select('mime, bytes'),
  ]);
  // 못 읽었으면 0 으로 눙치지 않는다 — 0% 는 "비어 있다" 로 읽혀 거짓말이 된다.
  const dbBytes = dbError || dbSize === null ? null : Number(dbSize);
  const driveBytes = (files ?? []).reduce((sum, f) => sum + Number(f.bytes ?? 0), 0);

  // 형식마다 몇 개에 몇 바이트인지. 큰 것부터 본다 — 자리를 차지하는 것이 무엇인지가 먼저다.
  const byFormat = new Map<string, { count: number; bytes: number }>();
  for (const f of files ?? []) {
    const mime = (f.mime ?? '').toLowerCase() || 'application/octet-stream';
    const seen = byFormat.get(mime) ?? { count: 0, bytes: 0 };
    byFormat.set(mime, { count: seen.count + 1, bytes: seen.bytes + Number(f.bytes ?? 0) });
  }
  const formats = [...byFormat.entries()].sort((a, b) => b[1].bytes - a[1].bytes);

  // 표는 큰 것 여섯만 본다. 스물두 개를 다 늘어놓으면 벽이 된다.
  type Table = { name: string; rows: number; bytes: number };
  const biggest = ((tables ?? []) as Table[])
    .filter((t) => t.rows > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);
  // 비중은 여섯 줄이 아니라 표 전부에 견준다 — 보이지 않는 표도 자리를 차지한다.
  const tableTotal = ((tables ?? []) as Table[]).reduce((sum, t) => sum + Number(t.bytes ?? 0), 0);
  // 막대는 가장 큰 형식을 가득 찬 것으로 잡는다. 전체 용량에 견주면 죄다 한 점이라 보이지 않는다.

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
              <p className="storage-use">
                <Pie ratio={dbBytes === null ? 0 : dbBytes / DB_LIMIT} size={96}
                  tip={dbBytes === null ? '쓴 양을 읽지 못했다' : `${readableBytes(dbBytes)} / ${readableBytes(DB_LIMIT)}`} />
                <span className="display">{dbBytes === null ? '—' : sharePercent(dbBytes, DB_LIMIT)}</span>
              </p>
              <p className="meta-value">
                {dbBytes === null
                  ? `쓴 양을 읽지 못했다 · 전체 ${readableBytes(DB_LIMIT)}`
                  : `${readableBytes(dbBytes)} / ${readableBytes(DB_LIMIT)} · ${readableBytes(DB_LIMIT - dbBytes)} 남음`}
              </p>
              <p className="meta-value">기술(더블린코어)이 사는 곳</p>

              {/* 무엇이 자리를 차지하는지 — 큰 표부터. 딸린 인덱스까지 더한 크기다 */}
              {biggest.length > 0 && (
                <ul className="storage-rows is-tables">
                  {biggest.map((t) => (
                    <li key={t.name}>
                      <span className="meta-label">{TABLE_LABEL[t.name] ?? t.name}</span>
                      <span className="meta-value">{t.rows}행</span>
                      <span className="meta-value storage-share">{sharePercent(t.bytes, tableTotal)}</span>
                      <Pie ratio={tableTotal ? t.bytes / tableTotal : 0} size={24}
                        tip={`${TABLE_LABEL[t.name] ?? t.name} · ${t.rows}행 · ${readableBytes(t.bytes)}`} />
                      <span className="meta-value storage-bytes">{readableBytes(t.bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li className="card">
              <span className="meta-label">Google Drive</span>
              <p className="storage-use">
                <Pie ratio={driveBytes / DRIVE_LIMIT} size={96}
                  tip={`${readableBytes(driveBytes)} / ${readableBytes(DRIVE_LIMIT)}`} />
                <span className="display">{sharePercent(driveBytes, DRIVE_LIMIT)}</span>
              </p>
              <p className="meta-value">
                {readableBytes(driveBytes)} / {readableBytes(DRIVE_LIMIT)}
                {' · '}{readableBytes(DRIVE_LIMIT - driveBytes)} 남음
              </p>
              <p className="meta-value">원본과 파생 {files?.length ?? 0}개</p>

              {/* 파일은 Drive 에 산다 — 형식 내역도 이 칸 안에 둔다 */}
              {formats.length === 0 ? (
                <p className="meta-value" style={{ marginTop: 'var(--space-4)' }}>아직 올린 파일이 없다.</p>
              ) : (
                <ul className="storage-rows is-files">
                  {formats.map(([mime, { count, bytes }]) => (
                    <li key={mime}>
                      <span className="meta-label">{KIND_LABEL[mime.split('/')[0]] ?? '그 밖'}</span>
                      <span className="storage-format">{formatName(mime)}</span>
                      <span className="meta-value">{count}개</span>
                      {/* 비중은 올린 파일 전체에 견준다. 300GB 에 견주면 죄다 0% 이라 뜻이 없다 */}
                      <span className="meta-value storage-share">{sharePercent(bytes, driveBytes)}</span>
                      <Pie ratio={driveBytes ? bytes / driveBytes : 0} size={24}
                        tip={`${KIND_LABEL[mime.split('/')[0]] ?? '그 밖'} ${formatName(mime)} · ${count}개 · ${readableBytes(bytes)}`} />
                      <span className="meta-value storage-bytes">{readableBytes(bytes)}</span>
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
