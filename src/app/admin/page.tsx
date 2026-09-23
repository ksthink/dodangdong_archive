import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * 쓸 수 있는 전체 용량. **손으로 정한 값이다** — Supabase 요금제 한도도, Drive 계정 할당량도
 * DB 나 API 로 알아낼 수 없거나(요금제), 계정 전체를 뜻해(Drive) 아카이브 몫과 맞지 않는다.
 * 요금제나 계정을 바꾸면 이 두 줄을 고친다.
 */
const DB_LIMIT = 300 * 1e6;      // Supabase 300MB
const DRIVE_LIMIT = 300 * 1e9;   // Google Drive 300GB

/** 1.4GB, 12.4MB 처럼 한 자리까지. 1000 으로 나눈다(디스크가 파는 단위와 같게). */
function readableBytes(n: number): string {
  if (n >= 1e9) return `${Math.round(n / 1e8) / 10}GB`;
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}MB`;
  return `${Math.round(n / 1e2) / 10}KB`;
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
  const [{ data: dbSize, error: dbError }, { data: files }] = await Promise.all([
    supabase.rpc('db_size'),
    supabase.from('file').select('bytes'),
  ]);
  // 못 읽었으면 0 으로 눙치지 않는다 — 0% 는 "비어 있다" 로 읽혀 거짓말이 된다.
  const dbBytes = dbError || dbSize === null ? null : Number(dbSize);
  const driveBytes = (files ?? []).reduce((sum, f) => sum + Number(f.bytes ?? 0), 0);

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
          <ul className="grid">
            {([
              ['Supabase', dbBytes, DB_LIMIT, '기술(더블린코어)이 사는 곳'],
              ['Google Drive', driveBytes, DRIVE_LIMIT, `원본 파일 ${files?.length ?? 0}개`],
            ] as [string, number | null, number, string][]).map(([label, used, limit, note]) => (
              <li key={label} className="card">
                <span className="meta-label">{label}</span>
                <p className="display" style={{ marginTop: 'var(--space-2)' }}>
                  {used === null ? '—' : `${Math.min(100, Math.round((used / limit) * 100))}%`}
                </p>
                <p className="meta-value">
                  {used === null
                    ? `쓴 양을 읽지 못했다 · 전체 ${readableBytes(limit)}`
                    : `${readableBytes(used)} / ${readableBytes(limit)} · ${readableBytes(limit - used)} 남음`}
                </p>
                <p className="meta-value">{note}</p>
              </li>
            ))}
          </ul>
          <p className="help" style={{ marginTop: 'var(--space-4)' }}>
            전체 용량은 손으로 적어 둔 값이다. Drive 쪽은 이 아카이브가 올린 파일만 센다 —
            구글 계정이 달리 쓰고 있는 양은 들어 있지 않다.
          </p>
        </section>
    </main>
  );
}
