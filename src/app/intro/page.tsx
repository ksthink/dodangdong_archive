import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/url';
import IntroTerminal from './intro-terminal';
import './intro.css';

/**
 * 사이트의 문. 로그인하지 않은 사람은 어느 주소로 오든 여기로 온다(src/proxy.ts).
 * 이미 들어와 있는 사람에게는 보여 줄 까닭이 없다 — 가려던 곳으로 보낸다.
 */
export default async function IntroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // 열린 리디렉션을 막는다: 같은 사이트의 경로만 받는다(백슬래시 포함, src/lib/url.ts).
  const target = safeNext(next);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(target);

  return <IntroTerminal next={target} />;
}
