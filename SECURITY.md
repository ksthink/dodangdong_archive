# 보안 점검 보고서

점검일: 2026-09-23 · 대상: `main` `24225e9` 기준, 배포지 https://dodangdong-archive.vercel.app · 점검자: Claude Code(네 갈래 병렬 검토 + 검토자 재확인)

**조치 현황(2026-09-23)**: 높음 1건과 중간 2건(M1·M2)을 같은 날 닫았다 — `b58277d` `8d11846` `16d50c0`.
이어서 낮음 5건(L1·L2·L3·L4·L5)을 한 커밋으로 닫았다. 남은 것은 M3(대시보드에서 가입 끄기)와 L8·L9·L10, 정보 항목이다.

> **이 문서는 공개 저장소에 있다.** 아래 "미조치" 항목은 누구나 읽을 수 있는 열린 문제다.
> 고친 항목은 상태 칸을 "고침(커밋)" 으로 바꾼다. 높음·중간은 되도록 빨리 닫는다.

## 한눈에

| 심각도 | 건수 | 요지 |
| --- | --- | --- |
| 높음 | 1 | ~~사이트는 잠갔지만 DB 의 손님(anon) 읽기 정책이 살아 있어 로그인 없이 공개 자료·인물 실명·Drive id·집안 주소가 REST 로 읽힌다~~ **고침 `b58277d`** |
| 중간 | 3 | ~~`next` 검증이 백슬래시를 통과시키는 열린 리디렉션~~ **고침 `8d11846`** · ~~보안 헤더가 HSTS 하나뿐~~ **고침 `16d50c0`** · 가입이 열려 있으면 비관리자 세션이 문을 지난다(대시보드에서 확인 필요) |
| 낮음 | 9 | ~~원본 프록시의 Content-Type·nosniff, 오류 본문의 상류 메시지, Drive id 검증, matcher 접두어 매칭, 206 캐시~~ **다섯 건 고침** · 남은 것은 대시보드(L8)·개발 의존성(L9)·쿠키 구조(L10) |
| 정보 | 7 | 속도 제한 없음, 스크립트의 `.env.local` 직접 파싱 등 |

비밀값 유출은 **없다**(git 전체 이력·작업 트리·클라이언트 번들 검사). 프로덕션 의존성 취약점 **0건**. 서버 액션 21개 전부 관리자 확인 있음. 인증 문(`src/proxy.ts`)은 경로 조작·인코딩·`..`·이미지 최적화기로 우회되지 않았다.

## 어떻게 봤나

| 갈래 | 방법 |
| --- | --- |
| 앱 계층 | `src/proxy.ts`, 라우트 핸들러 6개, 서버 액션 파일 5개, 화면·컴포넌트를 읽음 |
| DB 계층 | 마이그레이션 0001~0013 과 원격 `pg_policies`·grant·함수·default ACL 을 SELECT 로 대조. Supabase security/performance advisor |
| 비밀값·공급망·헤더 | `git log -p --all` 패턴 검색, `.next/static` 번들 검색, `npm audit`, 배포지 응답 헤더 |
| 침투 시험 | 로컬(`npm start`)과 배포지에 읽기 요청만. 로그인·업로드·수정 없음. 우회 경로 20여 개, 이미지 최적화기, 메서드, 큰 값, PostgREST 문법 깨기 |

검토자가 핵심 세 건(H1·M1·M2)을 직접 재현했다. 비공개 자료 확인과 Drive 쪽 공유 상태는 운영자가 직접 본다는 규칙에 따라 손대지 않았다.

---

## 높음

### H1. 로그인 없이 publishable 키만으로 공개 자료·인물·파일·장소가 REST 로 읽힌다 — **고침 `b58277d`**

