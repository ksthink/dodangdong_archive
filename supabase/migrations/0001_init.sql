-- 도당동 아카이브 — 최초 스키마
-- 한 집안의 자료를 더블린코어 15요소로 기술한다.
-- 관리자는 한 사람이고, 그 사람만 쓴다. 손님은 공개 자료만 읽는다.

-- ─────────────────────────────────────────── 열거형

create type access_level         as enum ('public', 'private');
create type dcmi_type            as enum ('StillImage','Sound','MovingImage','Text','PhysicalObject','Collection','Event');
create type date_precision       as enum ('day','month','year','decade','century','interval','unknown');
create type bundle_kind          as enum ('album','roll','bundle','tape','folder','single');
create type file_role            as enum ('original','display','thumb','stream','poster');
create type storage_provider     as enum ('gdrive','supabase');
create type person_role          as enum ('depicted','photographer','author','recipient','speaker','mentioned');
create type person_relation_kind as enum ('parent','spouse');
create type curation_block_kind  as enum ('text','heading','record','gallery','quote','timeline');
create type hero_auto_kind       as enum ('today','recent','story');
create type collection_kind      as enum ('topic','event','story');

comment on type access_level is '공개 범위는 둘뿐이다. 관리자가 한 사람이므로 가족 단계를 따로 두지 않는다.';
comment on type storage_provider is '원본 바이트가 어디에 있는가. 기본은 gdrive — 이때 file.storage_path 가 Drive file id 다.';

-- ─────────────────────────────────────────── 식별자 채번

create sequence item_identifier_seq   start 1;
create sequence person_identifier_seq start 1;
create sequence bundle_identifier_seq start 1;

create function next_item_identifier()   returns text language sql volatile as
  $$ select 'DA-' || lpad(nextval('item_identifier_seq')::text, 4, '0') $$;
create function next_person_identifier() returns text language sql volatile as
  $$ select 'DP-' || lpad(nextval('person_identifier_seq')::text, 3, '0') $$;
create function next_bundle_identifier() returns text language sql volatile as
  $$ select 'DC-' || lpad(nextval('bundle_identifier_seq')::text, 3, '0') $$;

-- ─────────────────────────────────────────── 관리자

create table admin_user (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  label      text not null default '관리자',
  created_at timestamptz not null default now()
);
comment on table admin_user is '쓰기가 허용된 사람. 한 행만 둔다 — 계정이 늘어도 여기 없으면 읽기만 된다.';

create function is_admin() returns boolean
  language sql stable security definer set search_path = public, auth as
  $$ select exists (select 1 from admin_user where user_id = auth.uid()) $$;

