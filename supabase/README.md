# 도당동 아카이브 — 데이터베이스

마이그레이션은 번호순으로 적용한다. 원격에 적용된 내용과 이 폴더가 일치한다.

| 파일 | 하는 일 |
| --- | --- |
| `0001_init.sql` | 테이블 22개, 열거형, DA·DP·DC 채번, RLS 정책 |
| `0002_harden.sql` | 정책이 쓰는 함수를 `private` 스키마로 옮기고 `search_path` 고정 |
| `0003_seed.sql` | 도당동 본가, 첫 묶음, 주제분류 여섯 갈래, 히어로 자리 셋 |
| `0004_schema_grants.sql` | `public` 재생성으로 잃은 스키마 권한 복구 |

## 권한 규칙

- 쓰기는 `private.is_admin()` 뿐이다 — `admin_user` 에 등록된 uid만.
- 손님(anon)은 `access_level = 'public'` 자료와 거기 딸린 행만 읽는다. 비공개는 행 자체가 오지 않으므로 목록·연표·건수에서 저절로 빠진다.
- `acquisition` · `admin_user` · `app_setting`(Google Drive 토큰) · `event_log` 에는 손님 정책이 없다 — 한 행도 주지 않는다.

## 관리자 계정 만들기

계정은 하나뿐이고 가입 화면은 없다. 새로 만들 때는 Supabase 대시보드에서 사용자를 추가한 뒤
그 uid 를 `admin_user` 에 넣는다.

```sql
insert into admin_user (user_id, label)
select id, '이름' from auth.users where email = '...';
```

SQL 로 직접 `auth.users` 에 넣는다면 토큰 컬럼을 NULL 로 두지 말 것.
GoTrue 가 빈 문자열을 기대하므로 NULL 이면 로그인이 500(`Database error querying schema`)으로 실패한다.

```sql
update auth.users set
  confirmation_token = '', recovery_token = '', email_change = '',
  email_change_token_new = '', email_change_token_current = '',
  phone_change = '', phone_change_token = '', reauthentication_token = ''
where email = '...';
```

## 남은 일

- 대시보드에서 **신규 가입 끄기**(Authentication → Sign Ups). 지금도 가입한 계정은 `admin_user` 에 없으면 쓰지 못하지만, 계정 자체가 늘지 않게 막는 편이 낫다.
- Google Drive 리프레시 토큰을 `app_setting` 에 넣기.
