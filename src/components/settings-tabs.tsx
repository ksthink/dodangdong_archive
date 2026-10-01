'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/taxonomy', label: '분류' },
  { href: '/admin/drive', label: 'GDRIVE' },
];

/** 관리 띠 바로 아래의 설정 탭. 지금 어느 설정에 있는지는 주소로 안다. */
export default function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="subbar" aria-label="설정">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={on ? 'subbar-tab is-on' : 'subbar-tab'}
            aria-current={on ? 'page' : undefined}>{t.label}</Link>
        );
      })}
    </nav>
  );
}
