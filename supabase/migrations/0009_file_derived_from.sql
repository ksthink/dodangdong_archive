-- 썸네일은 원본에서 만든 사본이다. 어느 원본의 것인지 잇는다.
-- 원본 행이 지워지면 썸네일 행도 함께 지워진다(Drive 의 썸네일 파일은 앱이 지운다).
alter table file add column derived_from uuid references file(id) on delete cascade;
comment on column file.derived_from is
  '이 파일이 다른 파일에서 만든 사본(썸네일 따위)이면 그 원본. 원본은 NULL.';
create index file_derived_from_idx on file (derived_from);

-- 원본 하나에 썸네일은 하나만.
create unique index file_one_thumb_per_original on file (derived_from) where role = 'thumb';
