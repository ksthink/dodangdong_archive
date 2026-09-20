'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });

    if (error) {
      // 어느 쪽이 틀렸는지 밝히지 않는다.
      setError('아이디 또는 비밀번호가 맞지 않다.');
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form className="window-body" onSubmit={onSubmit}>
      {error && <p className="notice" role="alert">{error}</p>}

      <label className="label" htmlFor="email">아이디</label>
      <input className="field" id="email" name="email" type="email" required autoComplete="username" />

      <label className="label" htmlFor="password">비밀번호</label>
      <input className="field" id="password" name="password" type="password" required autoComplete="current-password" />

      <button className="button" type="submit" disabled={busy} style={{ marginTop: 'var(--space-6)' }}>
        {busy ? '들어가는 중' : '로그인'}
      </button>
    </form>
  );
}
