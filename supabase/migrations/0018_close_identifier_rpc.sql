-- 채번 함수를 손님에게서 마저 걷는다.
--
-- 0014 가 `revoke execute on all functions … from anon` 을 돌렸는데도 손님이 아직 부를 수 있었다.
-- 함수는 만들 때 PUBLIC 에 실행 권한이 기본으로 붙기 때문이다(proacl 의 `=X/postgres`) —
-- anon 은 제 권한이 아니라 PUBLIC 을 타고 지나간다. PUBLIC 에게서 걷어야 닫힌다.
--
-- 파괴적인 구멍은 아니었다. 표 권한이 없어 행은 만들지 못하고 번호만 앞으로 돌릴 수 있었다.
-- authenticated 는 그대로 둔다 — 채번은 컬럼 default 라 넣는 사람(관리자)의 권한으로 돈다.
revoke execute on function public.next_item_identifier()   from public, anon;
revoke execute on function public.next_person_identifier() from public, anon;
revoke execute on function public.next_bundle_identifier() from public, anon;

-- 앞으로 만드는 함수도 PUBLIC 에게 주지 않는다.
alter default privileges for role postgres in schema public revoke execute on functions from public;
