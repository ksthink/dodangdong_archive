import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** 지금 올린 판의 커밋. Vercel 은 환경변수로 주고, 내 컴퓨터에서는 git 에게 묻는다. */
function commit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * 인트로 머리글에 박히는 값들. 빌드할 때 한 번 정해져 그대로 굳는다.
 *
 * - BUILT_AT: 빌드한 때 = 배포한 때. 무엇을 고쳤든 올리면 저절로 갱신된다.
 * - COMMIT: 그때 올린 커밋 일곱 자리. 화면에 보이는 것이 정확히 어느 판인지 짚을 수 있다.
 */
/** 브라우저가 Supabase(로그인·조회)와 Google(Drive 로 곧장 올리기)을 직접 부른다 — CSP 의 connect-src */
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return 'https://*.supabase.co';
  }
}

/**
 * 콘텐츠 보안 정책. 이 사이트는 바깥 스크립트·스타일·글꼴·그림을 하나도 쓰지 않아 거의 'self' 뿐이다.
 * - 'unsafe-inline': Next 가 넣는 부트스트랩 스크립트와 React 의 style={} 때문에 아직 필요하다.
 *   빼려면 nonce 를 요청마다 심어야 한다(proxy.ts 가 /intro 를 빼므로 지금 구조로는 어렵다).
 * - 'unsafe-eval': 개발 서버의 HMR 에만. 빌드에는 넣지 않는다.
 * - blob: 은 영상 썸네일을 뜰 때 브라우저가 파일을 blob: 주소로 <video> 에 건다(src/lib/upload-client.ts).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin()} https://www.googleapis.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  env: {
    BUILT_AT: new Date().toISOString(),
    COMMIT: commit(),
  },
  // 어떤 틀로 만들었는지 굳이 알리지 않는다
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
