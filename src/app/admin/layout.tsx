import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect('/login?next=/admin');

  async function signOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/');
  }

  return (
    <>
      <div className="adminbar">
        <span className="adminbar-mode">관리 모드</span>
        <span>{admin.label}</span>
        <nav className="adminbar-nav">
          <Link href="/admin">관리</Link>
          <Link href="/admin/items">자료 목록</Link>
          <Link href="/admin/items/new">자료 등록</Link>
          <Link href="/admin/people">인물</Link>
          <Link href="/admin/drive">Drive</Link>
          <Link href="/">아카이브 보기</Link>
        </nav>
        <form action={signOut}><button type="submit" className="adminbar-out">나가기</button></form>
      </div>
      {children}
    </>
  );
}
