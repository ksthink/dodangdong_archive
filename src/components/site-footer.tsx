import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>도당동 아카이브</span>
      <Link href="/login">관리</Link>
    </footer>
  );
}