> 0014 마이그레이션으로 anon 의 정책·표 권한·시퀀스·함수·기본 권한을 전부 거두고 `private` 스키마 usage 도 뗐다.
> 적용 뒤 `person`·`file`·`place`·`item`·`rpc/next_item_identifier` 모두 **401**(permission denied) 확인.
> 히어로는 세션 클라이언트 + 명시적 공개 필터로 바꾸고 `src/lib/supabase/anon.ts` 를 지웠다.
> `authenticated` 는 건드리지 않았다 — 채번 함수는 컬럼 default 라 넣는 사람의 권한으로 돌기 때문. 비관리자 세션이 채번을 앞으로 돌릴 수 있는 잔여는 M3(가입 끄기)로 닫는다.
>
> **덧(0018)**: 0014 의 `revoke execute … from anon` 만으로는 손님의 채번이 닫히지 않았다. 함수는 만들 때
> PUBLIC 에 실행 권한이 기본으로 붙어(`proacl` 의 `=X/postgres`) anon 이 제 권한이 아니라 PUBLIC 을 타고
> 지나갔기 때문이다. 0018 에서 PUBLIC 에게서 걷고 앞으로 만드는 함수의 기본 권한도 막았다.
> 적용 뒤 `has_function_privilege('anon', …)` 가 셋 다 false, `authenticated` 는 true 인 것을 확인했다.

- **어디**: Supabase RLS. `guest_read … to anon for select` 정책이 18개 표에 남아 있다(`supabase/migrations/0002_harden.sql` 이후 그대로). `place`·`subject`·`world_event`·`hero_slot` 은 `using (true)`.
- **왜 문제인가**: 앱은 `src/proxy.ts` 로 모든 화면을 잠갔지만("손님 읽기는 없다"), 브라우저에 실리는 publishable 키를 들고 `https://<ref>.supabase.co/rest/v1/…` 를 곧장 부르면 DB 가 공개(`access_level = 'public'`) 행을 그대로 준다. 앱의 잠금과 DB 의 문이 어긋나 있다.
- **지금 실제로 새는 것**(2026-09-23 데이터):
  - `item` 42/53 — 제목·설명·생산자·출처·내력·접힌 태그까지
  - `person` 11/12 — **실명(`real_name`)·별칭·생몰 EDTF·생몰년·관계·메모**
  - `person_relation`, `life_period` — 가족 관계·생애 구간
  - `file` 19 — **Drive 파일 id(`storage_path`)**, 원래 파일 이름, mime, 크기, 체크섬, **exif 통째**(지금은 GPS 0건이나 앞으로 보장 없음), 코덱
  - `bundle` — 제목·출처·**Drive 폴더 id**
  - `transcript` 1 — 녹취 전문
  - `place` 6 — **행정 주소(`admin_name`) 전부**. 한 집안 아카이브라 곧 거주지다
  - `collection`·`curation_block`·`curation_ref`, `subject`·`world_event`·`hero_slot` 전부
- **재현**: 검토자가 `person?select=identifier,real_name,born_year`, `file`, `place` 에 대해 200 과 행을 받았다. `app_setting`(Drive 토큰)·`admin_user`·`event_log`·`acquisition` 은 **0행** — 이쪽은 막혀 있다.
- **함께 걸린 것**: `pg_default_acl` 에 anon 전체 DML 이 기본값이라, RLS 를 켜지 않은 새 표가 하나라도 생기면 즉시 손님 읽기·쓰기가 된다. `private` 스키마 USAGE 도 anon 에 있다(정책 실행에는 불필요). `next_*_identifier()` 세 함수가 anon·authenticated 에 EXECUTE 라 REST rpc 로 채번을 앞으로 돌릴 수 있다(파괴적이지는 않음).
- **고치는 법**: 마이그레이션 0014 로 손님 정책과 grant 를 걷어낸다.
  ```sql
  do $$ declare r record; begin
    for r in select tablename from pg_policies where schemaname='public' and policyname='guest_read' loop
      execute format('drop policy guest_read on public.%I', r.tablename);
    end loop; end $$;
  revoke all on all tables in schema public from anon;
  revoke all on all sequences in schema public from anon;
  revoke execute on all functions in schema public from anon;
  alter default privileges for role postgres in schema public revoke all on tables from anon;
  alter default privileges for role postgres in schema public revoke all on sequences from anon;
  alter default privileges for role postgres in schema public revoke execute on functions from anon;
  revoke usage on schema private from anon;
  revoke execute on function public.next_item_identifier(), public.next_person_identifier(), public.next_bundle_identifier()
    from anon, authenticated;
  ```
  앱에서 깨지는 곳은 둘뿐이다 — `src/app/page.tsx:27` 와 `src/app/admin/hero/page.tsx:28` 이 `createAnonClient()` 로 "손님 눈높이" 히어로를 고른다. 손님이 없어졌으니 `src/lib/hero.ts`·`src/lib/thumbs.ts` 에 `access_level = 'public'`·`is_archived = false` 필터를 명시하고 세션 클라이언트로 통일한 뒤 `src/lib/supabase/anon.ts` 를 지운다. 그러면 공개/비공개는 "첫 화면 히어로에 걸리는가" 의 뜻만 남는다 — 그 뜻을 유지할지는 운영자가 정한다.

