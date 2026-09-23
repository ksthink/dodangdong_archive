import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

/**
 * 인트로 머리글에 박히는 두 값. 빌드할 때 한 번 정해져 그대로 굳는다.
 *
 * - RELEASE: package.json 의 판번호. GitHub 릴리스 태그(v1.0.0)와 같은 값이다.
 *   올릴 때는 `npm version` 으로 올리고 같은 이름의 릴리스를 만든다(README 참고).
 * - BUILT_AT: 빌드한 때 = 배포한 때. 무엇을 고쳤든 올리면 저절로 갱신된다.
 */
const nextConfig: NextConfig = {
  env: {
    RELEASE: `v${pkg.version}`,
    BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
