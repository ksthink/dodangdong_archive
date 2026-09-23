-- 관리 첫 화면의 "저장소" 칸이 쓸 DB 크기. pg_database_size 는 PostgREST 로 곧장 부를 수 없어
-- 함수 하나로 감싼다. 관리자가 아니면 던진다 — 크기도 남에게 알릴 것이 아니다.
create function public.db_size() returns bigint
  language plpgsql stable security definer set search_path = '' as
$$
begin
  if not private.is_admin() then
    raise exception '관리자만 볼 수 있다.' using errcode = '42501';
  end if;
  return pg_catalog.pg_database_size(pg_catalog.current_database());
end
$$;

revoke execute on function public.db_size() from public, anon;
grant execute on function public.db_size() to authenticated;