---

## 중간

### M1. `next` 검증이 백슬래시를 통과시킨다 — 열린 리디렉션 — **고침 `8d11846`**

> `safeNext()`(`src/lib/url.ts`) 한 곳으로 모았다. 더미 origin 에 붙여 파싱한 뒤 origin 이 그대로일 때만 경로+쿼리를 돌려준다.
> `/\evil.com` `/%5Cevil.com` `//evil.com` `https://evil.com` `/intro` → 모두 `/`, `/people/DP-001` `/search?x=1` → 그대로. 실제 응답에서 확인.

- **어디**: `src/app/intro/page.tsx:18`, `src/app/login/page.tsx:10`. 검증 `/^\/(?!\/)/` 는 "슬래시로 시작하고 둘째 글자가 슬래시가 아님" 만 본다. `/\evil.com`(인코딩 `/%5Cevil.com`)이 통과해 `src/app/intro/intro-terminal.tsx` 의 `window.location.assign(next)` 와 서버 `redirect(target)` 으로 간다. 브라우저는 `\` 를 `/` 로 읽으므로 `//evil.com` = 외부 사이트다.
- **재현**: 검토자가 정규식을 직접 돌려 `/\evil.com` 통과와 `new URL('/\\evil.com', site).href === 'https://evil.com/'` 을 확인했다. 침투 시험에서 로컬·배포지 모두 RSC 페이로드에 값이 그대로 실렸다. `//evil.com`, `https://evil.com`, `/%2F%2Fevil.com` 은 막힌다.
- **시나리오**: 운영자에게 `…/intro?next=/\evil.com` 링크를 보낸다. 진짜 인트로에서 로그인하면 성공 직후 외부 사이트로 떨어진다(가짜 "세션 만료" 화면으로 비밀번호를 다시 받는 피싱). 이미 들어와 있으면 서버가 곧바로 보낸다.
- **고치는 법**: 검증을 한 곳(`src/lib/url.ts`)으로 모으고 `\` 도 막는다 — `/^\/(?![\/\\])/`. 더 단단하게는 `new URL(next, 'http://x')` 로 파싱해 `origin` 이 더미와 같고 `pathname` 이 `/` 로 시작할 때만 `pathname + search` 를 쓴다. `/intro` 로 되돌아가는 값도 계속 거른다.

### M2. 보안 헤더가 HSTS 하나뿐 — **고침 `16d50c0`**

> `next.config.ts` 에 `headers()` 와 `poweredByHeader: false`. 아래 CSP 그대로(개발 서버에서만 `'unsafe-eval'` 추가)와 `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
> 인트로에서 글꼴·로고·Supabase 로그인 호출까지 CSP 위반 0건 확인. 배포 뒤 배포지 헤더를 한 번 더 본다.

- **어디**: `next.config.ts` 에 `headers()` 없음. 배포지 `/intro` 응답에 있는 보안 헤더는 `strict-transport-security`(Vercel 기본) 뿐이고 `x-powered-by: Next.js` 가 노출된다.

  | 헤더 | 배포지 |
  | --- | --- |
  | Strict-Transport-Security | 있음 |
  | Content-Security-Policy | 없음 |
  | X-Frame-Options / `frame-ancestors` | 없음 |
  | X-Content-Type-Options | 없음 |
  | Referrer-Policy | 없음 |
  | Permissions-Policy | 없음 |

