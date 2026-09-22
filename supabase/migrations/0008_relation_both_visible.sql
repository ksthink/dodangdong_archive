-- 가족 관계는 양쪽 사람이 모두 손님에게 보일 때만 준다.
-- 이전 정책은 from 쪽만 보아서, 보이는 사람 → 숨은 사람 관계가 있으면
-- 숨은 사람의 uuid 와 관계 종류가 손님에게 갔다. (person 표의 RLS 가
-- 그 사람 행을 숨겨도, 관계 행 자체에 id 가 적혀 있다.)
drop policy guest_read on person_relation;

create policy guest_read on person_relation for select to anon using (
  exists (select 1 from person p where p.id = person_relation.from_person_id)
  and exists (select 1 from person p where p.id = person_relation.to_person_id)
);
