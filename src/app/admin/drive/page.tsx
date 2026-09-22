import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { disconnect, folderUrl, isConnected, savedRootFolder } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected: justConnected, error } = await searchParams;
  const connected = await isConnected();

  const supabase = await createClient();
  const [{ count: files }, { data: bundles }, rootId] = await Promise.all([
    supabase.from('file').select('*', { count: 'exact', head: true }),
    supabase.from('bundle').select('id, identifier, title, drive_folder_id, item(file(count))').eq('item.file.role', 'original').order('identifier'),
    savedRootFolder(),
  ]);
  // 묶음마다 원본 수 — 자료 → 파일(원본만)을 거쳐 센다
  type BundleRow = { id: string; identifier: string; title: string; drive_folder_id: string | null;
    item: { file: { count: number }[] }[] | null };
  const rows = (bundles ?? []) as unknown as BundleRow[];
  const fileCount = (b: BundleRow) => (b.item ?? []).reduce((n, it) => n + (it.file?.[0]?.count ?? 0), 0);

  async function unlink() {
    'use server';
    await disconnect();
    redirect('/admin/drive');
  }

  return (
    <main className="page">
      <h1 className="title">Google Drive</h1>
      <p className="measure" style={{ marginTop: 'var(--space-4)' }}>
        사진·음성·영상의 원본은 Drive 에 둔다. 아카이브에는 그 파일의 id 와 기술 정보만 남는다.
        이 앱은 <b>스스로 만든 파일에만</b> 닿는다 — 드라이브의 다른 파일은 보지 못한다.
      </p>

      {justConnected && <p className="notice" role="status">연결했다.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <section className="section">
        <h2 className="section-title">
          <span>연결 상태</span>
          <span className={connected ? 'badge is-public' : 'badge'}>{connected ? '연결됨' : '끊김'}</span>
        </h2>

        {connected ? (
          <div className="danger">
            <p className="body-sm">
              올린 파일 {files ?? 0}개. 연결을 끊으면 새 파일을 올리거나 기존 원본을 볼 수 없다.
              Drive 의 파일 자체는 지워지지 않는다.
            </p>
            <form action={unlink}>
              <button className="button is-danger" type="submit">연결 끊기</button>
            </form>
          </div>
        ) : (
          <p className="empty" style={{ display: 'grid', gap: 'var(--space-4)', justifyItems: 'center' }}>
            <span>아직 잇지 않았다. 연결해야 원본 파일을 올릴 수 있다.</span>
            <a className="button" href="/api/google/start">Google Drive 연결</a>
          </p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">
          <span>폴더</span>
          <span className="label-code">Google Drive</span>
        </h2>
        {rootId ? (
          <>
            <p className="measure body-sm">
              원본은 Drive 의 <span className="meta-value">dodangdong-archive</span> 폴더 안에 묶음마다 폴더 하나(<span className="meta-value">DC-002</span> 처럼 식별자 이름)로 들어 있다.
              폴더를 만든 Google 계정으로 로그인해 있어야 열린다. 새 창에서 열린다.
            </p>
            <p style={{ marginTop: 'var(--space-4)' }}>
              <a className="button" href={folderUrl(rootId)} target="_blank" rel="noopener noreferrer">
                Drive 에서 아카이브 폴더 열기 ↗
              </a>
            </p>
            <table className="table" style={{ marginTop: 'var(--space-6)' }}>
              <thead><tr><th>묶음</th><th>제목</th><th>원본</th><th>폴더</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="meta-value">{b.identifier}</td>
                    <td>{b.title}</td>
                    <td className="meta-value">{fileCount(b)}개</td>
                    <td>
                      {b.drive_folder_id
                        ? <a className="body-sm" href={folderUrl(b.drive_folder_id)} target="_blank" rel="noopener noreferrer">열기 ↗</a>
                        : <span className="help">아직 없음</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="empty">아직 폴더가 없다. 첫 원본을 올리면 Drive 에 <span className="meta-value">dodangdong-archive</span> 폴더가 생긴다.</p>
        )}
      </section>

      <p style={{ marginTop: 'var(--space-8)' }}><Link href="/admin">← 관리</Link></p>
    </main>
  );
}
