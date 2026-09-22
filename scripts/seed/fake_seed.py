#!/usr/bin/env python3
"""
가상 시험 자료를 도당동 아카이브 DB(Supabase)에 채운다.
- 모든 가짜 자료는 새로 만든 가짜 묶음(제목 끝에 " (시험)", note에 seed:fake)에만 들어간다.
- 만든 모든 행의 id를 app_setting(key=seed_fake_manifest)과 scripts/seed/fake-manifest.json에 남긴다.
- 이미 manifest가 있으면 멈춘다(중복 방지).
- 비밀번호는 환경변수 ADMIN_PASSWORD로만 받는다. 파일에 쓰지 않는다.

실행: python3 scripts/seed/fake_seed.py
"""
import os
import re
import sys
import json
import uuid
import datetime
import requests

SUPABASE_URL = "https://zelpkhsmunptyhxpbsmd.supabase.co"
ANON_KEY = "sb_publishable_kloCj6eAi3z_lkuCpkPZGA_lpSa4ptr"
ADMIN_EMAIL = "ksthink@ksthink.com"

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "fake-manifest.json")

# 건드리지 말아야 할 기존 행 (참고용, 절대 쓰기 대상 아님)
REAL_BUNDLE_DC001 = "5f556243-1016-404d-bf2e-4022aaee83a7"
REAL_PLACE_DODANGDONG = "14deef5b-3977-4b9d-b09b-66d5a3660158"
EXISTING_SUBJECT_PARENTS = {
    "명절·기념일": "9c9dd9c5-e69b-41de-891b-00a6ce3cb329",
    "혼례": "478ffbb6-3928-4539-96ab-6d0f90c0db4b",
    "학교": "6362ecc3-0fbe-4c33-8692-4656fac92dd8",
    "일·농사": "1d5e6519-2538-4c11-bab8-e2ca2f083b2e",
    "음식": "6fef4ce7-f961-48c0-8922-2a0bb5665319",
    "이사": "5f21609d-73ef-4df8-8bd6-16912b16615f",
}

manifest = {
    "created_at": None,
    "bundles": [], "items": [], "people": [], "places": [],
    "subjects": [], "world_events": [], "collections": [],
    "files": [], "drive_file_ids": [], "drive_folder_ids": [],
    # 편의: 나중에 파일 업로드 단계에서 쓸 자료 id 후보 (id -> identifier)
    "public_still_items": [], "private_item_for_media": None,
}

# ───────────────────────────────────────────── src/lib/edtf.ts 를 그대로 옮긴 파서

def _pad(n, w=2):
    return str(n).zfill(w)

def _last_day(y, m):
    if m == 12:
        return (datetime.date(y + 1, 1, 1) - datetime.timedelta(days=1)).day
    return (datetime.date(y, m + 1, 1) - datetime.timedelta(days=1)).day

UNKNOWN = {"start": None, "end": None, "precision": "unknown", "uncertain": False, "approx": False}

def _one(raw):
    s = raw.strip()
    if not s:
        return dict(UNKNOWN)
    uncertain = False
    approx = False
    while s.endswith("?") or s.endswith("~") or s.endswith("%"):
        if s.endswith("?"):
            uncertain = True
        elif s.endswith("~"):
            approx = True
        else:
            uncertain = True
            approx = True
        s = s[:-1]

    def q(p):
        return {**p, "uncertain": uncertain, "approx": approx}

    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
        if mo < 1 or mo > 12 or d < 1 or d > _last_day(y, mo):
            return dict(UNKNOWN)
        return q({"start": s, "end": s, "precision": "day"})

    m = re.match(r"^(\d{4})-(\d{2})$", s)
    if m:
        y, mo = int(m[1]), int(m[2])
        if mo < 1 or mo > 12:
            return dict(UNKNOWN)
        return q({"start": f"{s}-01", "end": f"{s}-{_pad(_last_day(y, mo))}", "precision": "month"})

    m = re.match(r"^(\d{4})$", s)
    if m:
        return q({"start": f"{s}-01-01", "end": f"{s}-12-31", "precision": "year"})

    m = re.match(r"^(\d{3})X$", s, re.I)
    if m:
        return q({"start": f"{m[1]}0-01-01", "end": f"{m[1]}9-12-31", "precision": "decade"})

    m = re.match(r"^(\d{2})XX$", s, re.I)
    if m:
        return q({"start": f"{m[1]}00-01-01", "end": f"{m[1]}99-12-31", "precision": "century"})

    return dict(UNKNOWN)

def parse_edtf(raw):
    if not raw:
        return dict(UNKNOWN)
    s = raw.strip()
    if not s:
        return dict(UNKNOWN)
    if "/" in s:
        a, b = s.split("/", 1)
        frm = dict(UNKNOWN) if a in ("..", "") else _one(a)
        to = dict(UNKNOWN) if b in ("..", "") else _one(b)
        if frm["precision"] == "unknown" and to["precision"] == "unknown":
            return dict(UNKNOWN)
        return {
            "start": frm["start"], "end": to["end"], "precision": "interval",
            "uncertain": frm["uncertain"] or to["uncertain"],
            "approx": frm["approx"] or to["approx"],
        }
    return _one(s)

