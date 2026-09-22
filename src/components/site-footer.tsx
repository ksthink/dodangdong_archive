import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="footer">
      <span>도당동 아카이브</span>
      {/* 만든 곳의 로고 — design.metaphr.dev 의 것을 사이트 안에 사본으로 둔다(바깥 주소가 바뀌어도 깨지지 않게) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="footer-logo" src="/brand/metaphr.png" alt="META.PHR" width={56} height={32} />
      <Link href="/login">관리</Link>
    </footer>
  );
}
