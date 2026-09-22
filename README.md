# 도당동 아카이브

한 집안의 사진·편지·음성·영상과 그에 얽힌 사건을 더블린코어(Dublin Core) 15요소로 기술하고 보여 주는 아카이브.

- 사이트: https://dodangdong-archive.vercel.app
- 첫 화면은 로그인 화면이 아니라 아카이브 그 자체다. 손님은 로그인 없이 공개 자료를 본다.
- 자료를 올리고 고치고 지우는 것은 **관리자 한 사람**만 한다. 가입 화면은 없다.

## 무엇을 하나

### 손님 화면

| 경로 | |
| --- | --- |
| `/` | 첫 화면. 히어로(이야기 세 자리), 찾기, 형태분류, 이야기, 최근 등록 |
| `/search` | 자료 찾기. 낱말·형태분류·묶음(`?bundle=DC-003`)으로 거른다 |
| `/item/DA-0001` | 자료 상세. 원본(사진·음성·영상), 녹취록, 더블린코어 상세정보 표 |
| `/people` | 인물. **목록**과 **가계도**(`?view=tree`) 두 보기 |
| `/people/DP-001` | 인물 상세. 사실, 생애 띠, 나오는 자료·만든 자료 |
| `/chronicle` | 연표. 연대 막대 → 해별 펼침(집안 일·자료·바깥 세상), 여러 사람의 생애 띠 |
| `/story`, `/story/[id]` | 이야기. 글·소제목·자료·사진 묶음·구술 인용·연표 블록을 엮은 읽을거리 |

### 관리 화면 (`/admin`, 로그인 필요)

| 경로 | |
| --- | --- |
| `/admin/items` | 자료 목록·등록·수정·삭제. 원본 올리기, 녹취록 |
| `/admin/people` | 인물, 인생 시기, 가족 관계(부모·배우자) |
| `/admin/stories` | 이야기 편집(블록 추가·순서·공개 범위) |
| `/admin/hero` | 첫 화면 히어로 편성 |
| `/admin/drive` | Google Drive 연결 |

### 기능별 규칙

- **히어로**: 자리 셋. 각 자리는 다음 순서로 채운다. 같은 이야기는 두 번 나오지 않고, 자동으로 넘기지 않는다.
  1. 기간 안의 편성 이야기
  2. 그 자리에 정한 자동 종류
  3. "오늘, N년 전"(날짜가 확인된 자료, 한국 날짜 기준)
  4. 가장 최근 이야기
- **녹취록**: 음성·영상 자료에 하나씩 붙는다. 한 줄이 한 구간이다.
  ```
  [00:12] 할머니: 그때는 전화가 동네에 한 대뿐이었어.
  [1:02:05] 나: 그럼 어디서 걸었어요?
  (웃음)
  ```
  - `[분:초]`는 재생 위치가 된다. 손님이 시각을 누르면 그 자리부터 재생한다.
  - `이름: `은 말한 사람이 된다.
  - 원문은 적은 그대로 두고, 구간은 저장할 때 다시 만든다.
- **가계도**: 부모·배우자 관계로 "나"(관계 칸이 `나`인 사람)와 이어진 사람을 세대별로 쌓는다.
  - 친가와 외가는 부모의 혼인에서 만난다.
  - 이어지지 않은 사람(측근·지인 등)은 "가계도 밖의 인물"로 따로 모인다.

## 기술 규칙

- **식별자**: `DA-####`(자료), `DP-###`(인물), `DC-###`(묶음). DB 가 매긴다.
- **날짜**: EDTF 로 적는다.
  - `1978`, `1978-05-14`, `1978?`, `1978~`, `197X`, `19XX`, `1975/1979` 를 쓸 수 있다.
  - 연표에서 `197X` 는 1975년에, 기간은 시작한 해에 놓는다. 세기만 아는 날짜(`19XX`)는 연표에 놓지 않는다.
  - 증빙으로 확인한 날짜에만 "확인됨" 인장을 붙인다. 읽는 곳은 `src/lib/edtf.ts`.
- **공개 범위**: 공개·비공개 두 단계. 자료와 이야기 모두 비공개로 시작한다.
  - 손님에게 보이는 인물은 공개 자료에 한 번이라도 나오거나 공개 자료를 만든 사람이다.

## 생김새

- 흑백 픽셀 아트. 모든 선은 2px, 모서리는 직각, 그림자는 흐림 없는 4px 계단이다.
- 글꼴은 **갈무리**(Galmuri)만 쓴다. 본문 24px, 보조 글 15px(Galmuri14), 기계 값 12px 이다.
- 색은 먹색과 종이색 둘이다. 인장색 `mark` 는 "확인됨"에만 쓰고, 연표에만 저채도 팔레트가 있다.

색·글자·간격·컴포넌트·화면별 규칙은 스크린샷과 함께 **[DESIGN.md](DESIGN.md)** 에 적었다.
토큰의 원천은 `design/tokens.json` 이다.

```bash
npm run tokens    # design/tokens.json → src/app/tokens.css (직접 고치지 않는다)
```

## 구성

| | |
| --- | --- |
| 앱 | Next.js 16 App Router, React 19. 배포는 Vercel |
| 메타데이터 | Supabase(Postgres + Auth + RLS) |
| 원본 파일 | Google Drive(`drive.file` 권한만) |

- **권한은 DB 가 정한다.** 쓰기는 `private.is_admin()` 뿐이고, 손님(anon)은 공개 자료와 거기 딸린 행만 받는다.
  - 비공개는 행 자체가 오지 않으므로 목록·연표·건수·가계도에서 저절로 빠진다.
  - 서버 액션도 모두 관리자인지 다시 확인한다.
  - 자세한 규칙과 마이그레이션 목록은 [`supabase/README.md`](supabase/README.md) 에 있다.
