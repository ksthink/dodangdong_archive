import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/supabase/server';
import { signOut } from '@/lib/auth-actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/intro?next=/admin');

  return (
    <>
      <div className="adminbar">
        {/* 딱지가 관리 첫 화면으로 가는 문이다 — 메뉴에 '관리' 를 따로 두지 않는다 */}
        <Link href="/admin" className="adminbar-mode">관리 모드</Link>
        <span>{admin.label}</span>
        <nav className="adminbar-nav">
          <Link href="/admin/hero">첫 화면</Link>
          <Link href="/admin/items">자료 목록</Link>
          <Link href="/admin/items/new">자료 등록</Link>
          <Link href="/admin/bundles">묶음</Link>
          <Link href="/admin/stories">이야기</Link>
          <Link href="/admin/people">인물</Link>
          <Link href="/admin/taxonomy">분류</Link>
          <Link href="/admin/drive">GDRIVE</Link>
          <Link href="/">아카이브 보기</Link>
          <form action={signOut}><button type="submit" className="adminbar-out">나가기</button></form>
        </nav>
      </div>
      {children}
    </>
  );
}
