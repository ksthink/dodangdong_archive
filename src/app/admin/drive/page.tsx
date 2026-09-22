import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { disconnect, isConnected } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<{ 연결됨?: string; 오류?: string }>;
}) {
  const { 연결됨, 오류 } = await searchParams;
  const connected = await isConnected();

  const supabase = await createClient();
  const { count: files } = await supabase.from('file').select('*', { count: 'exact', head: true });

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

      {연결됨 && <p className="notice" role="status">연결했다.</p>}
      {오류 && <p className="notice" role="alert">{오류}</p>}

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

      <p style={{ marginTop: 'var(--space-8)' }}><Link href="/admin">← 관리</Link></p>
    </main>
  );
}
