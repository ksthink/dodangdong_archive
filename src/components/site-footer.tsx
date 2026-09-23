import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>도당동 아카이브</span>
      {/* 만든 곳 — 로고 그림 대신 글자로 둔다(인트로 머리글과 같은 표기) */}
      <span>©metaphr</span>
      <Link href="/admin">관리</Link>
    </footer>
  );
}