- **원본은 Drive 에 그대로 둔다.** 브라우저가 resumable 세션으로 Drive 에 직접 올리고, 앱은 파일 id 만 적는다.
  - `file.storage_path` 가 곧 Drive 파일 id 다.
  - 원본은 늘 `/api/media/[fileId]` 를 거쳐 나간다. 이 프록시가 공개 범위를 한 번 더 확인하고, Range 요청(음성·영상 탐색)을 넘긴다.
  - 공개 자료는 edge 에 60초 캐시하고, 비공개 자료는 어디에도 남기지 않는다.
- **썸네일**: 사진을 올리면 브라우저가 긴 변 480px JPEG 사본을 함께 만든다(`role = 'thumb'`, `derived_from` = 원본).
  - 목록은 썸네일, 상세는 원본을 쓴다.
  - 브라우저가 못 여는 형식(TIFF 스캔본)이나 예전 사진은 `scripts/backfill-thumbs.mjs` 로 채운다.
- **`src/proxy.ts`**: Next 16 에서 middleware 를 대신한다. `/admin/*` 에만 문을 달고, 공개 구간은 타지 않는다.

## 시작하기

```bash
cp .env.example .env.local   # 아래 값을 채운다
npm install
npm run dev
```

| 변수 | 어디서 쓰나 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저·서버 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저·서버 |
| `SUPABASE_SECRET_KEY` | 서버 전용. Drive 토큰(`app_setting`)을 읽는 데만 쓴다. **이게 없으면 손님이 원본을 받지 못한다** |
| `GOOGLE_OAUTH_CLIENT_ID` | 서버 전용 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 서버 전용 |

- 서버 전용 값에는 `NEXT_PUBLIC_` 을 붙이지 않는다. 붙이면 브라우저 번들에 들어간다.
- `NEXT_PUBLIC_*` 는 빌드할 때 값이 박힌다. 바꾸면 다시 배포해야 한다.
- Google Cloud 의 OAuth 클라이언트에는 승인된 리디렉션 URI 로 `https://<도메인>/api/google/callback` 을 한 글자도 다르지 않게 적는다. 로컬은 `http://localhost:3000/api/google/callback` 이다.
- 관리자로 로그인한 뒤 `/admin/drive` 에서 Drive 를 한 번 연결하면 된다. 갱신 토큰은 `app_setting` 에 남는다.
- 관리자 계정은 Supabase 에서 만들고 `admin_user` 에 넣는다. 방법은 [`supabase/README.md`](supabase/README.md) 에 있다.

```bash
npm run lint
npm run build && npm run start
```

## 스크립트

| | |
| --- | --- |
| `npm run tokens` | 디자인 토큰 → `src/app/tokens.css` |
| `node scripts/backfill-thumbs.mjs` | 빠진 썸네일을 채운다(`--dry-run` 으로 먼저 본다) |
| `scripts/seed/` | 가상 시험 자료를 넣고 지운다. 무엇이 들어 있는지는 [`scripts/seed/README.md`](scripts/seed/README.md) 에 있다 |

- 관리자 권한이 필요한 스크립트는 비밀번호를 `ADMIN_PASSWORD` 환경변수로만 받는다. 어떤 파일에도 쓰지 않는다.

```bash
ADMIN_PASSWORD='…' node scripts/backfill-thumbs.mjs --dry-run
```

## 폴더

```
src/
  app/            화면과 API(route.ts). admin/ 아래가 관리 화면
    api/media/    원본 프록시
    api/drive/    업로드 세션·등록
    api/google/   Drive 연결(OAuth)
  components/     히어로, 생애 띠, 가계도, 녹취록 보기 등
  lib/            서버 액션(*-actions.ts), EDTF·녹취록·가계도 계산, Supabase·Drive 클라이언트
  proxy.ts        /admin 문지기
supabase/migrations/  스키마·권한(번호순, 원격과 일치)
design/tokens.json    디자인 토큰 원천
docs/design/          DESIGN.md 의 스크린샷
scripts/              토큰 생성, 썸네일 채우기, 시험 자료
```

## 원칙

- **기록이 주인공이다.** 픽셀 장식을 더하지 않는다.
- **메타데이터는 숨기지 않는다.** 상세정보 표를 설명 바로 아래에 펼쳐 보인다.
- **모르는 것은 모른다고 쓴다.** 추정 날짜는 `?` 와 `~` 로, 빈 요소는 "기록 없음"으로 쓴다. 값을 지어내지 않는다.
- **비공개는 조용히 빠진다.** 자물쇠 표시도, "N건 숨김" 안내도 없다. RLS 가 행 자체를 주지 않는다.
- **움직이지 않는다.** 전환 효과도 자동 넘김도 없다. 상태는 한 번에 바뀐다.

## 이 저장소에서 작업할 때

- Next.js 16 은 이전 버전과 API·관례가 다르다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 안내를 읽는다([`AGENTS.md`](AGENTS.md)).
  - `params` 와 `searchParams` 는 Promise 다.
  - middleware 대신 `proxy.ts` 를 쓴다.
- `redirect()` 에 한글을 그대로 넣지 않는다. `withQuery()`(`src/lib/url.ts`)로 인코딩한다. 그대로 넣으면 Location 헤더가 깨져 500 이 난다.
- 공개 저장소다. 비밀값(관리자 비밀번호, Google 시크릿, `sb_secret_…`)은 커밋하지 않는다.
