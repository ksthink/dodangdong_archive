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
const nextConfig: NextConfig = {
  env: {
    BUILT_AT: new Date().toISOString(),
    COMMIT: commit(),
  },
};

export default nextConfig;
