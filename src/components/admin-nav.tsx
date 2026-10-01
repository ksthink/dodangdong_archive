'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 한 메뉴가 여러 주소를 품을 수 있다. 설정은 그 안의 탭 주소를 모두 제 것으로 친다.
const MENU: { href: string; label: string; under: string[] }[] = [
  { href: '/admin/hero', label: '첫 화면', under: ['/admin/hero'] },
  { href: '/admin/items', label: '자료 목록', under: ['/admin/items'] },
  { href: '/admin/items/new', label: '자료 등록', under: ['/admin/items/new'] },
  { href: '/admin/bundles', label: '묶음', under: ['/admin/bundles'] },
  { href: '/admin/stories', label: '이야기', under: ['/admin/stories'] },
  { href: '/admin/people', label: '인물', under: ['/admin/people'] },
  { href: '/admin/taxonomy', label: '설정', under: ['/admin/taxonomy', '/admin/drive'] },
];

/** 관리 띠의 메뉴. 지금 있는 곳의 메뉴를 뒤집어(흰 바탕에 먹 글씨) 보인다. */
export default function AdminNav({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // 가장 길게 맞는 주소의 메뉴가 고른 것이다 — /admin/items/new 는 '자료 목록' 이 아니라 '자료 등록' 이다.
  let on: string | null = null;
  let best = 0;
  for (const m of MENU) {
    for (const u of m.under) {
      if ((path === u || path.startsWith(`${u}/`)) && u.length > best) { on = m.href; best = u.length; }
    }
  }
  return (
    <nav className="adminbar-nav">
      {MENU.map((m) => (
        <Link key={m.href} href={m.href} className={on === m.href ? 'is-on' : undefined}
          aria-current={on === m.href ? 'page' : undefined}>{m.label}</Link>
      ))}
      <Link href="/">아카이브 보기</Link>
      {children}
    </nav>
  );
}
