#!/usr/bin/env python3
"""
가상 시험 자료를 도당동 아카이브 DB(Supabase)와 Google Drive에서 정확히 지운다.

- app_setting 의 key 가 `seed_fake_manifest` (구 형식, 접미사 없음) 또는
  `seed_fake_manifest:*` (신 형식, 여러 조각) 인 행을 모두 모아 합친다.
- 기본은 --dry-run 이다. 지울 것을 표마다 건수와 표본 제목으로만 보여준다.
- 실제로 지우려면 --execute 를 명시해야 한다.
- 실제 데이터(묶음 DC-001, 장소 도당동 본가, 상위 주제 6개)는 manifest 에 있어도
  절대 지우지 않는다.
- 가짜 묶음이 아닌 묶음에 속한 자료가 items 목록에 섞여 있으면 멈춘다.

실행:
  ADMIN_PASSWORD='...' python3 scripts/seed/fake_cleanup.py            # 드라이런(기본)
  ADMIN_PASSWORD='...' python3 scripts/seed/fake_cleanup.py --execute  # 실제 삭제
"""
import argparse
import os
import re
import sys
import json
import requests

SUPABASE_URL = "https://zelpkhsmunptyhxpbsmd.supabase.co"
ANON_KEY = "sb_publishable_kloCj6eAi3z_lkuCpkPZGA_lpSa4ptr"
ADMIN_EMAIL = "ksthink@ksthink.com"

TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API = "https://www.googleapis.com/drive/v3"

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_LOCAL_PATH = os.path.join(HERE, "..", "..", ".env.local")

# 절대 지우지 말아야 할 실제 데이터
REAL_BUNDLE_DC001 = "5f556243-1016-404d-bf2e-4022aaee83a7"
REAL_PLACE_DODANGDONG = "14deef5b-3977-4b9d-b09b-66d5a3660158"

MANIFEST_LIST_KEYS = [
    "bundles", "items", "people", "places", "subjects", "world_events",
    "collections", "files", "drive_file_ids", "drive_folder_ids",
]

TABLE_META = {
    # 표 이름: (id 컬럼, 표본 제목으로 쓸 컬럼, manifest 키)
    "bundles":      ("bundle", "id", "title", "bundles"),
    "items":        ("item", "id", "title", "items"),
    "people":       ("person", "id", "display_name", "people"),
    "places":       ("place", "id", "family_name", "places"),
    "subjects":     ("subject", "id", "label", "subjects"),
    "world_events": ("world_event", "id", "label", "world_events"),
    "collections":  ("collection", "id", "title", "collections"),
}


# ───────────────────────────────────────────── REST 도우미

class Rest:
    def __init__(self, access_token):
        self.headers = {
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def select(self, table, params=""):
        res = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=self.headers)
        if not res.ok:
            raise RuntimeError(f"select {table} 실패 {res.status_code}: {res.text}")
        return res.json()

    def delete(self, table, match):
        h = {**self.headers, "Prefer": "return=minimal"}
        params = "&".join(f"{k}=eq.{v}" for k, v in match.items())
        res = requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=h)
        if not res.ok:
            raise RuntimeError(f"delete {table} 실패 {res.status_code}: {res.text}")

    def delete_in(self, table, column, ids):
        if not ids:
            return
        h = {**self.headers, "Prefer": "return=minimal"}
        ids_param = ",".join(str(i) for i in ids)
        res = requests.delete(
            f"{SUPABASE_URL}/rest/v1/{table}?{column}=in.({ids_param})", headers=h
        )
        if not res.ok:
            raise RuntimeError(f"delete {table} 실패 {res.status_code}: {res.text}")


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


# ───────────────────────────────────────────── .env.local (Google client id/secret)

