/**
 * 환경변수가 없으면 여기서 분명하게 멈춘다.
 * 없을 때 supabase-js 가 내는 오류는 원인을 짚기 어렵다 — 어느 이름이 비었는지 밝힌다.
 */
function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 없다. 로컬은 .env.local 에, Vercel 은 Settings → Environment Variables 에 넣는다.`,
    );
  }
  return value;
}

export const supabaseUrl = () => need('NEXT_PUBLIC_SUPABASE_URL');
export const supabaseKey = () => need('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
