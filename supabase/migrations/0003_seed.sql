-- 되살린 두 행 + 첫 분류 뼈대

insert into place (family_name, admin_name, note)
values ('도당동 본가', '경기 부천시 원미구 도당동', '아카이브의 이름이 된 곳.');

insert into acquisition (visited_on, from_label, location, note)
values ('2026-09-18', '전화번호부', '도당동 본가', '전화번호부');

insert into bundle (acquisition_id, title, kind, source, provenance,
                    place_id, period_edtf, period_start, period_end, default_access_level)
select a.id, '할머니의 전화번호부', 'roll', '큰집', '할머니에게 직접 받음',
       p.id, '1989', '1989-01-01', '1989-12-31', 'private'
from acquisition a, place p
where a.from_label = '전화번호부' and p.family_name = '도당동 본가';

-- 주제분류: 상위 여섯 갈래 (0건이어도 목록에서 지우지 않는다)
insert into subject (label, sort_order) values
  ('명절·기념일', 1), ('혼례', 2), ('학교', 3), ('일·농사', 4), ('음식', 5), ('이사', 6);

-- 히어로 자리 셋: 편성 전에는 자동이 채운다
insert into hero_slot (slot, auto_kind) values (1, 'story'), (2, 'today'), (3, 'recent');