def edtf_year(raw):
    p = parse_edtf(raw)
    if p["precision"] == "decade" and p["start"]:
        return int(p["start"][:4]) + 5
    if p["start"]:
        return int(p["start"][:4])
    return None

# ───────────────────────────────────────────── REST 도우미

class Rest:
    def __init__(self, access_token):
        self.headers = {
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def insert(self, table, rows, ret="representation"):
        single = isinstance(rows, dict)
        payload = rows if not single else rows
        h = {**self.headers, "Prefer": f"return={ret}"}
        res = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=h, json=payload)
        if not res.ok:
            raise RuntimeError(f"insert {table} 실패 {res.status_code}: {res.text}")
        if ret == "minimal":
            return None
        data = res.json()
        return data[0] if single and isinstance(data, list) else data

    def update(self, table, match, values):
        h = {**self.headers, "Prefer": "return=minimal"}
        params = "&".join(f"{k}=eq.{v}" for k, v in match.items())
        res = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=h, json=values)
        if not res.ok:
            raise RuntimeError(f"update {table} 실패 {res.status_code}: {res.text}")

    def select(self, table, params=""):
        h = {**self.headers}
        res = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=h)
        if not res.ok:
            raise RuntimeError(f"select {table} 실패 {res.status_code}: {res.text}")
        return res.json()


def login():
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        print("ADMIN_PASSWORD 환경변수가 없다.", file=sys.stderr)
        sys.exit(1)
    res = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": password},
    )
    if not res.ok:
        print(f"로그인 실패 {res.status_code}: {res.text}", file=sys.stderr)
        sys.exit(1)
    return res.json()


def already_seeded(rest):
    rows = rest.select("app_setting", "key=eq.seed_fake_manifest&select=key")
    return bool(rows)


def save_manifest(rest):
    manifest["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    body = json.dumps(manifest, ensure_ascii=False)
    rest.insert("app_setting", {"key": "seed_fake_manifest", "value": body}, ret="minimal")
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"manifest 저장: {MANIFEST_PATH}")


# ───────────────────────────────────────────── 사람

PEOPLE_DEFS = [
    # key, real_name, short_name, aliases, birth, death, relation_to_root, note
    ("p1", "이만수", "할아버지", [], "1931?", "2005-03-12", "할아버지", "종조부 댁에서 농사를 지었다."),
    ("p2", "김순덕", "할머니", ["안동댁"], "1933", "2012-11", "할머니", "안동에서 시집왔다."),
    ("p3", "박제현", "외할아버지", [], "193X", "1998?", "외할아버지", "면사무소에서 일했다."),
    ("p4", "최영희", "외할머니", ["외할머니"], "1936", None, "외할머니", "지금도 안동에 산다."),
    ("p5", "이광호", "아버지", [], "1958-04-02", None, "아버지", "장남이다."),
    ("p6", "정순임", "어머니", [], "1960?", None, "어머니", "안동에서 나고 자랐다."),
    ("p7", "이광석", "큰아버지", [], "1955", "2020-02", "큰아버지", "젊어서 서울로 나갔다."),
    ("p8", "이순자", "고모", [], "1962", None, "고모", "결혼 후 청양에 산다."),
    ("p9", "정순희", "큰이모", [], "1957?", None, "큰이모", "안동에 계속 살았다."),
    ("p10", "이지은", "나", [], "1988-09-01", None, "나", "이 아카이브를 만든다."),
    ("p11", "이지훈", "형", [], "1985", None, "형", "지은의 오빠다."),
    ("p12", "이수민", "사촌", [], "1990?", None, "사촌",
     "큰아버지의 딸이다. 비공개 자료에만 나온다."),
]

PARENTS = [
    ("p1", "p5"), ("p2", "p5"),
    ("p1", "p7"), ("p2", "p7"),
    ("p1", "p8"), ("p2", "p8"),
    ("p3", "p6"), ("p4", "p6"),
    ("p3", "p9"), ("p4", "p9"),
    ("p5", "p10"), ("p6", "p10"),
    ("p5", "p11"), ("p6", "p11"),
    ("p7", "p12"),
]
SPOUSES = [("p1", "p2"), ("p3", "p4"), ("p5", "p6")]

LIFE_PERIODS = [
    ("p1", "유년기", "1931?", "1945", 0),
    ("p1", "혼인과 분가", "1954", "1956", 1),
    ("p1", "자녀 양육기", "1956", "1975", 2),
    ("p1", "손주 시대", "1988", None, 3),
    ("p2", "혼인과 분가", "1954", "1956", 0),
    ("p2", "자녀 양육기", "1956", "1975", 1),
    ("p2", "손주 시대", "1988", "2012", 2),
    ("p5", "유년기", "1958", "1975", 0),
    ("p5", "군 복무", "1978", "1980", 1),
    ("p5", "혼인과 분가", "1983", "1985", 2),
    ("p5", "자녀 양육기", "1985", "2005", 3),
    ("p6", "혼인과 분가", "1983", "1985", 0),
    ("p6", "자녀 양육기", "1985", "2005", 1),
    ("p6", "손주 시대", "2015", None, 2),
    ("p9", "유년기", "1957?", "1975", 0),
    ("p9", "혼인과 분가", "1979", "1981", 1),
    ("p10", "유년기", "1988", "2000", 0),
    ("p10", "학교", "2000", "2011", 1),
    ("p10", "서울 생활", "2011", None, 2),
]

