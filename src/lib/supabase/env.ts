/**
 * 환경변수가 없으면 여기서 분명하게 멈춘다.
 * 없을 때 supabase-js 가 내는 오류는 원인을 짚기 어렵다 — 어느 이름이 비었는지 밝힌다.
 *
 * process.env.NEXT_PUBLIC_* 는 반드시 이렇게 통째로 적는다.
 * process.env[name] 처럼 변수로 찾으면 빌드할 때 값이 치환되지 않아
 * 브라우저에서는 늘 undefined 가 된다(서버에서만 동작해 더 헷갈린다).
 */
function need(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 없다. 로컬은 .env.local 에, Vercel 은 Settings → Environment Variables 에 넣는다.`,
    );
  }
  return value;
}

export const supabaseUrl = () =>
  need('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseKey = () =>
  need('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
