'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });

      if (error) {
        // 자격 증명이 틀린 경우는 어느 쪽이 틀렸는지 밝히지 않는다.
        // 그 밖의 오류(설정·연결)는 고칠 수 있도록 그대로 보여 준다.
        const wrongCredentials = error.status === 400 || error.code === 'invalid_credentials';
        setError(wrongCredentials ? '아이디 또는 비밀번호가 맞지 않다.' : `로그인하지 못했다. ${error.message}`);
        setBusy(false);
        return;
      }
    } catch (cause) {
      // 여기서 잡지 않으면 버튼이 "들어가는 중"인 채로 멈춘다.
      setError(cause instanceof Error ? cause.message : '로그인하지 못했다.');
      setBusy(false);
      return;
    }

    // 클라이언트 전환 대신 페이지를 새로 연다.
    // 로그아웃 상태로 미리 받아 둔 /admin 응답(로그인 화면으로 보내는 리디렉션)이
    // 캐시에 남아 있을 수 있어, 방금 심은 세션 쿠키를 서버가 확실히 보게 한다.
    window.location.assign(next);
  }

  return (
    <form className="window-body" onSubmit={onSubmit}>
      {error && <p className="notice" role="alert">{error}</p>}

      <label className="label" htmlFor="email">아이디</label>
      <input className="field" id="email" name="email" type="email" required autoComplete="username" />

      <label className="label" htmlFor="password">비밀번호</label>
      <input className="field" id="password" name="password" type="password" required autoComplete="current-password" />

      <button className="button" type="submit" disabled={busy}>
        {busy ? '들어가는 중' : '로그인'}
      </button>
    </form>
  );
}