# ───────────────────────────────────────────── 장소

PLACE_DEFS = [
    ("pl1", "외갓집", "경북 안동시 풍천면", "정순임의 본가."),
    ("pl2", "큰집", "서울 성북구 정릉동", "이광석이 살았다."),
    ("pl3", "시골집", "충남 청양군", "이순자가 시집간 곳."),
    ("pl4", "상계동 아파트", "서울 노원구 상계동", "이광호·정순임이 분가한 곳."),
    ("pl5", "정든사진관", "서울 종로구", "가족사진을 찍던 사진관."),
]

# ───────────────────────────────────────────── 주제분류(하위)

SUBJECT_DEFS = [
    ("sj1", "명절·기념일", "설날", 1),
    ("sj2", "명절·기념일", "추석", 2),
    ("sj3", "명절·기념일", "어린이날", 3),
    ("sj4", "학교", "입학", 1),
    ("sj5", "학교", "졸업", 2),
    ("sj6", "혼례", "혼례 사진", 1),
    ("sj7", "일·농사", "농사철", 1),
    ("sj8", "이사", "이삿날", 1),
]

# ───────────────────────────────────────────── 묶음

BUNDLE_DEFS = [
    dict(key="bd1", title="이광호·정순임 결혼사진첩 (시험)", kind="album",
         source="큰집 정리 중 발견", provenance="고모가 보관하다 건넴", place="pl2",
         period_edtf="1983", acquisition=("1989-01-01", "고모")),
    dict(key="bd2", title="옛 필름통 (시험)", kind="roll",
         source="외갓집 다락", provenance="외할머니에게 받음", place="pl1",
         period_edtf="197X", acquisition=None),
    dict(key="bd3", title="편지·문서 묶음 (시험)", kind="bundle",
         source="시골집 문갑", provenance="고모가 모아 둠", place="pl3",
         period_edtf="1975/1998", acquisition=("2020-05-03", "고모")),
    dict(key="bd4", title="구술 테이프 (시험)", kind="tape",
         source="상계동 아파트", provenance="이지은이 녹음", place="pl4",
         period_edtf="2015/2020", acquisition=None),
    dict(key="bd5", title="잡동사니 폴더 (시험)", kind="folder",
         source="큰집 창고", provenance="정리 중 발견", place="pl2",
         period_edtf="192X/2026", acquisition=("2021-11-20", "고모")),
]

# ───────────────────────────────────────────── 자료(item)
# access: public/private. subjects/persons/place 는 key로 참조.
# creator_kind: 'person'(creator_person_id) / 'name'(creator 텍스트) / None
I = "item"

