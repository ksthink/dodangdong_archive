import { redirect } from 'next/navigation';

/** 옛 주소. 문은 인트로 하나뿐이다. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  redirect(next && /^\/(?!\/)/.test(next) ? `/intro?next=${encodeURIComponent(next)}` : '/intro');
}
