-- 보안 경고 정리
--  1) 정책이 쓰는 security definer 함수를 private 스키마로 옮긴다.
--     PostgREST 는 public 만 노출하므로 /rest/v1/rpc 로 부를 수 없게 되고,
--     정책 안에서는 그대로 동작한다.
--  2) 모든 함수에 search_path 를 고정한다.

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create function private.is_admin() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.admin_user where user_id = auth.uid()) $$;

create function private.item_is_public(p_item_id uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (
       select 1 from public.item i
       where i.id = p_item_id and i.access_level = 'public' and not i.is_archived
     ) $$;

-- 기존 정책을 모두 떼고 private 함수로 다시 건다
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function public.is_admin();
drop function public.item_is_public(uuid);

do $$
declare t text;
begin
  foreach t in array array[
    'admin_user','app_setting','person','person_relation','life_period','place','subject',
    'acquisition','bundle','item','file','item_person','item_subject','item_life_period',
    'transcript','collection','item_collection','curation_block','curation_ref',
    'hero_slot','world_event','event_log'
  ] loop
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t);
  end loop;
end $$;

create policy guest_read on item             for select to anon using (access_level = 'public' and not is_archived);
create policy guest_read on file             for select to anon using (private.item_is_public(item_id));
create policy guest_read on transcript       for select to anon using (private.item_is_public(item_id));
create policy guest_read on item_person      for select to anon using (private.item_is_public(item_id));
create policy guest_read on item_subject     for select to anon using (private.item_is_public(item_id));
create policy guest_read on item_life_period for select to anon using (private.item_is_public(item_id));
create policy guest_read on item_collection  for select to anon using (private.item_is_public(item_id));
create policy guest_read on curation_ref     for select to anon using (private.item_is_public(item_id));

create policy guest_read on bundle for select to anon using (
  not is_archived and exists (
    select 1 from item i where i.bundle_id = bundle.id and i.access_level = 'public' and not i.is_archived));

create policy guest_read on person for select to anon using (
  exists (select 1 from item_person ip join item i on i.id = ip.item_id
          where ip.person_id = person.id and i.access_level = 'public' and not i.is_archived));
create policy guest_read on person_relation for select to anon using (
  exists (select 1 from person p where p.id = person_relation.from_person_id));
create policy guest_read on life_period for select to anon using (
  exists (select 1 from person p where p.id = life_period.person_id));

create policy guest_read on subject        for select to anon using (true);
create policy guest_read on place          for select to anon using (true);
create policy guest_read on world_event    for select to anon using (true);
create policy guest_read on collection     for select to anon using (true);
create policy guest_read on curation_block for select to anon using (true);
create policy guest_read on hero_slot      for select to anon using (true);

-- search_path 고정
create or replace function next_item_identifier() returns text
  language sql volatile set search_path = '' as
  $$ select 'DA-' || lpad(nextval('public.item_identifier_seq')::text, 4, '0') $$;
create or replace function next_person_identifier() returns text
  language sql volatile set search_path = '' as
  $$ select 'DP-' || lpad(nextval('public.person_identifier_seq')::text, 3, '0') $$;
create or replace function next_bundle_identifier() returns text
  language sql volatile set search_path = '' as
  $$ select 'DC-' || lpad(nextval('public.bundle_identifier_seq')::text, 3, '0') $$;
create or replace function touch_modified() returns trigger
  language plpgsql set search_path = '' as
  $$ begin new.modified_at = now(); return new; end $$;