ITEMS = [
    # ---- BD1 album: 결혼사진첩 (StillImage 14 + Event 2) ----
    dict(bd="bd1", type="StillImage", title="약혼식", created="1982-11", place="pl2",
         creator=("name", "정든사진관"), depict=["p5", "p6", "p1", "p2"], subj=["sj6"],
         tags=["약혼", "가족"], desc="약혼식 뒤 온 가족이 마당에서 사진을 찍었다.", access="public"),
    dict(bd="bd1", type="StillImage", title="혼례식 본식", created="1983-10-15", place="pl2",
         creator=("name", "정든사진관"), depict=["p5", "p6"], subj=["sj6"], date_verified=True,
         tags=["혼례"], desc="이광호와 정순임의 혼례식이다.", access="public"),
    dict(bd="bd1", type="StillImage", title="혼례식 폐백", created="1983-10-15", place="pl2",
         creator=("name", "정든사진관"), depict=["p5", "p6", "p1", "p2", "p3", "p4"], subj=["sj6"],
         tags=["혼례", "폐백"], desc="폐백 자리에서 절을 올리는 모습.", access="public"),
    dict(bd="bd1", type="StillImage", title="상계동 아파트 이삿날", created="1985-03-02", place="pl4",
         creator=("name", "미상"), depict=["p5", "p6"], subj=["sj8"],
         tags=["이사"], desc="상계동 아파트로 분가하는 날 짐을 나른다.", access="public"),
    dict(bd="bd1", type="StillImage", title="부엌에서 이바지 준비", created="1983-10-14", place="pl2",
         creator=("name", "미상"), depict=["p2", "p6"], subj=["sj6"], date_verified=True,
         tags=["부엌", "혼례"], desc="혼례 전날 부엌에서 이바지 음식을 준비한다.", access="public"),
    dict(bd="bd1", type="StillImage", title="마당의 감나무 아래", created="1983-10", place="pl2",
         creator=("name", "미상"), depict=["p1", "p2", "p5", "p6"], subj=[],
         tags=["감나무", "가족"], desc="혼례 후 큰집 마당 감나무 아래에서 다시 모였다.", access="public"),
    dict(bd="bd1", type="StillImage", title="어린이날 나들이", created="1993-05-05", place=None,
         creator=("person", "p6"), depict=["p10", "p11", "p6"], subj=["sj3"],
         tags=["나들이"], desc="어린이날 온 가족이 나들이를 갔다.", access="public"),
    dict(bd="bd1", type="StillImage", title="빚 정리 후 가족사진", created="1996?", place="pl2",
         creator=("name", "미상"), depict=["p7", "p12"], subj=[],
         tags=["가족"], desc="집안 어려움을 정리한 뒤 찍은 사진이다.", access="private"),
    dict(bd="bd1", type="Event", title="이광호·정순임 혼례", created="1983-10-15", place="pl2",
         creator=None, depict=["p5", "p6"], subj=["sj6"], date_verified=True,
         tags=["혼례"], desc="이광호와 정순임이 혼례를 치른 날이다. 파일은 없다.", access="public"),
    dict(bd="bd1", type="Event", title="상계동 아파트로 이사", created="1985-03-02", place="pl4",
         creator=None, depict=["p5", "p6"], subj=["sj8"],
         tags=["이사"], desc="상계동 아파트로 분가한 사건이다. 파일은 없다.", access="public"),

    # ---- BD2 roll: 옛 필름통 (StillImage 10) ----
    dict(bd="bd2", type="StillImage", title="집안 어른 옛 사진", created="1925?", place="pl1",
         creator=None, depict=["p3"], subj=[],
         tags=["옛사진"], desc="박제현의 젊은 시절로 짐작되는 사진이다.", access="private"),
    dict(bd="bd2", type="StillImage", title="추석 차례", created="1975-09", place="pl2",
         creator=("name", "미상"), depict=["p1", "p2", "p5", "p7", "p8"], subj=["sj2"],
         tags=["추석"], desc="큰집에서 지낸 추석 차례 사진이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="설날 세배", created="1976-02", place="pl2",
         creator=("name", "미상"), depict=["p1", "p2", "p5", "p6", "p7"], subj=["sj1"],
         tags=["설날"], desc="설날 세배 드리는 모습이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="농사철 들녘", created="197X", place="pl3",
         creator=("name", "미상"), depict=["p1"], subj=["sj7"],
         tags=["농사"], desc="농사철 들녘에서 일하는 모습이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="입학식", created="1978-03", place="pl2",
         creator=("name", "미상"), depict=["p7"], subj=["sj4"],
         tags=["입학"], desc="이광석의 중학교 입학식이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="졸업식", created="1978-05-14", place="pl2",
         creator=("name", "미상"), depict=["p8"], subj=["sj5"],
         tags=["졸업"], desc="이순자의 졸업식 사진이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="부엌 풍경", created="1979", place="pl2",
         creator=None, depict=["p2"], subj=[],
         tags=["부엌"], desc="큰집 부엌에서 일하는 김순덕의 모습이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="큰집 감나무", created="1980~", place="pl2",
         creator=("name", "미상"), depict=[], subj=[],
         tags=["감나무"], desc="큰집 마당의 감나무를 찍은 사진이다.", access="public"),

    # ---- BD3 bundle: 편지·문서 묶음 (Text 12 + PhysicalObject 2) ----
    dict(bd="bd3", type="Text", doc_type="편지", title="외할머니가 보낸 편지", created="1976-04", place=None,
         creator=("person", "p4"), depict=["p6"], subj=[], lang="ko",
         tags=["편지"], desc="외할머니가 정순임에게 보낸 편지다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="일기", title="정순임의 일기", created="1984", place="pl4",
         creator=("person", "p6"), depict=["p6"], subj=[], lang="ko",
         tags=["일기"], desc="정순임이 신혼 초에 쓴 일기다.", access="private"),
    dict(bd="bd3", type="Text", doc_type="족보", title="집안 족보 발췌", created="19XX", place="pl2",
         creator=("name", "미상"), depict=["p1"], subj=[], lang="ko",
         tags=["족보"], desc="집안 족보 가운데 한 대를 옮겨 적은 것이다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="졸업장", title="이광호 졸업장", created="1977-02-20", place=None,
         creator=("name", "군청"), depict=["p5"], subj=["sj5"], lang="ko", date_verified=True,
         tags=["졸업"], desc="이광호의 고등학교 졸업장이다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="혼인신고서", title="이광호·정순임 혼인신고서", created="1983-10-20", place=None,
         creator=("name", "군청"), depict=["p5", "p6"], subj=["sj6"], lang="ko", date_verified=True,
         tags=["혼인신고"], desc="혼례 후 제출한 혼인신고서 사본이다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="장부", title="큰아버지의 빚 문서", created="1994", place="pl2",
         creator=("person", "p7"), depict=["p7"], subj=[], lang="ko",
         tags=["장부"], desc="큰아버지가 남긴 빚 관련 장부다. 손님에게는 제목이 보이지 않아야 한다.",
         access="private"),
    dict(bd="bd3", type="Text", doc_type="일기", title="이순자의 청양 일기", created="1982/1985", place="pl3",
         creator=("person", "p8"), depict=["p8"], subj=[], lang="ko",
         tags=["일기"], desc="이순자가 청양에서 쓴 일기 가운데 일부다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="장부", title="농사 장부", created="1974", place="pl3",
         creator=("person", "p1"), depict=["p1"], subj=["sj7"], lang="ko",
         tags=["농사", "장부"], desc="한 해 농사 수확을 적어 둔 장부다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="일기", title="이지훈의 군대 편지", created="2005", place=None,
         creator=("person", "p11"), depict=["p11"], subj=[], lang="ko",
         tags=["편지"], desc="이지훈이 군 복무 중 보낸 편지다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="제문", title="이만수 제문", created="2005-03", place="pl2",
         creator=("person", "p5"), depict=["p1"], subj=[], lang="ko",
         tags=["제문"], desc="이만수의 장례에서 읽은 제문이다.", access="public"),
    dict(bd="bd3", type="Text", doc_type="일기", title="지은의 방학 일기", created="1998-08", place="pl4",
         creator=("person", "p10"), depict=["p10"], subj=[], lang="ko",
         tags=["일기"], desc="이지은이 초등학교 때 쓴 방학 일기다.", access="public"),
    dict(bd="bd3", type="PhysicalObject", title="이만수 도장", created="195X", place="pl2",
         creator=None, depict=["p1"], subj=[],
         tags=["도장"], desc="이만수가 쓰던 나무 도장이다.", access="private"),
    dict(bd="bd3", type="PhysicalObject", title="정순임 다이어리 표지", created="1984", place="pl4",
         creator=("person", "p6"), depict=["p6"], subj=[],
         tags=["다이어리"], desc="정순임이 쓰던 다이어리의 표지만 남았다.", access="public"),

    # ---- BD4 tape: 구술 테이프 (Sound 4 + MovingImage 1) ----
    dict(bd="bd4", type="Sound", title="김순덕 구술 — 시집오던 날", created="2016-08-12", place="pl4",
         creator=("person", "p10"), depict=["p2"], subj=["sj6"],
         tags=["구술"], desc="김순덕이 안동에서 시집오던 날을 이야기한다.", access="public"),
    dict(bd="bd4", type="Sound", title="최영희 구술 — 농사철 이야기", created="2017-05", place="pl1",
         creator=("person", "p10"), depict=["p4"], subj=["sj7"],
         tags=["구술", "농사"], desc="최영희가 농사철 일손 모으던 이야기를 한다.", access="public"),
    dict(bd="bd4", type="Sound", title="이광석 구술 — 서울로 나가던 날", created="2018-02", place="pl2",
         creator=("person", "p10"), depict=["p7"], subj=[],
         tags=["구술"], desc="이광석이 서울로 처음 올라오던 날 이야기다. 빚 이야기가 섞여 있다.",
         access="private"),
    dict(bd="bd4", type="Sound", title="정순희 구술 — 동생 결혼식", created="2019-11", place="pl1",
         creator=("person", "p10"), depict=["p9"], subj=["sj6"],
         tags=["구술"], desc="정순희가 동생 정순임의 결혼식을 회고한다.", access="public"),
    dict(bd="bd4", type="MovingImage", title="지은 초등학교 졸업식 영상", created="2001-02", place=None,
         creator=("person", "p6"), depict=["p10"], subj=["sj5"],
         tags=["졸업"], desc="이지은의 초등학교 졸업식을 찍은 영상이다.", access="public"),

    # ---- BD5 folder: 잡동사니 (PhysicalObject 1 + MovingImage 1 + Event 5) ----
    dict(bd="bd5", type="PhysicalObject", title="옛 재봉틀", created=None, place="pl3",
         creator=None, depict=[], subj=[],
         tags=["살림"], desc="시골집에 있던 재봉틀이다. 만든 해는 모른다.", access="public"),
    dict(bd="bd5", type="MovingImage", title="상계동 아파트 가족 영상", created="2010/2012", place="pl4",
         creator=("person", "p11"), depict=["p5", "p6", "p10", "p11"], subj=[],
         tags=["가족"], desc="상계동 아파트에서 찍은 짧은 가족 영상이다.", access="public"),
    dict(bd="bd5", type="Event", title="이지은 태어남", created="1988-09-01", place="pl4",
         creator=None, depict=["p10"], subj=[], date_verified=True,
         tags=["출생"], desc="이지은이 태어난 날이다. 파일은 없다.", access="public"),
    dict(bd="bd5", type="Event", title="이광호 제대", created="1980-06", place=None,
         creator=None, depict=["p5"], subj=[],
         tags=["군복무"], desc="이광호가 군 복무를 마친 날이다. 파일은 없다.", access="public"),
    dict(bd="bd5", type="Event", title="이만수 별세", created="2005-03-12", place="pl2",
         creator=None, depict=["p1"], subj=[], date_verified=True,
         tags=["별세"], desc="이만수가 세상을 떠난 날이다. 파일은 없다.", access="public"),
    dict(bd="bd5", type="Event", title="이광석 빚보증 사건", created="1993", place="pl2",
         creator=None, depict=["p7", "p12"], subj=[],
         tags=["금전"], desc="큰아버지가 빚보증을 잘못 서게 된 사건이다. 파일은 없다.", access="private"),
    dict(bd="bd5", type="Event", title="이지훈 결혼", created="2023-05-20", place=None,
         creator=None, depict=["p11"], subj=["sj6"], date_verified=True,
         tags=["혼례"], desc="이지훈의 결혼이다. 파일은 없다.", access="public"),
]

