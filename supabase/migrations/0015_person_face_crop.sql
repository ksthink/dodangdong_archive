-- 얼굴 사진을 사진의 한 부분에서 잘라 만든다.
--
-- 옛 집안 사진은 거의 단체 사진이라 독사진이 드물다. 그래서 사진 한 장을 통째로
-- 얼굴로 쓰면 가운데가 잘려 엉뚱한 곳이 나왔다. 이제 관리 화면에서 네모를 잡아
-- 그 자리만 256×256 으로 잘라 파생 파일로 올린다.
--
-- 원본은 손대지 않는다. 잘라낸 것은 file.role='face', derived_from = 원본이라
-- 어느 사진의 어디에서 왔는지 남고, 그 자료를 지우면 얼굴도 함께 떨어진다.
--
-- face_crop 은 네모를 놓았던 자리다. 다시 열어 고칠 때 그 자리에서 시작하려고
-- 적어 두지만, 그 자체가 "이 사진의 이 자리에 이 사람이 있다"는 기록이기도 하다.

alter type file_role add value if not exists 'face';

alter table person add column if not exists face_crop jsonb;

comment on column person.face_crop is
  '얼굴을 잘라낸 자리. {"x":0.31,"y":0.12,"size":0.22} — x·size 는 원본 가로 대비 비율, y 는 세로 대비 비율. 네모는 정사각형(픽셀로 size×가로). 다시 자를 때 쓰고, 사진 속 인물 위치 기록이기도 하다.';
