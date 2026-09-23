# 도당동 아카이브 — 데이터베이스

마이그레이션은 번호순으로 적용한다. 원격에 적용된 내용과 이 폴더가 일치한다.

| 파일 | 하는 일 |
| --- | --- |
| `0001_init.sql` | 테이블 22개, 열거형, DA·DP·DC 채번, RLS 정책 |
| `0002_harden.sql` | 정책이 쓰는 함수를 `private` 스키마로 옮기고 `search_path` 고정 |
| `0003_seed.sql` | 도당동 본가, 첫 묶음, 주제분류 여섯 갈래, 히어로 자리 셋 |
| `0004_schema_grants.sql` | `public` 재생성으로 잃은 스키마 권한 복구 |
| `0005_person_visible_as_creator.sql` | 손님에게 보이는 인물을 공개 자료의 생산자까지 넓힌다 |
| `0006_story_access.sql` | 이야기(`collection`)에 공개 범위. 비공개로 시작한다 |
| `0007_block_needs_public_source.sql` | 자료를 가리키는 이야기 블록은 공개된 출처가 있어야 손님에게 보인다 |
| `0008_relation_both_visible.sql` | 가족 관계는 양쪽 사람이 모두 보일 때만 손님에게 준다 |
| `0009_file_derived_from.sql` | 썸네일이 어느 원본의 것인지 잇는다(원본 하나에 썸네일 하나) |
| `0010_transcript_one_per_item.sql` | 자료 하나에 녹취록 하나 |
| `0011_file_media_info.sql` | 파일에 코덱·목차 위치(faststart) 칸. 역할 설명(원본·썸네일·재생용) |
| `0012_one_stream_per_original.sql` | 원본 하나에 재생용(stream) 하나 |
| `0013_tags_retired.sql` | 자유어 태그(`item.tags`)를 접는다 — 주제는 주제분류로만. 적힌 값은 남긴다 |
| `0014_close_guest_read.sql` | 손님(anon) 읽기를 걷어낸다 — guest_read 정책·표 권한·기본 권한 전부. 사이트가 잠겼으니 DB 도 잠근다 |

## 권한 규칙

- 쓰기는 `private.is_admin()` 뿐이다 — `admin_user` 에 등록된 uid만.
- **손님(anon)은 아무것도 읽지 못한다**(0014). 정책도 표 권한도 없어 REST 는 401 이다. 사이트 자체가 로그인해야 열린다(`src/proxy.ts`).
- 로그인했지만 `admin_user` 에 없는 사람도 0행이다 — 모든 정책이 `private.is_admin()` 뿐이다.
- `access_level` 은 이제 "첫 화면 히어로에 걸릴 수 있는가" 의 뜻이다(`src/lib/hero.ts` 가 직접 거른다). 0005·0007·0008 의 "손님에게 보이는" 규칙은 0014 로 정책이 사라져 더는 돌지 않는다.

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