# 뒤쪽에 채워 넣는 빈 날짜 · 추가 70·80년대 물량 (연대 집중 검증)
ITEMS += [
    dict(bd="bd2", type="StillImage", title="무제 가족사진 1", created=None, place="pl2",
         creator=None, depict=["p1", "p2"], subj=[], tags=[], desc="날짜를 알 수 없는 가족사진이다.",
         access="public"),
    dict(bd="bd3", type="Text", doc_type="편지", title="누구의 편지인지 모름", created=None, place=None,
         creator=None, depict=[], subj=[], lang="ko", tags=[], desc="보낸 사람을 알 수 없는 편지다.",
         access="private"),
    dict(bd="bd2", type="StillImage", title="설날 세배 (연도 미상)", created=None, place="pl2",
         creator=None, depict=["p7", "p8"], subj=["sj1"], tags=["설날"],
         desc="설날 세배 사진인데 연도를 적어 두지 않았다.", access="private"),
    dict(bd="bd1", type="StillImage", title="입학식 — 이지훈", created="1992-03", place=None,
         creator=("person", "p6"), depict=["p11"], subj=["sj4"], tags=["입학"],
         desc="이지훈의 초등학교 입학식이다.", access="public"),
    dict(bd="bd1", type="StillImage", title="입학식 — 이지은", created="1995-03", place=None,
         creator=("person", "p6"), depict=["p10"], subj=["sj4"], tags=["입학"],
         desc="이지은의 초등학교 입학식이다.", access="public"),
    dict(bd="bd1", type="StillImage", title="추석 큰집 마당", created="1988-09", place="pl2",
         creator=("name", "미상"), depict=["p1", "p2", "p7", "p8"], subj=["sj2"], tags=["추석"],
         desc="추석에 큰집 마당에 모인 가족사진이다.", access="public"),
    dict(bd="bd2", type="StillImage", title="외갓집 장독대", created="1980", place="pl1",
         creator=None, depict=["p4"], subj=[], tags=["부엌"], desc="외갓집 장독대와 부엌 뒤편이다.",
         access="public"),
    dict(bd="bd2", type="StillImage", title="큰집 마루", created="1986?", place="pl2",
         creator=None, depict=["p1", "p2"], subj=[], tags=[], desc="큰집 마루에서 쉬는 모습이다.",
         access="public"),
    dict(bd="bd1", type="StillImage", title="지은 유치원 졸업", created="1994", place=None,
         creator=("person", "p6"), depict=["p10"], subj=["sj5"], tags=["졸업"],
         desc="이지은의 유치원 졸업식 사진이다.", access="private"),
]

