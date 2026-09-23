import Link from 'next/link';
import { signOut } from '@/lib/auth-actions';

export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>도당동 아카이브</span>
      {/* 만든 곳 — 로고 그림 대신 글자로 둔다(인트로 머리글과 같은 표기) */}
      <span>©metaphr</span>
      <span className="footer-admin">
        <Link href="/admin">관리</Link>
        <span aria-hidden>|</span>
        <form action={signOut}><button type="submit" className="footer-out">로그아웃</button></form>
      </span>
    </footer>
  );
}
