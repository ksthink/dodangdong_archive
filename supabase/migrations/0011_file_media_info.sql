-- 영상·음성 파일의 코덱과 구조. 올릴 때 브라우저가 mp4 머리를 읽어 적는다
-- (Drive 는 영상 정보를 늦게 주거나 주지 않는다). 모르면 null.
alter table file add column codec text;
alter table file add column faststart boolean;

comment on column file.codec is
  '영상·음성 코덱(mp4 표본 형식): 영상 avc1·hvc1·hev1·av01·vp09, 음성 mp4a 따위. 여럿이면 쉼표로.';
comment on column file.faststart is
  'mp4 목차(moov)가 본문(mdat)보다 앞에 있는가. false 면 재생을 시작하려고 파일 끝부터 받아야 한다.';
comment on type file_role is
  'original 원본(손대지 않음) · thumb 목록용 사진 · stream 재생용 사본(원본에서 파생, faststart·H.264) · display · poster';
