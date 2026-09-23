'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** 부팅 연출은 첫 방문에만 — 브라우저에 한 번 봤다고 적어 둔다. */
const SEEN = 'dodangdong-intro-seen';

const HEAD = [
  'SMALL-SCALE ARCHIVE SYSTEM',
  '도당동 아카이브 · DODANGDONG ARCHIVE',
  '----------------------------------------',
];

/**
 * 판번호와 갱신 날짜는 빌드할 때 박힌다(next.config.ts).
 * 판번호는 package.json = GitHub 릴리스 태그, 날짜는 빌드한 때 = 배포한 때다.
 */
const RELEASE = process.env.RELEASE ?? 'v0.0.0';
const BUILT_AT = process.env.BUILT_AT;
/** 한국 시간의 날짜만. 서버와 브라우저가 같은 값을 내야 하므로 로캘에 기대지 않는다. */
const UPDATED = new Date(new Date(BUILT_AT ?? 0).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function IntroTerminal({ next }: { next: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 서버가 그린 화면과 같은 모습으로 시작하고, 첫 방문일 때만 연출을 얹는다.
  // 상태가 아니라 클래스로 붙인다 — 다시 그릴 일이 없는, 화면에만 있는 일이다.
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN)) return;
      localStorage.setItem(SEEN, '1');
    } catch {
      // 사생활 보호 창에서는 저장이 막힌다 — 그때는 늘 연출을 보여 준다.
    }
    root.current?.classList.add('is-booting');
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const { error } = await createClient().auth.signInWithPassword({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      if (error) {
        // 어느 쪽이 틀렸는지는 밝히지 않는다.
        const wrong = error.status === 400 || error.code === 'invalid_credentials';
        setError(wrong ? '맞지 않는다. 다시 넣는다.' : `들어가지 못했다. ${error.message}`);
        setBusy(false);
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '들어가지 못했다.');
      setBusy(false);
      return;
    }

    // 방금 심은 세션 쿠키를 서버가 확실히 보도록 페이지를 새로 연다.
    window.location.assign(next);
  }

  return (
    <div className="intro" ref={root}>
      <div className="intro-overlay" aria-hidden />
      <span className="intro-scan" aria-hidden />

      <div className="intro-body">
        <header className="intro-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="intro-logo" src="/brand/metaphr.png" alt="META.PHR" width={504} height={288} />
          <div>
            <h1 className="intro-line" style={{ '--i': 0 } as React.CSSProperties}>{HEAD[0]}</h1>
            {HEAD.slice(1).map((line, i) => (
              <p key={line} className={line.startsWith('---') ? 'intro-line intro-rule' : 'intro-line'}
                style={{ '--i': i + 1 } as React.CSSProperties}>{line}</p>
            ))}
            <p className="intro-line" style={{ '--i': 3 } as React.CSSProperties}>
              ARCHIVE {RELEASE} · UPDATED {UPDATED}
            </p>
            <p className="intro-line" style={{ '--i': 4 } as React.CSSProperties}>
              <a className="intro-mail" href="mailto:ksthink@metaphr.dev">©metaphr</a>
            </p>
          </div>
        </header>

        <p className="intro-msg intro-line" style={{ '--i': 5 } as React.CSSProperties}>
          이 사이트는 운영자의 가족사 기록을 위한 아카이빙 공간입니다.
          개인 공간이므로 허가 받지 않은 방문자의 접근을 불허합니다.
        </p>

        {!asking ? (
          <p className="intro-line" style={{ '--i': 6 } as React.CSSProperties}>
            <button className="intro-key" type="button" onClick={() => setAsking(true)}>입장</button>
            {' '}
            <span className="intro-caret" aria-hidden>█</span>
          </p>
        ) : (
          <form className="intro-form" onSubmit={onSubmit}>
            {error && <p className="intro-error" role="alert">{error}</p>}

            <label htmlFor="email">아이디 &gt;&gt;</label>
            <input id="email" name="email" type="email" required autoComplete="username" autoFocus />

            <label htmlFor="password">비밀번호 &gt;&gt;</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />

            <div className="intro-keys">
              <button className="intro-key" type="submit" disabled={busy}>{busy ? '확인 중' : '확인'}</button>
              <button className="intro-key" type="button" onClick={() => { setAsking(false); setError(null); }}>돌아가기</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
