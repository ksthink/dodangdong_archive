import Link from 'next/link';
import { Suspense } from 'react';
import SavedPopup from '@/components/saved-popup';
import AdminNav from '@/components/admin-nav';
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
        <AdminNav>
          <form action={signOut}><button type="submit" className="adminbar-out">나가기</button></form>
        </AdminNav>
      </div>
      {children}
      <Suspense fallback={null}><SavedPopup /></Suspense>
    </>
  );
}
