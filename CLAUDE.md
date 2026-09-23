# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

도당동 아카이브 — 한 집안의 사진·편지·음성·영상을 더블린코어 15요소로 기술해 두는 곳.
사람이 읽는 안내는 [README.md](README.md), 디자인 규칙은 [DESIGN.md](DESIGN.md), DB 규칙은
[supabase/README.md](supabase/README.md) 에 있다. 여기에는 그 문서들이 말하지 않는 것,
코드를 여러 개 읽어야 알 수 있는 것만 적는다.

## 명령

```bash
npm run dev       # 개발 서버
npm run build     # 타입 검사까지 한다. 고친 뒤 반드시 통과시킨다
npm run lint      # eslint (next/core-web-vitals + react-hooks)
npm start         # 빌드한 것을 3000 포트로 띄운다. 화면 확인은 여기서 한다
npm run tokens    # design/tokens.json → src/app/tokens.css
```

**시험 코드가 없다.** 단위 시험 틀을 두지 않았다. 고친 것은 `npm run lint && npm run build` 를
통과시킨 뒤, `npm start` 로 띄워 **실제 화면에서 확인한다**.

주의: `npm run build` 는 `✓ Compiled successfully` 를 찍은 **뒤에** 타입 검사를 한다
(`Running TypeScript …`). 거기서 나는 오류는 `src/...: error TS2345:` 와 `Failed to type check.` 로
소문자다 — 출력을 `grep -E "Compiled successfully|Error"` 처럼 걸러 보면 **실패를 놓친다.**
종료 코드(`${PIPESTATUS[0]}`)를 보거나 마지막 20줄을 그대로 본다. Turbopack 이 앞선 결과를
재활용하므로, 못 미덥거든 `rm -rf .next` 하고 다시 돌린다.

화면 확인에 쓸 Playwright 는 이 컴퓨터의 `/home/ubuntu/designlab/node_modules` 에 있고, 브라우저는
`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` 이다. 스크립트를 그 디렉터리에 두고
`executablePath` 를 넘겨 쓴다.

주의: **chrome-headless-shell 은 `prefers-reduced-motion: reduce` 로 동작한다.** 인트로 연출을
확인하려면 전체 chromium 을 쓰고 `reducedMotion: 'no-preference'` 를 준다.

DB 는 Supabase MCP 도구로 본다(`list_projects` → `execute_sql`, `apply_migration`).
마이그레이션은 `supabase/migrations/` 에 같은 이름으로 함께 남기고, `supabase/README.md` 표에 한 줄 더한다.

관리자 권한이 필요한 스크립트는 비밀번호를 `ADMIN_PASSWORD` 환경변수로만 받는다. 어떤 파일에도 쓰지 않는다.

## 큰 그림

자료 하나는 **세 곳**에 나뉘어 산다. 셋을 같이 보지 않으면 코드가 이해되지 않는다.

| | 무엇이 | 어디에 |
| --- | --- | --- |
| 기술(더블린코어) | `item`, `person`, `story`, `item_person` … | Supabase Postgres |
| 원본 바이트 | 사진·음성·영상 파일 | Google Drive(`drive.file` 권한만) |
| 둘을 잇는 것 | `file.storage_path` = Drive 파일 id | Supabase `file` 표 |

### 문 (`src/proxy.ts`)

Next 16 에는 middleware 가 없다. `proxy.ts` 가 그 자리다. **인트로(`/intro`)와 그 화면이 쓰는
정적 파일(`/fonts/*`, `/brand/*`)을 뺀 모든 길**에 문이 달려 있다.

- 세션이 없으면 `/intro?next=<가려던 곳>` 으로 보낸다. `/api/*` 는 화면이 아니므로 401 을 준다.
- `/admin/*` 은 거기에 더해 `admin_user` 에 있는지 확인한다.
- `/login` 은 `/intro` 로 보내는 줄 하나만 남은 옛 주소다.

즉 **손님 읽기는 없다.** DB 도 같다 — 0014 에서 `anon` 의 정책·표 권한·기본 권한을 전부 걷어냈으므로
publishable 키만으로는 REST 가 401 이다. 코드와 주석에 남아 있는 "손님" 은 옛 개념이고, `access_level`
은 이제 "첫 화면 히어로에 걸리는가" 의 뜻만 갖는다(`src/lib/hero.ts` 가 직접 거른다).

### 권한

**권한은 DB 가 정한다.** 쓰기는 `private.is_admin()` 뿐이다. 서버 액션(`src/lib/*-actions.ts`)도
저마다 관리자인지 다시 확인한다. 비공개 자료는 RLS 가 행 자체를 주지 않으므로 목록·연표·건수·
가계도에서 **저절로** 빠진다 — 화면 코드에서 거르지 않는다. 자물쇠도 "N건 숨김" 도 두지 않는다.

