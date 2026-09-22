#!/usr/bin/env python3
"""
연표용 바깥 세상 사건(world_event)을 시험 자료로 채운다.
- world_event 12건: 1950~2020 한국 현대사의 큰 사회적 사건.
- 만든 id를 app_setting(key=seed_fake_manifest:world)과
  scripts/seed/fake-manifest.world.json에 남긴다.
- 이미 seed_fake_manifest:world가 있으면 멈춘다(중복 방지).
- 비밀번호는 환경변수 ADMIN_PASSWORD로만 받는다. 파일에 쓰지 않는다.

실행: ADMIN_PASSWORD=... python3 scripts/seed/fake_world.py
"""
import os
import sys
import json
import datetime
import requests

SUPABASE_URL = "https://zelpkhsmunptyhxpbsmd.supabase.co"
ANON_KEY = "sb_publishable_kloCj6eAi3z_lkuCpkPZGA_lpSa4ptr"
ADMIN_EMAIL = "ksthink@ksthink.com"

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "fake-manifest.world.json")
MANIFEST_KEY = "seed_fake_manifest:world"

manifest = {"created_at": None, "world_events": []}

# year, label, note, sort_order (연도 내 순서) — 1970·80년대에 조금 몰리게 12건
WORLD_EVENTS = [
    (1950, "한국전쟁 발발", "", 0),
    (1953, "정전협정 체결", "", 0),
    (1960, "4·19 혁명", "", 0),
    (1970, "경부고속도로 개통", "", 0),
    (1972, "새마을운동 본격화", "전국적으로 마을 단위 사업이 확산되었다.", 0),
    (1978, "자연보호헌장 선포", "", 0),
    (1979, "10·26 사건", "", 0),
    (1979, "12·12 사태", "", 1),
    (1980, "5·18 민주화운동", "", 0),
    (1988, "서울올림픽", "", 0),
    (1997, "외환위기(IMF 구제금융)", "", 0),
    (2002, "한일 월드컵", "", 0),
]


class Rest:
    def __init__(self, access_token):
        self.headers = {
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def insert(self, table, rows, ret="representation"):
        single = isinstance(rows, dict)
        h = {**self.headers, "Prefer": f"return={ret}"}
        res = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=h, json=rows)
        if not res.ok:
            raise RuntimeError(f"insert {table} 실패 {res.status_code}: {res.text}")
        if ret == "minimal":
            return None
        data = res.json()
        return data[0] if single and isinstance(data, list) else data

    def select(self, table, params=""):
        res = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=self.headers)
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
    rows = rest.select("app_setting", f"key=eq.{MANIFEST_KEY}&select=key")
    return bool(rows)


def save_manifest(rest):
    manifest["created_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    body = json.dumps(manifest, ensure_ascii=False)
    rest.insert("app_setting", {"key": MANIFEST_KEY, "value": body}, ret="minimal")
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"manifest 저장: {MANIFEST_PATH}")


def main():
    tok = login()
    rest = Rest(tok["access_token"])

    if already_seeded(rest):
        print(f"이미 {MANIFEST_KEY}가 있다. 중단.", file=sys.stderr)
        sys.exit(1)

    rows = [
        {"year": y, "label": label, "note": note or None, "sort_order": so}
        for (y, label, note, so) in WORLD_EVENTS
    ]
    created = rest.insert("world_event", rows, ret="representation")
    manifest["world_events"] = [r["id"] for r in created]

    save_manifest(rest)
    print(f"world_event {len(created)}건 생성 완료.")


if __name__ == "__main__":
    main()
