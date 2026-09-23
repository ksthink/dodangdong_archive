// 이미 Drive 에 올린 원본·썸네일과 폴더의 이름을 지금 규칙으로 바꾼다.
//
//   dodangdong-archive/                바깥 폴더
//     DC-003/                          묶음 폴더 — 식별자만
//
//   DA-0017_20260922190012.jpg         원본 — 식별자_올린 시각(한국 시간, 초까지)
//   DA-0017_20260922190012-2.jpg       같은 자료에서 같은 초에 올린 것은 -2, -3 …
//   DA-0017_20260922190012_thumb.jpg   썸네일 — 원본 이름 + _thumb
//
// 규칙은 src/lib/google/naming.ts 와 같다 — 바꾸면 함께 바꾼다.
// 이미 규칙에 맞는 이름(식별자_14자리 시각[-순번].확장자)은 그대로 둔다 — 앱은 업로드를 시작한
// 시각으로 이름을 짓는데, 표의 created_at 은 다 올린 뒤의 시각이라 큰 파일일수록 몇 초씩 다르다.
// 규칙에 맞지 않는 원본만 created_at 으로 새로 짓고, 확장자는 올린 원래 이름에서 딴다.
// 파일 id 는 그대로이므로 아카이브의 링크는 깨지지 않는다.
//
//   ADMIN_PASSWORD='…' node scripts/rename-drive-files.mjs            # 바꿀 목록만 본다(드라이런)
//   ADMIN_PASSWORD='…' node scripts/rename-drive-files.mjs --execute  # 실제로 바꾼다
//
// 비밀번호는 환경변수로만 받는다. Google 값은 .env.local 에서 읽는다.
import { readFileSync } from 'node:fs';

const EXECUTE = process.argv.includes('--execute');

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.ADMIN_PASSWORD;
if (!password) { console.error('ADMIN_PASSWORD 환경변수가 없다.'); process.exit(1); }

async function json(res) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── 이름 규칙 (src/lib/google/naming.ts 와 같다)
const STAMP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const uploadStamp = (at) => {
  const p = Object.fromEntries(STAMP.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
};
const extOf = (filename) => { const m = filename.match(/\.([A-Za-z0-9]{1,5})$/); return m ? `.${m[1].toLowerCase()}` : ''; };
const originalName = (identifier, at, ext, n = 1) => {
  const base = `${identifier}_${uploadStamp(at)}`;
  return `${n > 1 ? `${base}-${n}` : base}${ext}`;
};
const thumbName = (originalDriveName) => `${originalDriveName.replace(/\.[^.]+$/, '')}_thumb.jpg`;
// 한글·공백이 섞인 이름은 만들지 않는다
const ascii = (name) => { if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`파일 이름 규칙에 맞지 않는다: ${name}`); return name; };

// ── 관리자로 로그인 — RLS 가 관리자만 file 전부와 app_setting 을 읽게 한다
const session = await json(await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ksthink@ksthink.com', password }),
}));
const rest = (path) => fetch(`${SB}/rest/v1/${path}`, {
  headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}` },
});

const [{ value: refresh }] = await json(await rest('app_setting?select=value&key=eq.google_refresh_token'));
const { access_token: gToken } = await json(await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
}));
const drive = (path, init = {}) => fetch(`https://www.googleapis.com/drive/v3${path}`, {
  ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) },
});

const files = await json(await rest(
  'file?select=id,role,storage_path,derived_from,original_filename,created_at,item(identifier)&provider=eq.gdrive&order=created_at'));

// 지금 Drive 이름 — 이미 규칙에 맞는 것은 그대로 쓰려고 먼저 읽는다
const current = new Map();
for (const f of files) {
  const res = await drive(`/files/${f.storage_path}?fields=name`);
  if (res.ok) current.set(f.id, (await res.json()).name);
}
const conforms = (identifier, name) =>
  new RegExp(`^${identifier}_\\d{14}(-\\d+)?(\\.[a-z0-9]{1,5})?$`).test(name ?? '');

// 원본 먼저 — 썸네일 이름이 원본의 이름을 따르므로
const planned = new Map(); // file.id → 새 이름
const used = new Set();
const originals = files.filter((x) => x.role === 'original');
for (const f of originals) {
  const name = current.get(f.id);
  if (f.item?.identifier && conforms(f.item.identifier, name)) { planned.set(f.id, name); used.add(name); }
}
for (const f of originals) {
  const identifier = f.item?.identifier;
  if (!identifier || planned.has(f.id)) continue;
  const at = new Date(f.created_at);
  const ext = extOf(f.original_filename ?? '');
  let n = 1;
  while (used.has(originalName(identifier, at, ext, n))) n++;
  const name = originalName(identifier, at, ext, n);
  used.add(name);
  planned.set(f.id, ascii(name));
}
for (const f of files.filter((x) => x.role === 'thumb')) {
  const source = planned.get(f.derived_from);
  if (source) planned.set(f.id, ascii(thumbName(source)));
}

let changed = 0, same = 0, failed = 0;

// 한 항목(파일이든 폴더든)의 Drive 이름을 맞춘다
async function rename(driveId, next, label) {
  const res = await drive(`/files/${driveId}?fields=name`);
  if (!res.ok) { failed++; console.log(`  ✗ ${label}: Drive 에서 찾지 못함 (${res.status})`); return; }
  const { name: current } = await res.json();
  if (current === next) { same++; return; }
  console.log(`  ${label} ${current}\n         → ${next}`);
  if (EXECUTE) {
    const up = await drive(`/files/${driveId}?fields=name`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ name: next }),
    });
    if (!up.ok) { failed++; console.log(`    ✗ 바꾸지 못함 (${up.status}) ${await up.text()}`); return; }
  }
  changed++;
}

// 폴더 — 바깥 폴더와 묶음 폴더
const [root] = await json(await rest('app_setting?select=value&key=eq.google_root_folder_id'));
if (root?.value) await rename(root.value, 'dodangdong-archive', '폴더  ');
for (const b of await json(await rest('bundle?select=identifier,drive_folder_id&drive_folder_id=not.is.null&order=identifier'))) {
  await rename(b.drive_folder_id, ascii(b.identifier), '폴더  ');
}

for (const f of files) {
  const next = planned.get(f.id);
  if (!next) {
    // 재생용(stream)·얼굴(face)은 이 스크립트가 다루지 않는다 — 원본 이름이 바뀔 일이 거의 없고,
    // 얼굴 이름에는 사람 식별자가 들어가 여기서 다시 짓기 번거롭다.
    const why = f.role === 'original' || f.role === 'thumb' ? '자료나 원본을 찾지 못함' : `${f.role} 은 다루지 않음`;
    console.log(`  건너뜀(${why}) ${f.id}`);
    continue;
  }
  await rename(f.storage_path, next, f.role === 'thumb' ? '썸네일' : '원본  ');
}

console.log(`\n${EXECUTE ? '바꿈' : '바꿀 것'} ${changed}개 · 이미 규칙대로 ${same}개 · 실패 ${failed}개`);
if (!EXECUTE && changed) console.log('실제로 바꾸려면 --execute 를 붙인다.');