### 파일이 오가는 길

올릴 때 바이트는 **브라우저에서 Drive 로 곧장** 간다. 서버는 세션 주소를 열어 주고, 끝난 뒤 id 를 적는다.

```
브라우저 ──POST /api/drive/session──▶ 서버(이름을 정한다) ──▶ Drive resumable 주소
        ──PUT 바이트────────────────▶ Drive
        ──POST /api/drive/register──▶ 서버(file 행을 적는다)
```

- Drive 이름 규칙은 `src/lib/google/naming.ts` 하나에 모여 있고 **ASCII 만 받는다**(한글이 들어오면 던진다).
- `file.role` 은 넷이다: `original`(보존) · `thumb`(목록용 480px) · `stream`(재생 규격 영상 사본) ·
  `face`(인물 얼굴, 사진 원본에서 잘라낸 256px). 파생 파일은 `derived_from` 으로 원본을 가리킨다. 영상은 규격(MP4·H.264·AAC·moov 앞) 밖이면
  원본을 그대로 두고 `stream` 을 따로 붙인다 — 서버에서 변환하지 않는다.
- 내려갈 때는 **늘 `/api/media/[fileId]`** 를 거친다. 이 프록시가 공개 범위를 한 번 더 확인하고
  Range 요청을 넘긴다. Drive 주소를 화면에 직접 내지 않는다.

### 계산이 들어 있는 곳

`src/lib/` 의 순수 함수들이 화면의 어려운 부분을 맡는다. 화면을 고치기 전에 여기를 본다.

| | |
| --- | --- |
| `edtf.ts` | EDTF 파서. `1978?` `197X` `1975/1979` 를 연도·정밀도로 푼다. 연표·생애 띠·나이가 모두 이것을 쓴다 |
| `family-tree.ts` | 가계도 배치(세대 BFS → 부부 묶기 → barycenter 정렬 → PAV 로 x 좌표). 가계도 밖 인물도 함께 돌려준다 |
| `transcript.ts` | 녹취록 파서. 한 줄이 한 구간이고, `[분:초]` 는 재생 위치, `이름:` 은 화자다 |
| `hero.ts` | 첫 화면 히어로 세 자리를 고르는 규칙 |
| `mp4.ts` | 브라우저에서 mp4 머리를 읽어 코덱·크기·faststart 를 본다 |

## 함정

- **`params`·`searchParams` 는 Promise 다.** `await` 한다.
- **`redirect()` 에 한글을 그대로 넣지 않는다.** `withQuery()`(`src/lib/url.ts`)로 인코딩한다.
  그냥 넣으면 Location 헤더가 깨져 500 이 난다.
- **`src/app/tokens.css` 를 직접 고치지 않는다.** `design/tokens.json` 을 고치고 `npm run tokens`.
- **`globals.css` 에 `* { transition: none !important; animation: none !important }` 가 있다.**
  사이트는 움직이지 않는다는 규칙이다. 어딘가에 애니메이션을 넣었는데 돌지 않으면 이것 때문이다.
  예외는 인트로 하나뿐이고, `.intro` 안에서 `!important` 로 되돌려 쓴다.
- **글꼴은 갈무리뿐이다.** 픽셀 글꼴이라 12·15·24·36·48px 에서만 선명하다. 그 밖의 크기를 쓰지 않는다.
- **인트로 로고는 216px 에 고정이다.** 그림 속 줄무늬가 그 크기에서 화면 주사선과 같은 3px 주기가 된다.
  크기를 바꾸면 두 결이 어긋나 로고만 따로 논다.
- **`next.config.ts` 가 빌드할 때 `BUILT_AT`·`COMMIT` 을 박는다.** 인트로의 `RELEASE …` 줄이 이것이다.
  화면에서 시각을 다시 재지 않으므로 서버와 브라우저가 늘 같은 값을 그린다.
- **CSP 가 걸려 있다**(`next.config.ts`). 바깥 스크립트·글꼴·그림·API 를 새로 쓰면 그 출처를 `csp` 에
  더해야 한다. 안 그러면 조용히 막힌다 — 브라우저 콘솔의 "Content Security Policy" 줄을 본다.
- **공개 저장소다.** 관리자 비밀번호·Google 시크릿·`sb_secret_…` 를 커밋하지 않는다.
  `NEXT_PUBLIC_` 접두어를 서버 전용 값에 붙이지 않는다.

## 글

- 코드 주석·커밋 메시지·화면 문구를 모두 **한국어 해라체**로 쓴다("…한다", "…하지 않는다").
- 주석은 *무엇을* 이 아니라 *왜* 를 적는다. 이미 그렇게 쓰여 있으니 둘레를 보고 맞춘다.
- 커밋 메시지 첫 줄은 무엇을 했는지 한 줄, 그 아래에 까닭을 적는다.
