-- 손님에게 보이는 인물: 공개 자료에 "한 번이라도 나오는" 사람.
-- 등장인물(item_person)만 보던 것을 생산자(item.creator_person_id)까지 넓힌다.
-- 그러지 않으면 생산자로만 이어진 사람은 손님 화면의 상세정보 표에서 사라진다.
drop policy guest_read on person;

create policy guest_read on person for select to anon using (
  exists (
    select 1 from item_person ip join item i on i.id = ip.item_id
    where ip.person_id = person.id and i.access_level = 'public' and not i.is_archived
  )
  or exists (
    select 1 from item i
    where i.creator_person_id = person.id and i.access_level = 'public' and not i.is_archived
  )
);