assert len(ITEMS) == 52, f"item 개수 확인: {len(ITEMS)}"

# ───────────────────────────────────────────── 세계 사건
# 바깥 세상 사건은 fake_world.py 가 넣는다. 여기서도 넣으면 두 벌이 된다
# (처음 넣을 때 실제로 그렇게 되어 한쪽을 지웠다).

# ───────────────────────────────────────────── 이야기(story)

def build_and_run():
    auth = login()
    rest = Rest(auth["access_token"])

    if already_seeded(rest):
        print("이미 seed_fake_manifest 가 있다. 중복 방지를 위해 멈춘다.")
        sys.exit(0)

    person_ids = {}
    for key, real, short, aliases, birth, death, rel, note in PEOPLE_DEFS:
        row = rest.insert("person", {
            "display_name": f"{real}({short})",
            "short_name": short, "real_name": real, "aliases": aliases,
            "birth_edtf": birth, "death_edtf": death,
            "born_year": edtf_year(birth), "died_year": edtf_year(death),
            "relation_to_root": rel, "note": note,
        })
        person_ids[key] = row["id"]
        manifest["people"].append(row["id"])
        print(f"person {key} -> {row['identifier']}")

    rel_rows = []
    for parent, child in PARENTS:
        rel_rows.append({"from_person_id": person_ids[child], "to_person_id": person_ids[parent], "kind": "parent"})
    for a, b in SPOUSES:
        rel_rows.append({"from_person_id": person_ids[a], "to_person_id": person_ids[b], "kind": "spouse"})
        rel_rows.append({"from_person_id": person_ids[b], "to_person_id": person_ids[a], "kind": "spouse"})
    rest.insert("person_relation", rel_rows, ret="minimal")
    print(f"person_relation {len(rel_rows)}건")

    lp_rows = []
    for key, label, frm, to, order in LIFE_PERIODS:
        lp_rows.append({
            "person_id": person_ids[key], "label": label,
            "from_edtf": frm, "to_edtf": to,
            "from_year": edtf_year(frm), "to_year": edtf_year(to),
            "sort_order": order,
        })
    rest.insert("life_period", lp_rows, ret="minimal")
    print(f"life_period {len(lp_rows)}건")

    place_ids = {}
    for key, fam, admin, note in PLACE_DEFS:
        row = rest.insert("place", {"family_name": fam, "admin_name": admin, "note": note})
        place_ids[key] = row["id"]
        manifest["places"].append(row["id"])
    print(f"place {len(place_ids)}건")

    subject_ids = {}
    for key, parent_label, label, order in SUBJECT_DEFS:
        row = rest.insert("subject", {
            "parent_id": EXISTING_SUBJECT_PARENTS[parent_label], "label": label, "sort_order": order,
        })
        subject_ids[key] = row["id"]
        manifest["subjects"].append(row["id"])
    print(f"subject(하위) {len(subject_ids)}건")

    bundle_ids = {}
    for b in BUNDLE_DEFS:
        acq_id = None
        if b["acquisition"]:
            visited, from_label = b["acquisition"]
            acq = rest.insert("acquisition", {
                "visited_on": visited, "from_label": from_label, "location": "가상 방문(시험)",
                "note": "seed:fake",
            })
            acq_id = acq["id"]
        row = rest.insert("bundle", {
            "title": b["title"], "kind": b["kind"], "source": b["source"],
            "provenance": b["provenance"], "place_id": place_ids[b["place"]],
            "period_edtf": b["period_edtf"], "default_access_level": "private",
            "acquisition_id": acq_id, "note": "seed:fake",
        })
        bundle_ids[b["key"]] = row["id"]
        manifest["bundles"].append(row["id"])
        print(f"bundle {b['key']} -> {row['identifier']}")

    item_rows = []
    for it in ITEMS:
        d = parse_edtf(it.get("created"))
        creator = it.get("creator")
        creator_person_id = person_ids[creator[1]] if creator and creator[0] == "person" else None
        creator_name = creator[1] if creator and creator[0] == "name" else None
        item_rows.append({
            "_key": it,
            "bundle_id": bundle_ids[it["bd"]],
            "title": it["title"],
            "type": it["type"],
            "doc_type": it.get("doc_type"),
            "description": it["desc"],
            "creator": creator_name,
            "creator_person_id": creator_person_id,
            "created_edtf": it.get("created"),
            "created_start": d["start"], "created_end": d["end"],
            "created_precision": d["precision"], "created_uncertain": d["uncertain"], "created_approx": d["approx"],
            "date_verified": bool(it.get("date_verified")),
            "language": it.get("lang"),
            "place_id": place_ids[it["place"]] if it.get("place") else None,
            "tags": it.get("tags", []),
            "access_level": it["access"],
        })

    created_items = []
    for row in item_rows:
        payload = {k: v for k, v in row.items() if k != "_key"}
        res = rest.insert("item", payload)
        created_items.append((row["_key"], res["id"], res["identifier"]))
        manifest["items"].append(res["id"])

    print(f"item {len(created_items)}건")

    id_by_title = {}
    for key, item_id, identifier in created_items:
        id_by_title[key["title"]] = (item_id, identifier)
        if key["access"] == "public" and key["type"] == "StillImage":
            manifest["public_still_items"].append({"id": item_id, "identifier": identifier, "title": key["title"]})
        if key["access"] == "private" and manifest["private_item_for_media"] is None and key["type"] == "StillImage":
            manifest["private_item_for_media"] = {"id": item_id, "identifier": identifier, "title": key["title"]}

    # date_verified_by 연결: 결혼 관련 사진/사건에 혼인신고서를, 졸업 사진에 졸업장을 근거로.
    marriage_cert_id = id_by_title["이광호·정순임 혼인신고서"][0]
    diploma_id = id_by_title["이광호 졸업장"][0]
    verify_links = {
        "혼례식 본식": marriage_cert_id,
        "이광호·정순임 혼례": marriage_cert_id,
    }
    for title, evidence_id in verify_links.items():
        item_id = id_by_title[title][0]
        rest.update("item", {"id": item_id}, {"date_verified_by": evidence_id})

    ip_rows = []
    isub_rows = []
    ilp_rows = []
    for key, item_id, identifier in created_items:
        for pkey in key.get("depict", []):
            ip_rows.append({"item_id": item_id, "person_id": person_ids[pkey], "role": "depicted"})
        for skey in key.get("subj", []):
            isub_rows.append({"item_id": item_id, "subject_id": subject_ids[skey]})
    if ip_rows:
        rest.insert("item_person", ip_rows, ret="minimal")
    if isub_rows:
        rest.insert("item_subject", isub_rows, ret="minimal")
    print(f"item_person {len(ip_rows)}건, item_subject {len(isub_rows)}건")

    # item_life_period: 몇 건 — 결혼 관련 자료를 각자의 "혼인과 분가" 시기에 건다
    def lp_id_for(person_key, label):
        rows = rest.select("life_period", f"person_id=eq.{person_ids[person_key]}&label=eq.{label}&select=id")
        return rows[0]["id"] if rows else None

    ilp_links = [
        ("혼례식 본식", "p5", "혼인과 분가"),
        ("혼례식 폐백", "p5", "혼인과 분가"),
        ("이광호·정순임 혼인신고서", "p6", "혼인과 분가"),
        ("상계동 아파트 이삿날", "p5", "혼인과 분가"),
        ("이광호 졸업장", "p5", "유년기"),
        ("지은 유치원 졸업", "p10", "유년기"),
    ]
    for title, pkey, label in ilp_links:
        lp_id = lp_id_for(pkey, label)
        item_id = id_by_title.get(title, (None,))[0]
        if lp_id and item_id:
            rest.insert("item_life_period", {"item_id": item_id, "life_period_id": lp_id}, ret="minimal")

    # ── 이야기(story) ──
    story_public1 = rest.insert("collection", {
        "title": "결혼까지 (시험)", "kind": "story", "access_level": "public",
        "summary": "이광호와 정순임이 만나 혼례를 치르기까지.",
        "description": "약혼부터 혼례, 분가까지의 자료를 모았다.",
        "period_edtf": "1982/1985",
    })
    manifest["collections"].append(story_public1["id"])

    story_public2 = rest.insert("collection", {
        "title": "우리 집의 목소리 (시험)", "kind": "story", "access_level": "public",
        "summary": "가족 구술을 모은 이야기.",
        "description": "구술 테이프에 담긴 여러 목소리를 모았다. 일부는 아직 정리 중이다.",
        "period_edtf": "2016/2019",
    })
    manifest["collections"].append(story_public2["id"])

    story_private = rest.insert("collection", {
        "title": "정리 중인 이야기 (시험)", "kind": "story", "access_level": "private",
        "summary": "아직 다듬는 중인 이야기.",
        "description": "손님에게는 보이지 않아야 한다.",
        "period_edtf": None,
    })
    manifest["collections"].append(story_private["id"])

    def add_block(story_id, position, kind, body=None, caption=None, speaker=None, timecode_ms=None, item_keys=None):
        block = rest.insert("curation_block", {
            "collection_id": story_id, "position": position, "kind": kind,
            "body": body, "caption": caption,
            "speaker_id": person_ids[speaker] if speaker else None,
            "timecode_ms": timecode_ms,
        })
        if item_keys:
            refs = []
            for i, title in enumerate(item_keys):
                item_id = id_by_title[title][0]
                refs.append({"block_id": block["id"], "item_id": item_id, "sort_order": i})
            rest.insert("curation_ref", refs, ret="minimal")
        return block["id"]

    # story_public1: 6가지 블록 모두 사용. quote 블록은 비공개 자료만 인용(손님에게 통째로 숨겨져야 함).
    add_block(story_public1["id"], 0, "heading", body="결혼까지")
    add_block(story_public1["id"], 1, "text",
              body="1982년 약혼부터 1985년 분가까지, 이광호와 정순임의 자료를 모았다.")
    add_block(story_public1["id"], 2, "gallery", caption="약혼과 혼례",
              item_keys=["약혼식", "혼례식 본식", "혼례식 폐백"])
    add_block(story_public1["id"], 3, "record", caption="혼인신고서",
              item_keys=["이광호·정순임 혼인신고서"])
    add_block(story_public1["id"], 4, "quote", speaker="p7", timecode_ms=42000,
              caption="큰아버지가 남긴 이야기",
              body="이광석이 서울로 나가던 날을 이야기한 구술이다.",
              item_keys=["이광석 구술 — 서울로 나가던 날"])
    add_block(story_public1["id"], 5, "timeline", body="약혼(1982)부터 이사(1985)까지의 흐름이다.",
              item_keys=["약혼식", "상계동 아파트 이삿날"])

    # story_public2: 구술 모음. 여기서도 기본 블록 몇 개.
    add_block(story_public2["id"], 0, "heading", body="우리 집의 목소리")
    add_block(story_public2["id"], 1, "text", body="네 사람의 구술을 모았다.")
    add_block(story_public2["id"], 2, "quote", speaker="p2", timecode_ms=15000,
              caption="시집오던 날", item_keys=["김순덕 구술 — 시집오던 날"])
    add_block(story_public2["id"], 3, "quote", speaker="p4", timecode_ms=8000,
              caption="농사철 이야기", item_keys=["최영희 구술 — 농사철 이야기"])

    # story_private: 비공개 이야기 — 손님에게 행 자체가 안 보여야 한다.
    add_block(story_private["id"], 0, "text", body="아직 정리 중이다.")

    save_manifest(rest)
    print("완료.")


if __name__ == "__main__":
    build_and_run()
