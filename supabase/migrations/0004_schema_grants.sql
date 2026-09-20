-- public 스키마를 새로 만들면서 잃은 권한을 되돌린다.
-- drop schema public cascade 뒤에는 이 권한들이 자동으로 돌아오지 않는다.
grant usage on schema public to supabase_auth_admin, authenticator, dashboard_user, supabase_storage_admin;