create table app_setting (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
comment on table app_setting is '관리자가 화면에서 설정하는 값. Google Drive 리프레시 토큰이 여기 있다 — anon 은 한 행도 읽지 못한다.';

-- ─────────────────────────────────────────── 사람·장소

create table person (
  id               uuid primary key default gen_random_uuid(),
  identifier       text not null unique default next_person_identifier(),
  display_name     text not null,
  short_name       text,
  real_name        text,
  aliases          text[] not null default '{}',
  birth_edtf       text,
  death_edtf       text,
  born_year        int,
  died_year        int,
  relation_to_root text,
  note             text,
  face_file_id     uuid,
  created_at       timestamptz not null default now(),
  modified_at      timestamptz not null default now()
);
comment on column person.short_name is '아카이브를 만드는 사람 기준의 호칭(할머니). 다른 가족이 부르는 이름은 aliases 에 넣는다.';
comment on column person.born_year is 'birth_edtf 에서 뽑은 정렬·나이 계산용 연도. 불확실성은 birth_edtf 원문이 진다.';

create table person_relation (
  from_person_id uuid not null references person(id) on delete cascade,
  to_person_id   uuid not null references person(id) on delete cascade,
  kind           person_relation_kind not null,
  note           text,
  primary key (from_person_id, to_person_id, kind),
  check (from_person_id <> to_person_id)
);
comment on table person_relation is 'kind 는 to 가 from 에게 무엇인지를 말한다. parent 면 to 가 from 의 부모다. spouse 는 방향이 없으므로 양쪽 모두 넣는다.';

create table life_period (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  label      text not null,
  from_edtf  text,
  to_edtf    text,
  from_year  int,
  to_year    int,
  sort_order int not null default 0,
  note       text,
  created_at timestamptz not null default now()
);
comment on table life_period is '한 사람의 생애를 나눈 구간. 시기분류(dcterms:temporal)의 실체이자 연표 레인의 띠가 된다.';
comment on column life_period.to_year is '끝나지 않은 시기는 NULL. 화면은 열린 띠로 그린다.';

create table place (
  id          uuid primary key default gen_random_uuid(),
  family_name text not null,
  admin_name  text,
  note        text,
  created_at  timestamptz not null default now()
);
comment on column place.family_name is '집안에서 부르는 이름(외갓집). admin_name 은 행정 지명(경북 안동).';

-- ─────────────────────────────────────────── 주제분류

create table subject (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references subject(id) on delete cascade,
  label      text not null,
  sort_order int not null default 0,
  note       text,
  created_at timestamptz not null default now()
);
comment on table subject is '주제분류(dc:subject)의 두 단계 나무. 부모가 없으면 상위, 있으면 하위다. 세 단계로 늘리지 않는다.';

-- ─────────────────────────────────────────── 수집·묶음·자료

create table acquisition (
  id             uuid primary key default gen_random_uuid(),
  visited_on     date not null,
  from_person_id uuid references person(id) on delete set null,
  from_label     text,
  location       text,
  note           text,
  created_at     timestamptz not null default now()
);
comment on table acquisition is '자료를 받아 온 한 번의 방문. 출처분류(dc:source)의 뿌리다.';

create table bundle (
  id                   uuid primary key default gen_random_uuid(),
  identifier           text not null unique default next_bundle_identifier(),
  acquisition_id       uuid references acquisition(id) on delete set null,
  title                text not null,
  kind                 bundle_kind not null default 'folder',
  source               text not null,
  provenance           text,
  place_id             uuid references place(id) on delete set null,
  rights               text,
  default_access_level access_level not null default 'private',
  period_edtf          text,
  period_start         date,
  period_end           date,
  digitized_by         text,
  digitized_on         date,
  drive_folder_id      text,
  note                 text,
  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  modified_at          timestamptz not null default now()
);
comment on column bundle.drive_folder_id is '이 묶음의 원본이 담기는 Google Drive 폴더 id. 앱이 처음 업로드할 때 만든다.';

create table item (
  id                uuid primary key default gen_random_uuid(),
  identifier        text not null unique default next_item_identifier(),
  bundle_id         uuid not null references bundle(id) on delete cascade,
  seq               int not null default 0,
  title             text not null,
  type              dcmi_type not null,
  doc_type          text,
  description       text,
  creator           text,
  creator_person_id uuid references person(id) on delete set null,
  contributor       text,
  publisher         text,
  created_edtf      text,
  created_start     date,
  created_end       date,
  created_precision date_precision not null default 'unknown',
  created_uncertain boolean not null default false,
  created_approx    boolean not null default false,
  date_verified     boolean not null default false,
  date_verified_by  uuid references item(id) on delete set null,
  language          text,
  medium            text,
  extent            text,
  source            text,
  provenance        text,
  place_id          uuid references place(id) on delete set null,
  rights            text,
  tags              text[] not null default '{}',
  access_level      access_level not null default 'private',
  is_featured       boolean not null default false,
  is_archived       boolean not null default false,
  submitted_at      timestamptz not null default now(),
  modified_at       timestamptz not null default now()
);
comment on column item.access_level is '새로 올린 자료는 비공개로 시작한다. 관리자가 공개로 바꾼다 — 검토 단계는 따로 없다.';
comment on column item.date_verified is '생산일자가 증빙으로 확인되었는가. 참일 때만 화면에 "확인됨" 인장을 찍는다.';
comment on column item.date_verified_by is '그 근거가 된 자료(혼인신고서, 졸업장 따위). 근거가 아카이브 밖에 있으면 NULL.';
comment on column item.doc_type is '형태분류의 하위 단계 — 편지·일기·족보·제문 따위. dc:type 의 세부.';
comment on column item.creator_person_id is '등록된 인물인 생산자. 기관이나 미상은 creator 에 이름만 쓴다.';

create table file (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references item(id) on delete cascade,
  role              file_role not null default 'original',
  provider          storage_provider not null default 'gdrive',
  storage_path      text not null,
  original_filename text,
  mime              text,
  bytes             bigint,
  width             int,
  height            int,
  duration_ms       int,
  checksum_sha256   text,
  checksum_md5      text,
  checksum_verified boolean not null default false,
  exif              jsonb,
  created_at        timestamptz not null default now()
);
comment on column file.storage_path is 'provider 가 gdrive 면 Drive file id. 원본 바이트는 Supabase 에 두지 않는다.';
comment on column file.checksum_md5 is 'Drive 가 보고한 md5. 내려받지 않는 파일(영상·음성)의 무결성 근거.';

alter table person add constraint person_face_file_id_fkey
  foreign key (face_file_id) references file(id) on delete set null;

-- ─────────────────────────────────────────── 자료의 연결

create table item_person (
  item_id   uuid not null references item(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  role      person_role not null default 'depicted',
  primary key (item_id, person_id, role)
);

create table item_subject (
  item_id    uuid not null references item(id) on delete cascade,
  subject_id uuid not null references subject(id) on delete cascade,
  primary key (item_id, subject_id)
);
comment on table item_subject is '자료와 주제분류의 연결. 혼례이면서 음식인 사진이 있다.';

create table item_life_period (
  item_id        uuid not null references item(id) on delete cascade,
  life_period_id uuid not null references life_period(id) on delete cascade,
  primary key (item_id, life_period_id)
);
comment on table item_life_period is '시기분류(dcterms:temporal)의 실체다. 날짜로 자동 판정하지 않는다.';

create table transcript (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references item(id) on delete cascade,
  source      text not null default 'auto',
  reviewed    boolean not null default false,
  segments    jsonb not null default '[]'::jsonb,
  full_text   text,
  created_at  timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

-- ─────────────────────────────────────────── 이야기와 큐레이션

create table collection (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  kind           collection_kind not null default 'topic',
  summary        text,
  description    text,
  period_edtf    text,
  cover_item_id  uuid references item(id) on delete set null,
  cover_block_id uuid,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz not null default now()
);
comment on column collection.summary is '이야기 카드와 히어로에 쓰는 한두 문장. description 보다 짧다.';

create table item_collection (
  item_id       uuid not null references item(id) on delete cascade,
  collection_id uuid not null references collection(id) on delete cascade,
  sort_order    int not null default 0,
  primary key (item_id, collection_id)
);

create table curation_block (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collection(id) on delete cascade,
  position      int not null,
  kind          curation_block_kind not null,
  body          text,
  caption       text,
  speaker_id    uuid references person(id) on delete set null,
  timecode_ms   int,
  created_at    timestamptz not null default now()
);
comment on column curation_block.body is '큐레이터가 쓴 글. 원 자료의 설명(item.description)과 섞지 않는다 — 이건 나중에 붙인 해석이다.';

alter table collection add constraint collection_cover_block_id_fkey
  foreign key (cover_block_id) references curation_block(id) on delete set null;

create table curation_ref (
  block_id   uuid not null references curation_block(id) on delete cascade,
  item_id    uuid not null references item(id) on delete cascade,
  sort_order int not null default 0,
  primary key (block_id, item_id)
);
comment on table curation_ref is '블록이 가리키는 자료. dcterms:hasPart 의 실체다.';

create table hero_slot (
  slot          int primary key check (slot between 1 and 3),
  collection_id uuid references collection(id) on delete set null,
  auto_kind     hero_auto_kind,
  starts_on     date,
  ends_on       date,
  note          text,
  modified_at   timestamptz not null default now(),
  check (collection_id is null or auto_kind is null)
);
comment on table hero_slot is '첫 화면 히어로의 자리 셋. 비어 있거나 기간이 지난 자리는 자동 큐레이션이 채운다.';

create table world_event (
  id         uuid primary key default gen_random_uuid(),
  year       int not null,
  label      text not null,
  note       text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
comment on table world_event is '그해의 큰 사회적 사건. 집안 자료의 배경으로만 쓴다 — 검색 대상이 아니다.';

create table event_log (
  id        uuid primary key default gen_random_uuid(),
  item_id   uuid references item(id) on delete set null,
  bundle_id uuid references bundle(id) on delete set null,
  actor_id  uuid references auth.users(id) on delete set null,
  action    text not null,
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);
comment on table event_log is '누가 무엇을 바꾸었는가. 삭제는 되돌릴 수 없으므로 최소한 흔적은 남긴다.';

-- ─────────────────────────────────────────── 찾아보기

create index item_bundle_idx        on item (bundle_id, seq);
create index item_public_idx        on item (access_level, is_archived) where not is_archived;
create index item_created_start_idx on item (created_start);
create index item_type_idx          on item (type);
create index file_item_idx          on file (item_id, role);
create index item_person_person_idx on item_person (person_id);
create index item_subject_subj_idx  on item_subject (subject_id);
create index life_period_person_idx on life_period (person_id, sort_order);
create index curation_block_coll_idx on curation_block (collection_id, position);
create index curation_ref_item_idx  on curation_ref (item_id);
create index world_event_year_idx   on world_event (year);

-- ─────────────────────────────────────────── 공개 판정

create function item_is_public(p_item_id uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (
       select 1 from item i
       where i.id = p_item_id and i.access_level = 'public' and not i.is_archived
     ) $$;

-- ─────────────────────────────────────────── RLS
-- 규칙 하나: 쓰기는 is_admin() 뿐이고, 손님은 공개 자료에 닿는 것만 읽는다.
-- 비공개 자료는 행 자체가 오지 않는다 — 그래서 목록·연표·건수에서 저절로 빠진다.

do $$
declare t text;
begin
  foreach t in array array[
    'admin_user','app_setting','person','person_relation','life_period','place','subject',
    'acquisition','bundle','item','file','item_person','item_subject','item_life_period',
    'transcript','collection','item_collection','curation_block','curation_ref',
    'hero_slot','world_event','event_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- 손님이 읽을 수 있는 것
create policy guest_read on item          for select to anon using (access_level = 'public' and not is_archived);
create policy guest_read on file          for select to anon using (item_is_public(item_id));
create policy guest_read on transcript    for select to anon using (item_is_public(item_id));
create policy guest_read on item_person   for select to anon using (item_is_public(item_id));
create policy guest_read on item_subject  for select to anon using (item_is_public(item_id));
create policy guest_read on item_life_period for select to anon using (item_is_public(item_id));
create policy guest_read on item_collection  for select to anon using (item_is_public(item_id));
create policy guest_read on curation_ref  for select to anon using (item_is_public(item_id));

create policy guest_read on bundle for select to anon using (
  not is_archived and exists (
    select 1 from item i where i.bundle_id = bundle.id and i.access_level = 'public' and not i.is_archived));

-- 인물은 공개 자료에 한 번이라도 나오는 사람만 보인다
create policy guest_read on person for select to anon using (
  exists (select 1 from item_person ip join item i on i.id = ip.item_id
          where ip.person_id = person.id and i.access_level = 'public' and not i.is_archived));
create policy guest_read on person_relation for select to anon using (
  exists (select 1 from person p where p.id = person_relation.from_person_id));
create policy guest_read on life_period for select to anon using (
  exists (select 1 from person p where p.id = life_period.person_id));

-- 분류 뼈대와 배경은 그대로 보인다 (0건인 분류도 목록에서 지우지 않는다)
create policy guest_read on subject      for select to anon using (true);
create policy guest_read on place        for select to anon using (true);
create policy guest_read on world_event  for select to anon using (true);
create policy guest_read on collection   for select to anon using (true);
create policy guest_read on curation_block for select to anon using (true);
create policy guest_read on hero_slot    for select to anon using (true);

-- acquisition, admin_user, app_setting, event_log: 손님 정책 없음 = 한 행도 주지 않는다

-- ─────────────────────────────────────────── 손댄 시각

create function touch_modified() returns trigger language plpgsql as
  $$ begin new.modified_at = now(); return new; end $$;

create trigger touch before update on item       for each row execute function touch_modified();
create trigger touch before update on bundle     for each row execute function touch_modified();
create trigger touch before update on person     for each row execute function touch_modified();
create trigger touch before update on collection for each row execute function touch_modified();
create trigger touch before update on transcript for each row execute function touch_modified();
