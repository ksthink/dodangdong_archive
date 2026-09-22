-- 이야기에도 공개 범위를 둔다. 자료처럼 비공개로 시작하고 관리자가 공개로 바꾼다.
-- 이전에는 collection 과 curation_block 을 손님이 모두 읽을 수 있어서,
-- 쓰는 중인 이야기가 만들자마자 공개 화면에 드러났다.
alter table collection add column access_level access_level not null default 'private';
comment on column collection.access_level is '새 이야기는 비공개로 시작한다. 비공개 이야기는 손님에게 행이 가지 않는다.';

drop policy guest_read on collection;
create policy guest_read on collection for select to anon using (access_level = 'public');

drop policy guest_read on curation_block;
create policy guest_read on curation_block for select to anon using (
  exists (select 1 from collection c where c.id = curation_block.collection_id and c.access_level = 'public')
);
