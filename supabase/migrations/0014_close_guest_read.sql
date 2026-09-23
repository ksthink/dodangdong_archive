-- 손님(anon) 읽기를 걷어낸다.
--
-- 앱은 인트로(/intro) 하나로 사이트 전체를 잠갔다(src/proxy.ts) — 로그인하지 않은 사람에게는
-- 어떤 화면도 열리지 않는다. 그런데 DB 에는 0002 에서 만든 guest_read 정책이 그대로 있어,
-- 브라우저에 실리는 publishable 키만 들고 REST 를 곧장 부르면 공개 자료·인물 실명·Drive 파일 id·
-- 집안 주소가 로그인 없이 읽혔다(SECURITY.md H1). 앱의 문과 DB 의 문을 맞춘다.
--
-- anon 에게서 정책·표 권한·시퀀스·함수·기본 권한을 모두 거둔다. authenticated 는 건드리지 않는다 —
-- 식별자 채번(next_*_identifier)은 컬럼 default 라 넣는 사람(관리자)의 권한으로 돈다.
-- 비관리자 로그인 사용자는 지금도 RLS 가 0행을 준다(admin_all 은 private.is_admin() 뿐).

do $$
declare r record;
begin
  for r in select tablename from pg_policies where schemaname = 'public' and policyname = 'guest_read' loop
    execute format('drop policy guest_read on public.%I', r.tablename);
  end loop;
end $$;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- 앞으로 만드는 표·시퀀스·함수도 anon 에게 주지 않는다.
-- (RLS 를 켜지 않은 새 표가 생겨도 손님이 읽거나 쓰지 못한다.)
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- private.is_admin() · private.item_is_public() 은 정책 안에서만 쓴다. anon 은 정책이 없으니 필요 없다.
revoke usage on schema private from anon;
