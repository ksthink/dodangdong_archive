#!/usr/bin/env python3
"""
2026-09-27 에 DB 에서 먼저 지운 시험 자료의 Drive 파일·폴더를 뒤따라 지운다.

- DB 의 file 행과 seed_fake_manifest 는 그날 이미 지워졌으므로, 그때 적어 둔 id 를
  여기 그대로 둔다. 루트 폴더와 DC-001(할머니의 전화번호부) 폴더는 목록에 없다.
- 리프레시 토큰은 app_setting 에서 읽고 client id/secret 은 .env.local 에서 읽는다
  (fake_cleanup.py 와 같은 길).
- 이미 없는(404) 파일은 지운 것으로 본다. 다 지우고 나면 이 스크립트는 지워도 된다.

실행: ADMIN_PASSWORD='...' python3 scripts/seed/drive_orphans.py
"""
import sys
from fake_cleanup import Rest, login, google_access_token, drive_delete

FILE_IDS = """
1r1sZKuv9QwKa1AmkNDlP8vsBX4-YFpKZ 10vKK2XP4ZkxoyRNH80mrtEh-0K_mzP0N 1lotZxdaq7xFLg9XmYhZy75jbbFIQC70A
11gTvGZFHSxYMViNNsMShHtBUl2BCizZm 11USZA5SzzO9PRhZ3WT7ZfON2lq_zvDMN 1cIYBZLF6pkXfOKlr9XeOHioBYcpVxcxk
1Ed8Tks3NBG9CqQAGxahx_VWUCcpZrKit 1XbvjAzA5FTvyoZZ6dpfnhknjSO-PL-Qb 1kVp8fJVfoq9u1IBo_YsUpANYVzPh8VfX
1JMCNSHLpMiKLHojIlUdU5Je7CmhSpOP2 1A6ap5GhYKC-LSF5XFmT03e2UrHgljhlU 1Ud8_4D-0TQOTc_CeX--YcBCJuV76RwNo
1vVVWhBhtiF_rBBoyw3dvzZ80rKg9pqeg 1VD19B8LTCRqWciHrvDYq01D4nbSjRg8F 1NsonKPvVphzLoJ4LNFFwG1B_V7YY6jej
1FPuM9hUTtgrYIu2VwnQXS7ZXr7l6Chlx 1n6zINyT3-tX831yQfKlJZOH_FnCazvTe 14yuBdbw_9KXLI17EU6x64UeSFfnuXYs-
1-nYsnjH8NRYyl8RzVRW2KQ6aant6tbgr 1_xQPn91wZHfExLqNZ1_QZlY9Jf0AqhUc 1hP6UnjYD6nfQiYOPAEUXAdsJ4Luvqa6K
1w8ArI5YzaNK7wXcu8CKk6bhHLYkvBy63 1S-4cu2e6FYIXFHflEBKqCtUnS28SqJ0r 1AoNerVZvW224zNXofRz7-CGLiid_4Nqy
16elyWrbuOEKTxl7RURcusdhvM5wZWgWL
""".split()

# 시험 묶음 DC-002·DC-003·DC-005 의 폴더. DC-004·DC-006 은 폴더가 만들어진 적이 없다.
FOLDER_IDS = """
1yOoceAe57ZxvJf4beT19yeGdFNQXyGIz 1xpBvscOTR_KHpjoN9lU87ABbKUqxhZ7B 1K7AAgHyDen6fLjbP6Xz7haka3N9jDBlv
""".split()


def main():
    rest = Rest(login()["access_token"])
    token = google_access_token(rest)
    if not token:
        print("Drive 토큰을 얻지 못했다.", file=sys.stderr)
        sys.exit(1)
    for fid in FILE_IDS:
        drive_delete(token, fid, "파일")
    for fid in FOLDER_IDS:
        drive_delete(token, fid, "폴더")
    print(f"파일 {len(FILE_IDS)}건, 폴더 {len(FOLDER_IDS)}건 처리 끝.")


if __name__ == "__main__":
    main()
