import Link from 'next/link';

/** 공개 화면 머리. 로그인 링크는 여기 두지 않는다 — 맨 아래 "관리" 하나로만 간다. */
export default function SiteHeader() {
  return (
    <header className="site-head">
      <Link href="/" className="site-name">도당동 아카이브</Link>
      <nav className="site-nav">
        <Link href="/search">자료 찾기</Link>
        <Link href="/people">인물</Link>
        <Link href="/chronicle">연표</Link>
      </nav>
    </header>
  );
}