- **왜 문제인가**: 로그인 화면(`/intro`)을 남의 사이트 iframe 에 실을 수 있다(클릭재킹). XSS 가 생겼을 때 두 번째 방어선이 없다 — Supabase 세션 쿠키가 `httpOnly` 가 아니라(L10) XSS 한 번이면 세션이 나간다. `Referrer` 로 `/item/DA-0017` 같은 경로가 바깥 링크에 실린다.
- **고치는 법**: `next.config.ts` 에 `poweredByHeader: false` 와 `headers()`. 이 사이트는 외부 스크립트·스타일·폰트·이미지를 전혀 쓰지 않아 CSP 가 단순하다.
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  media-src 'self';
  font-src 'self';
  connect-src 'self' https://<ref>.supabase.co https://www.googleapis.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  ```
  `'unsafe-inline'` 은 Next 의 부트스트랩 스크립트와 `style={}` 58곳 때문에 첫 단계에서는 필요하다. `script-src` 에서 빼려면 nonce 방식으로 가야 하는데, 지금 `proxy.ts` matcher 가 `/intro` 를 빼므로 헤더는 `next.config.ts` 에서 준다. `connect-src` 의 두 도메인은 브라우저가 Supabase 인증과 Drive resumable 업로드를 직접 하기 때문이다. 그 밖에 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

### M3. 가입이 열려 있으면 누구나 세션을 얻어 문을 지난다 — 확인 필요

- **어디**: `src/proxy.ts` 는 "세션이 있는가" 만 본다(관리 화면만 `admin_user` 확인). Supabase Auth 의 가입 허용 여부는 MCP 로 볼 수 없어 **확인하지 못했다**. README "남은 일" 에 "신규 가입 끄기" 가 남아 있어 열려 있을 가능성이 크다(추정).
- **지금 막히는 것**: 비관리자 세션은 RLS 에서 public 표 **0행**(읽기·쓰기 모두). `private.is_admin()` 은 security definer + `search_path = ''` 로 안전하다. 그래서 들어와도 빈 화면이다.
- **그래도 남는 것**: "잠긴 사이트" 가 열리는 셈이고, `/api/media/*` 의 401 도 넘는다(그 뒤 file 조회가 0행이라 404). 채번 함수 rpc 도 부를 수 있다(H1 의 SQL 이 막는다).
- **고치는 법**: Supabase 대시보드 Authentication → Sign In / Providers 에서 "Allow new users to sign up" 을 끈다. Email OTP·Magic link 도 끈다. 앱에서는 `proxy.ts` 가 모든 경로에서 `admin_user` 를 확인하도록 바꾸는 것도 고려한다(요청마다 조회 하나가 늘지만 한 사람만 쓰는 사이트라 부담 없다).

---

## 낮음

### L1. 원본 프록시가 올린 때의 mime 을 그대로 Content-Type 으로 내고 nosniff 가 없다 — **고침**

> 받는 갈래와 펼치는 갈래를 `src/lib/media-types.ts` 한 곳에 모았다. 올리는 쪽(`/api/drive/session`)이 목록 밖을 400 으로 막고,
> 내보내는 쪽은 목록에 없으면 `application/octet-stream` + `attachment` 로 돌린다. 응답에 `nosniff`·`Content-Disposition`·`Content-Security-Policy: sandbox`.
> 지금 있는 파일의 mime 넷(image/jpeg·image/png·audio/wav·video/mp4)은 모두 목록 안이다.
- `src/app/api/media/[fileId]/route.ts:39`. mime 은 올릴 때 브라우저가 보낸 값 또는 Drive 메타이고 허용 목록 검사가 없다. `text/html`·`image/svg+xml` 이 올라가면 같은 출처에서 스크립트가 돈다(저장형 XSS → 세션 탈취, L10). 올리는 사람이 관리자 한 명이라 낮음.
- 고침: 응답에 `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="…"`(image/audio/video 밖은 `attachment`), `Content-Security-Policy: sandbox`. 올리는 쪽(`/api/drive/session`)에 mime 허용 목록.

### L2. 오류 본문에 Drive·Supabase 원문 메시지가 실린다 — **고침**

> 상류가 준 본문은 `console.error` 로 서버 기록에만 남기고, 응답은 고정 문구다(상태 코드는 남긴다).
- `src/app/api/media/[fileId]/route.ts:50`, `src/app/api/drive/session/route.ts:59`, `src/app/api/drive/register/route.ts:133`, `src/lib/google/drive.ts:93`. `Drive 요청이 실패했다 (403): {…구글 응답 본문…}` 이 그대로 나간다. 로그인한 사람만 본다.
- 고침: 서버 로그에만 남기고 응답은 고정 문구로.

