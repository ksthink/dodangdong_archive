-- 자료 하나에 녹취록 하나. 고칠 때는 같은 행을 덮어쓴다(upsert on item_id).
create unique index transcript_item_uniq on transcript (item_id);

comment on column transcript.segments is
  '구간 배열 [{start: 초|null, speaker: 말한 사람|null, text}]. full_text 에서 파싱해 만든다.';
comment on column transcript.full_text is '관리자가 적은 원문 그대로. 다시 고칠 때 이것을 편다.';
comment on column transcript.reviewed is '사람이 원음과 대조해 검토했는가.';
