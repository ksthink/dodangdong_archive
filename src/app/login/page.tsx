import Link from 'next/link';
import LoginForm from './login-form';

// 관리자 한 사람이 들어오는 곳. 가입·비밀번호 찾기 화면은 없다 — 계정은 하나뿐이다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // 열린 리디렉션을 막는다: 같은 사이트의 경로만 받는다.
  const target = next && /^\/(?!\/)/.test(next) ? next : '/admin';

  return (
    <main className="page center">
      <div className="window">
        <h1 className="window-head">관리자 로그인</h1>
        <LoginForm next={target} />
      </div>
      <p className="body-sm" style={{ marginTop: 'var(--space-8)', color: 'var(--ink-muted)' }}>
        <Link href="/">← 도당동 아카이브</Link>
      </p>
    </main>
  );
}
