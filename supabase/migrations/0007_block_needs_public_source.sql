-- 자료를 가리키는 블록(자료·사진 묶음·구술 인용)은, 가리키는 자료 중 공개된 것이
-- 하나라도 있어야 손님에게 보인다. 그러지 않으면 비공개 자료를 인용한 구술 블록의
-- 인용문이 그대로 드러난다 — 참조 행은 숨겨져도 블록의 글은 남기 때문이다.
-- 손님 쪽에서는 "참조가 없던 블록"과 "참조가 모두 숨겨진 블록"을 구분할 수 없으니
-- 화면이 아니라 여기서 막는다.
drop policy guest_read on curation_block;

create policy guest_read on curation_block for select to anon using (
  exists (select 1 from collection c where c.id = curation_block.collection_id and c.access_level = 'public')
  and (
    curation_block.kind in ('text', 'heading', 'timeline')
    or exists (
      select 1 from curation_ref r join item i on i.id = r.item_id
      where r.block_id = curation_block.id and i.access_level = 'public' and not i.is_archived
    )
  )
);
