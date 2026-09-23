-- 관리 첫 화면의 Supabase 칸이 쓸 표별 내역. 표마다 몇 행에 몇 바이트인지.
-- 행 수는 세어서 정확히 준다(이 아카이브는 작다). 크기는 딸린 것(인덱스·toast)까지 더한 값이다.
create function public.db_tables()
  returns table (name text, rows bigint, bytes bigint)
  language plpgsql stable security definer set search_path = '' as
$$
declare r record; n bigint;
begin
  if not private.is_admin() then
    raise exception '관리자만 볼 수 있다.' using errcode = '42501';
  end if;
  for r in
    select c.oid, c.relname::text as relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('select count(*) from public.%I', r.relname) into n;
    name := r.relname;
    rows := n;
    bytes := pg_catalog.pg_total_relation_size(r.oid);
    return next;
  end loop;
end
$$;

revoke execute on function public.db_tables() from public, anon;
grant execute on function public.db_tables() to authenticated;