### L3. `register` 가 검증 실패 때 요청이 준 Drive id 를 지우고, Drive 경로에 id 를 인코딩 없이 넣는다 — **고침**

> `isDriveId()`·`isArchiveName()`(`src/lib/google/naming.ts`). `register` 가 id 모양을 먼저 보고,
> `fileMeta`·`fileStream`·`deleteFile` 이 id 를 검사한 뒤 `encodeURIComponent` 로 넣는다.
> 지우기는 이 앱의 이름 규칙에 맞는 파일에만 한다.
- `src/app/api/drive/register/route.ts:95`(`deleteFile(driveFileId)`), `src/lib/google/drive.ts:209,229`(`/files/${fileId}`). 관리자 세션이 있어야 하므로 외부 공격자는 못 쓴다. 잘못된 `derivedFrom` 하나로 앱이 만든 임의 Drive 파일을 지울 수 있고, id 에 `?`·`/` 가 들어오면 API 경로가 바뀐다.
- 고침: `driveFileId` 를 `/^[\w-]+$/` 로 걸고 `encodeURIComponent` 로 넣는다. 지우기는 이름이 규칙에 맞는 파일에만.

### L4. matcher 가 `intro`·`favicon.ico` 를 접두어로만 뺀다 — **고침**

> `intro(?:/|$)`·`favicon\.ico$`. `npm start` 에서 `/introduction` `/intro-x` `/favicon.ico-x` 가 307(문 안),
> `/intro` `/favicon.ico` 는 200 인 것을 확인했다.
- `src/proxy.ts:51`. `/introduction`, `/intro-x`, `/favicon.ico-x` 는 문 밖이다(침투 시험에서 404 로 확인 — 미들웨어가 돌지 않았다는 뜻). 지금은 그런 라우트가 없어 실해 없음. 앞으로 그런 이름의 라우트가 생기면 무인증 노출된다.
- 고침: `intro(?:/|$)`, `favicon\.ico$` 로 경계를 준다. `fonts/`·`brand/` 는 슬래시가 있어 그대로 둔다.

### L5. 206 부분 응답이 `s-maxage=60` 으로 edge 에 남을 수 있다 — **고침**

> 확인하는 대신 막았다. 200 에만 `s-maxage=60`, 206 은 공개 자료라도 `private, no-store`.
- `src/app/api/media/[fileId]/route.ts:46`. Vercel 이 206 을 캐시하지 않는다고 알려져 있으나 확인하지 못했다. 잠긴 사이트에서 새는 길은 아니다(proxy 가 캐시 조회보다 먼저 돈다 — 추정).
- 고침: `status === 206` 이면 `no-store`, 200 에만 `s-maxage`.

### L6. Drive 파일 id·폴더 id 노출 — H1 에 포함
- 앱은 `drive.file` 범위이고 공유 코드가 없어 id 만으로는 못 본다(추정 — 운영자가 Drive 에서 손으로 "링크가 있는 사람" 공유를 켜지 않았다면). 그래도 영구 식별자가 exif·체크섬과 함께 나간다. H1 을 닫으면 함께 닫힌다.

### L7. 새 표는 자동으로 anon 에 전체 DML grant — H1 에 포함
- `pg_default_acl`. H1 의 `alter default privileges … revoke` 가 막는다.

### L8. Leaked Password Protection 꺼짐 — 미조치
- Supabase security advisor 의 유일한 WARN. 계정이 하나라도 켜 두는 게 낫다(대시보드 Auth → Passwords). performance advisor 는 FK 인덱스 없음 18건(INFO)뿐.

### L9. 개발 의존성 `vercel` CLI 하위에 알려진 취약점 29건 — 미조치
- `npm audit --omit=dev` **0건**. `npm audit` 29건(치명 1 `tar`, 높음 15 `undici`·`smol-toml`, 중간 12, 낮음 1) 은 전부 `vercel@^59` 의 `@vercel/container`·`@vercel/rust`·`@vercel/fun`·`@vercel/node` 경유. 배포되는 앱에는 들어가지 않는다.
- 고침: `npm audit fix --force` 는 `vercel@54` 로 **내려가므로 쓰지 않는다.** `vercel` 을 devDependencies 에서 빼고 `npx vercel@latest` 로 쓰거나 상류 패치를 기다린다.