def read_env_local():
    values = {}
    if not os.path.exists(ENV_LOCAL_PATH):
        return values
    with open(ENV_LOCAL_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values


def google_access_token(rest):
    """관리자 app_setting 의 리프레시 토큰으로 짧은 수명 접근 토큰을 받는다."""
    rows = rest.select("app_setting", "key=eq.google_refresh_token&select=value")
    if not rows:
        return None  # Drive 연결이 안 되어 있다 — Drive 정리는 건너뛴다.
    refresh_token = rows[0]["value"]

    env = read_env_local()
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or env.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or env.get("GOOGLE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("GOOGLE_OAUTH_CLIENT_ID/SECRET 을 찾지 못해 Drive 정리는 건너뛴다.", file=sys.stderr)
        return None

    res = requests.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    if not res.ok:
        print(f"Google 토큰 갱신 실패, Drive 정리는 건너뛴다: {res.status_code} {res.text}", file=sys.stderr)
        return None
    return res.json()["access_token"]


def drive_delete(token, file_or_folder_id, label):
    res = requests.delete(
        f"{DRIVE_API}/files/{file_or_folder_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if res.status_code == 404:
        print(f"  {label} {file_or_folder_id}: 이미 없음(404) — 지운 것으로 본다.")
        return
    if not res.ok:
        raise RuntimeError(f"Drive {label} {file_or_folder_id} 삭제 실패 {res.status_code}: {res.text}")
    print(f"  {label} {file_or_folder_id}: 지움.")


# ───────────────────────────────────────────── manifest 모으기

def load_manifest(rest):
    rows = rest.select("app_setting", "key=like.seed_fake_manifest*&select=key,value")
    if not rows:
        return None, []
    merged = {k: [] for k in MANIFEST_LIST_KEYS}
    keys_found = []
    for row in rows:
        keys_found.append(row["key"])
        try:
            piece = json.loads(row["value"])
        except json.JSONDecodeError:
            print(f"경고: {row['key']} 값이 JSON 이 아니다. 건너뜀.", file=sys.stderr)
            continue
        for k in MANIFEST_LIST_KEYS:
            v = piece.get(k)
            if isinstance(v, list):
                merged[k].extend(v)
    # 중복 제거(순서 유지)
    for k in merged:
        seen = set()
        dedup = []
        for v in merged[k]:
            if v not in seen:
                seen.add(v)
                dedup.append(v)
        merged[k] = dedup
    return merged, keys_found


# ───────────────────────────────────────────── 안전장치

def fetch_fake_bundle_ids(rest):
    """제목이 ' (시험)' 으로 끝나고 note 가 seed:fake 인 묶음의 id 집합."""
    rows = rest.select(
        "bundle",
        "note=eq.seed:fake&select=id,title,note",
    )
    return {r["id"] for r in rows if r["title"].endswith(" (시험)")}


def verify_ids_exist(rest, table, ids, id_col="id"):
    """실제로 그 표에 있는 id 만 돌려준다. 없는 id 는 목록에서 뺀다(경고만)."""
    if not ids:
        return []
    rows = []
    # in() 절 길이 문제를 피하려고 200개씩 나눠 조회
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        ids_param = ",".join(str(x) for x in chunk)
        rows.extend(rest.select(table, f"{id_col}=in.({ids_param})&select={id_col}"))
    found = {r[id_col] for r in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        print(f"경고: {table} 에서 manifest 의 id {len(missing)}건을 찾지 못했다(이미 지워졌을 수 있음).")
    return [i for i in ids if i in found]


# ───────────────────────────────────────────── 실행

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="실제로 지운다. 기본은 드라이런.")
    args = parser.parse_args()
    dry_run = not args.execute

    auth = login()
    rest = Rest(auth["access_token"])

    manifest, manifest_keys = load_manifest(rest)
    if manifest is None:
        print("seed_fake_manifest 행이 없다 — 지울 것 없음.")
        return

    print(f"manifest 조각 {len(manifest_keys)}개 발견: {', '.join(manifest_keys)}")

    # ── 실제 데이터 제외 ──
    bundles = [b for b in manifest["bundles"] if b != REAL_BUNDLE_DC001]
    if REAL_BUNDLE_DC001 in manifest["bundles"]:
        print(f"주의: manifest 에 실제 묶음 DC-001({REAL_BUNDLE_DC001})이 있었지만 제외한다.")

    places = [p for p in manifest["places"] if p != REAL_PLACE_DODANGDONG]
    if REAL_PLACE_DODANGDONG in manifest["places"]:
        print(f"주의: manifest 에 실제 장소 도당동 본가({REAL_PLACE_DODANGDONG})가 있었지만 제외한다.")

    # 상위 주제(parent_id is null)는 절대 지우지 않는다
    top_subjects = {r["id"] for r in rest.select("subject", "parent_id=is.null&select=id")}
    subjects = [s for s in manifest["subjects"] if s not in top_subjects]
    excluded_top = [s for s in manifest["subjects"] if s in top_subjects]
    if excluded_top:
        print(f"주의: manifest 에 상위 주제 {len(excluded_top)}건이 있었지만 제외한다(하위만 지운다).")

    # ── 존재 확인 ──
    bundles = verify_ids_exist(rest, "bundle", bundles)
    items = verify_ids_exist(rest, "item", manifest["items"])
    people = verify_ids_exist(rest, "person", manifest["people"])
    places = verify_ids_exist(rest, "place", places)
    subjects = verify_ids_exist(rest, "subject", subjects)
    world_events = verify_ids_exist(rest, "world_event", manifest["world_events"])
    collections = verify_ids_exist(rest, "collection", manifest["collections"])

    # ── 핵심 안전장치: items 안에 가짜 묶음이 아닌 묶음의 자료가 섞여 있으면 멈춘다 ──
    fake_bundle_ids = fetch_fake_bundle_ids(rest)
    if items:
        item_rows = []
        for i in range(0, len(items), 200):
            chunk = items[i : i + 200]
            ids_param = ",".join(str(x) for x in chunk)
            item_rows.extend(rest.select("item", f"id=in.({ids_param})&select=id,title,bundle_id"))
        bad = [r for r in item_rows if r["bundle_id"] not in fake_bundle_ids]
        if bad:
            print("멈춤: items 목록에 가짜 묶음이 아닌 묶음에 속한 자료가 섞여 있다.")
            for r in bad[:20]:
                print(f"  - {r['title']} (item {r['id']}, bundle {r['bundle_id']})")
            sys.exit(1)

    drive_file_ids = list(manifest["drive_file_ids"])
    drive_folder_ids = list(manifest["drive_folder_ids"])

    # 루트 폴더는 어떤 경우에도 지우지 않는다
    root_folder_rows = rest.select("app_setting", "key=eq.google_root_folder_id&select=value")
    root_folder_id = root_folder_rows[0]["value"] if root_folder_rows else None
    if root_folder_id and root_folder_id in drive_folder_ids:
        drive_folder_ids.remove(root_folder_id)
        print("주의: manifest 에 바깥 루트 Drive 폴더가 있었지만 제외한다.")

    # ── 요약 출력 ──
    def show(label, ids, rows_by_id=None, title_col=None, table=None):
        print(f"\n{label}: {len(ids)}건")
        if not ids:
            return
        sample_ids = ids[:5]
        if table and title_col:
            ids_param = ",".join(str(x) for x in sample_ids)
            rows = rest.select(table, f"id=in.({ids_param})&select=id,{title_col}")
            by_id = {r["id"]: r[title_col] for r in rows}
            for i in sample_ids:
                print(f"  - {by_id.get(i, '?')} ({i})")
        else:
            for i in sample_ids:
                print(f"  - {i}")

    print("\n=== 지울 대상 (dry-run" + (")" if dry_run else " 아님 — 실제 삭제)"))
    show("drive_file_ids", drive_file_ids)
    show("drive_folder_ids", drive_folder_ids)
    show("collections", collections, title_col="title", table="collection")
    show("items", items, title_col="title", table="item")
    show("bundles", bundles, title_col="title", table="bundle")
    show("people", people, title_col="display_name", table="person")
    show("places", places, title_col="family_name", table="place")
    show("subjects(하위)", subjects, title_col="label", table="subject")
    show("world_events", world_events, title_col="label", table="world_event")

    # 관리 화면에서 가짜 자료를 고친 흔적. 자료를 지우면 item_id 가 null 로 풀려
    # 어느 자료의 기록인지 알 수 없게 되므로, 자료보다 먼저 지운다.
    event_log_ids = []
    for column, ids in (("item_id", items), ("bundle_id", bundles)):
        for i in range(0, len(ids), 200):
            chunk = ",".join(str(x) for x in ids[i : i + 200])
            event_log_ids += [r["id"] for r in rest.select("event_log", f"{column}=in.({chunk})&select=id")]
    event_log_ids = list(dict.fromkeys(event_log_ids))
    print(f"\nevent_log(가짜 자료·묶음의 기록): {len(event_log_ids)}건")

    if dry_run:
        print("\n드라이런이다. 실제로 지우려면 --execute 를 붙인다.")
        print_seq_advice(rest, bundles_to_delete=len(bundles), items_to_delete=len(items),
                          people_to_delete=len(people), dry_run=True)
        return

    # ── 실제 삭제 ──
    print("\n=== 실제 삭제 시작 ===")
    try:
        token = google_access_token(rest)
        if token:
            print("Drive 파일 삭제:")
            for fid in drive_file_ids:
                drive_delete(token, fid, "파일")
            print("Drive 폴더 삭제(가짜 묶음 폴더만):")
            for fid in drive_folder_ids:
                drive_delete(token, fid, "폴더")
        else:
            print("Drive 연결 정보가 없어 Drive 정리는 건너뛴다.")

        print(f"event_log 삭제: {len(event_log_ids)}건 (자료보다 먼저 — 지우면 자료 연결이 풀린다)")
        rest.delete_in("event_log", "id", event_log_ids)

        print(f"collections 삭제: {len(collections)}건 (block·ref 는 cascade)")
        rest.delete_in("collection", "id", collections)

        print(f"items 삭제: {len(items)}건 (file, item_person 등 cascade)")
        rest.delete_in("item", "id", items)

        print(f"bundles 삭제: {len(bundles)}건")
        rest.delete_in("bundle", "id", bundles)

        print(f"people 삭제: {len(people)}건 (person_relation, life_period 는 cascade)")
        rest.delete_in("person", "id", people)

        print(f"places 삭제: {len(places)}건")
        rest.delete_in("place", "id", places)

        print(f"subjects(하위) 삭제: {len(subjects)}건")
        rest.delete_in("subject", "id", subjects)

        print(f"world_events 삭제: {len(world_events)}건")
        rest.delete_in("world_event", "id", world_events)

        print("manifest 행 삭제 (seed_fake_manifest*)")
        for k in manifest_keys:
            rest.delete("app_setting", {"key": k})

    except Exception as e:
        print(f"\n실패: {e}", file=sys.stderr)
        print("여기까지 지운 것은 위 출력을 참고한다.", file=sys.stderr)
        sys.exit(1)

    # ── 남은 건수 ──
    print("\n=== 완료. 표마다 남은 건수 ===")
    remaining = {}
    for label, (table, id_col, title_col, _mkey) in TABLE_META.items():
        rows = rest.select(table, "select=id")
        remaining[table] = len(rows)
        print(f"  {table}: {len(rows)}건")

    print_seq_advice_after_execute(rest)


def print_seq_advice(rest, bundles_to_delete, items_to_delete, people_to_delete, dry_run):
    """드라이런에서는 지울 예정 건수를 현재 건수에서 빼서 안내만 한다."""
    item_count = len(rest.select("item", "select=id")) - items_to_delete
    person_count = len(rest.select("person", "select=id")) - people_to_delete
    bundle_rows = rest.select("bundle", "select=id,identifier")
    bundle_count = len(bundle_rows) - bundles_to_delete
    _print_seq_sql(item_count, person_count, bundle_rows, bundles_to_delete)


def print_seq_advice_after_execute(rest):
    item_count = len(rest.select("item", "select=id"))
    person_count = len(rest.select("person", "select=id"))
    bundle_rows = rest.select("bundle", "select=id,identifier")
    _print_seq_sql(item_count, person_count, bundle_rows, 0, real_after=True)


def _print_seq_sql(item_count, person_count, bundle_rows, bundles_deleted_now, real_after=False):
    print("\n(표가 비었을 때만 돌릴 채번 되돌리기 SQL — 참고용, 실행하지 않는다)")
    if item_count <= 0:
        print("  select setval('item_identifier_seq', 1, false);")
    else:
        print(f"  item 표에 {item_count}건이 남으므로 건너뜀.")

    if person_count <= 0:
        print("  select setval('person_identifier_seq', 1, false);")
    else:
        print(f"  person 표에 {person_count}건이 남으므로 건너뜀.")

    remaining_bundles = len(bundle_rows) - (0 if real_after else bundles_deleted_now)
    if remaining_bundles <= 0:
        print("  select setval('bundle_identifier_seq', 1, false);")
    else:
        nums = []
        for r in bundle_rows:
            m = re.match(r"^DC-(\d+)$", r.get("identifier") or "")
            if m:
                nums.append(int(m[1]))
        max_num = max(nums) if nums else 1
        print(f"  DC-001 등 실제 묶음 {remaining_bundles}건이 남는다. 안내:")
        print(f"  select setval('bundle_identifier_seq', {max_num}, true);")


if __name__ == "__main__":
    main()
