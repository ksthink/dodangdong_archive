import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/url';

/** 옛 주소. 문은 인트로 하나뿐이다. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  redirect(target === '/' ? '/intro' : `/intro?next=${encodeURIComponent(target)}`);
}