### L10. Supabase 세션 쿠키가 `httpOnly` 가 아니다 — 구조상 기본값
- `@supabase/ssr@0.12.7` 기본(`path=/, sameSite=lax, httpOnly=false, maxAge=400일`). 브라우저 클라이언트가 쿠키를 읽어야 하는 구조라 의도된 값이다. XSS 가 생기면 JS 로 세션을 읽는다 → M2 의 CSP 가 실질 방어선.
- 고침: 지금 구조를 유지하면 CSP. `httpOnly` 로 가려면 로그인·로그아웃을 서버 액션으로만 처리하는 큰 변경. `maxAge` 는 `cookieOptions` 로 줄일 수 있다.

---

## 정보

- **속도 제한 없음** — 앱에 rate-limit 코드가 없다. 로그인은 브라우저가 Supabase Auth 를 직접 부르므로 무차별 대입 방어는 Supabase 기본 제한에 기댄다.
- **스크립트가 `.env.local` 을 직접 파싱**해 Google 시크릿을 읽는다(`scripts/tidy-videos.mjs`, `backfill-thumbs.mjs`, `rename-drive-files.mjs`, `scripts/seed/fake_cleanup.py`). 값이 파일·로그로 나가지는 않는다(확인함). `node --env-file` 로 통일하면 낫다.
- **관리자 이메일이 스크립트마다 하드코딩**돼 있다. git author 와 같은 공개 정보라 추가 노출은 아니나 `ADMIN_EMAIL` 환경변수로 빼는 편이 낫다.
- `scripts/seed/fake-manifest*.json` 이 `.gitignore` 에 없다(내용은 생성한 행의 id 뿐). 실수로 커밋될 수 있으니 추가 권장.
- `src/lib/google/drive.ts`·`src/lib/google/env.ts` 에 `import 'server-only'` 가 없다. 임포트 경로상 클라이언트에 못 들어가지만 한 줄 넣어 두면 실수를 빌드에서 잡는다.
- `src/app/admin/drive/page.tsx` 의 인라인 액션 `unlink` 와 `src/app/admin/layout.tsx` 의 `signOut` 은 관리자 확인이 없다. `unlink` 의 `app_setting` 삭제는 RLS 가 막으므로 실해 없음(메모리 토큰 캐시만 비워짐). 일관성 위해 `getAdmin()` 한 줄 권장.
- `requireAdmin()` 이 옛 주소 `/login?next=…` 로 보낸다(`src/lib/actions.ts:13` 등). 동작은 하지만 `/intro` 로 바꾸면 한 번 덜 튄다. storage 버킷 둘(`originals`·`derivatives`)은 private·객체 0·정책 0 이라 접근 불가 — 안 쓰면 지운다.

---

## 확인함 — 문제 없음

**인증 문**
- `src/proxy.ts` 는 `getUser()`(Auth 서버 검증)로 세션을 본다. 쿠키를 믿지 않는다. 화면은 307 → `/intro?next=`, `/api/*` 는 401, `/admin` 은 `admin_user` 재조회.
- 우회 시도 전부 막힘(로컬·배포지 동일): `/INTRO` `/Intro` `/%69ntro` → 307. `//search` `/search/` → 308 정규화 뒤 307. `/intro/../search` `/fonts/../search` `/brand/../item/DA-0001`(`--path-as-is`) → 307. `/fonts/..%2Fsearch` → 404. `/search%2F` → 307.
- `/_next/image?url=/api/media/…` → 400. 내부 요청이 router-server 를 거쳐 proxy 가 401 을 낸다(`next-server.js:774`). `next/image` 는 앱에서 쓰지 않는다.
- 무인증으로는 오류 경로에 닿을 수 없다: `/item/%00`, PostgREST `or()` 문법 깨기, `?type=Text'`, 5000자 `q` → 모두 307. 5000자 `next` → 200(폴백 `/`).
- OPTIONS `/api/media/x` → 401(CORS 프리플라이트 누출 없음).

