-- 원본 하나에 재생용 사본(stream) 하나. 썸네일과 같은 규칙(0009).
create unique index file_one_stream_per_original on file (derived_from) where role = 'stream';