**서버 쪽 코드**
- 서버 액션 21개 전부 관리자 확인: `actions.ts` 4개, `people-actions.ts` 8개, `story-actions.ts` 7개는 `requireAdmin()`, `hero-actions.ts` `updateHeroSlot` 과 `transcript-actions.ts` `saveTranscript` 는 인라인 `getAdmin()`. 쓰기는 `private.is_admin()` RLS 가 한 번 더 막는다.
- `/api/drive/session`·`register`: 첫 줄 `getAdmin()`. `derivedFrom` 이 같은 자료의 `original` 인지 두 곳 모두 확인. `role` 화이트리스트. 이름은 서버가 `naming.ts` 로 정하고 ASCII 밖은 던진다. mp4 정보는 정수·범위·정규식으로 거른다.
- `/api/google/start`·`callback`: 관리자만. `state` 는 `randomBytes(16)` + httpOnly·secure·lax·10분 쿠키로 대조. 갱신 토큰은 `app_setting` 에만 저장되고 응답으로 나가지 않는다. 범위 `drive.file` 최소.
- `/api/media`: 세션 클라이언트 + RLS 로 file 조회, 비공개는 `getAdmin()` 한 번 더 확인해 404(존재 은닉). 전달 헤더 4개뿐. Drive 주소는 나가지 않는다. 비공개 `no-store`.
- `src/lib/search.ts`: `*` 제거, `%_\` 이스케이프, 큰따옴표 감싸기 → PostgREST 주입 불가. `type` 은 `TYPE_LABEL` 키, `bundle` 은 `/^DC-\d+$/`, story id 는 UUID 정규식.
- `dangerouslySetInnerHTML`·`eval`·`next/script` 없음. 사용자 값이 `href`·`src` 에 직접 들어가는 곳 없음.

**비밀값**
- `.gitignore` 에 `.env*`(예외 `.env.example` 만). `.env.local` 미추적. git 전체 이력과 작업 트리에서 `GOCSPX`·`sb_secret_`·JWT·`AIza`·PEM·`ghp_`·`gho_`·`password=` 패턴 0건(안내 문장 2건 제외). `.env.example` 은 빈 값.
- `NEXT_PUBLIC_` 은 Supabase URL·publishable 키 둘뿐. `SUPABASE_SECRET_KEY`·`GOOGLE_OAUTH_*` 에 접두어 없음. `src/lib/supabase/admin.ts` 는 `server-only`. `next.config.ts` 의 `env` 는 빌드 시각·커밋 해시뿐.
- `.next/static`·`.next/server` 에 실제 키 길이의 매치 0건(`sb_secret_` 매치 1건은 supabase-js 의 형식 검사 문자열).
- 스크립트 7개 모두 `ADMIN_PASSWORD` 를 환경변수로만 받고 없으면 종료. 파일·로그에 쓰지 않고 세션·쿠키 파일을 남기지 않는다.
- 외부 스크립트·스타일·폰트·이미지 로드 없음. `package-lock.json` 커밋됨.

**DB**
- 22개 표 전부 RLS 켜짐. 쓰기 정책 `with_check` 누락 없음, 쓰기에 `using (true)` 없음. 마이그레이션 13건이 원격과 일치.
- `app_setting`·`admin_user`·`event_log`·`acquisition` 은 anon 정책 없음 → 0행(재현으로 확인). authenticated 비관리자도 public 표 0행.
- `private.is_admin`·`private.item_is_public` 은 security definer + `search_path = ''`. `person_relation`·`life_period` 정책의 하위 조회는 호출 role 의 person RLS 를 그대로 타 "보이는 사람" 으로 좁혀진다.
- Realtime publication 에 표 0개. storage 버킷은 private·비어 있음.
- `hero_slot.collection_id`·`collection.cover_item_id`·`curation_block.speaker_id` 로 비공개 uuid 가 샐 수 있으나 현재 데이터로 0건.

## 확인하지 못한 것

- Supabase Auth 의 **가입 허용 여부**, PostgREST exposed schemas(기본값 `public, graphql_public` 로 추정) — MCP 로 볼 수 없다. 대시보드에서 확인한다.
- Drive 쪽 파일의 실제 공유 상태(앱은 공유를 켜지 않는다).
- 인증 뒤의 오류 처리(500 본문에 `cause.message` 가 실리는지) — 로그인하지 않는 규칙에 따라 시험하지 않았다. 코드상 L2 에 해당한다.
- Vercel edge 의 206 캐시 동작(L5).

## 조치 순위 — 시급성 × 효과

시급성은 "지금 실제로 새고 있거나 공격이 쉬운가", 효과는 "닫으면 무엇이 얼마나 막히는가", 품은 고치는 데 드는 손이다.
같은 줄에 묶인 것은 한 번에 처리한다.

| 순위 | 항목 | 시급성 | 효과 | 품 | 왜 이 자리인가 |
| --- | --- | --- | --- | --- | --- |
| 1 ✓ | **H1** anon 읽기 정책·grant 제거 + 히어로 세션 클라이언트 — 고침 `b58277d` | **최고** | **최고** | 중 | 지금 이 순간 로그인 없이 실명·생몰년·주소·Drive id 가 읽힌다. 유일하게 **현재 진행형** 인 유출이다. 공개 저장소라 열린 사실도 공개돼 있다 |
| 2 | **M3** 가입 끄기 · **L8** Leaked password protection 켜기 | 높음 | 높음 | **아주 작음** | 대시보드 클릭 두 번. 열려 있으면 누구나 세션을 얻어 문을 지난다. 품이 가장 적으니 1번 작업 전에 먼저 눌러도 된다 |
| 3 ✓ | **M1** `next` 백슬래시 열린 리디렉션 — 고침 `8d11846` | 높음 | 중 | **아주 작음** | 정규식 한 글자. 피싱에 바로 쓰이는 형태이고 재현이 확인됐다. 한 사람만 쓰는 사이트라 효과는 "운영자 계정 보호" 로 한정 |
| 4 ✓ | **M2** 보안 헤더·CSP · `poweredByHeader: false` — 고침 `16d50c0` | 중 | **높음** | 작음 | 아직 XSS 는 없지만, 세션 쿠키가 `httpOnly` 가 아니라(L10) XSS 하나면 계정이 나간다. CSP 와 `frame-ancestors` 가 그 뒤를 받치는 유일한 방어선. `next.config.ts` 한 곳 |
| 5 ✓ | **L1** 원본 프록시 `nosniff`·`Content-Disposition`·mime 허용 목록 — 고침 | 낮음 | 중 | 작음 | 저장형 XSS 의 길(html·svg 업로드)을 닫는다. 4번 CSP 와 짝이다 |
| 6 ✓ | **L4** matcher 경계 · **L3** Drive id 검증·삭제 조건 · **L2** 오류 본문 고정 · **L5** 206 `no-store` — 고침 | 낮음 | 낮음 | 작음 | 넷 다 지금 실해는 없고 "앞으로 생길 구멍" 이다. 라우트 파일 세 개를 한 커밋으로 |
| 7 | **L9** `vercel` devDependency 정리 | 낮음 | 낮음 | 작음 | 배포되는 앱과 무관. audit 가 빨간 것만 없앤다 |
| 8 | 정보 항목(`server-only` 표시, `unlink`·`signOut` 확인, `/login` → `/intro`, 스크립트 env 통일, seed 매니페스트 gitignore) | 낮음 | 낮음 | 작음 | 손이 갈 때 |
| — | **L10** 세션 쿠키 `httpOnly` | 낮음 | 높음 | **큼** | 효과는 크지만 로그인 구조를 갈아엎어야 한다. 4번 CSP 로 대신하고 보류 |

세 묶음으로 보면:

- **오늘 안에** — 1·2·3. 새고 있는 것(1), 클릭 두 번(2), 한 글자(3).
- **이번 주** — 4·5. XSS 가 생겼을 때의 방어선.
- **여유 있을 때** — 6·7·8.

2 를 뺀 1·3·4·5·6 을 닫았다. 남은 것은 대시보드 일(2 = M3·L8)과 7·8 이다.

고친 항목은 이 문서의 상태를 "고침(커밋 해시)" 로 바꾼다.
