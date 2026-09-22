// 썸네일이 없는 사진 원본에 목록용 썸네일(긴 변 480px JPEG)을 만들어 붙인다.
//
// 브라우저가 올릴 때 썸네일을 만들지만, 그러지 못한 원본이 있다:
//   - 썸네일 기능이 생기기 전에 올린 것
//   - 브라우저가 열지 못하는 형식(TIFF 스캔본 따위) — sharp 는 연다
//
//   ADMIN_PASSWORD='…' node scripts/backfill-thumbs.mjs            # 채운다
//   ADMIN_PASSWORD='…' node scripts/backfill-thumbs.mjs --dry-run  # 무엇을 채울지만 본다
//
// 이미 썸네일이 있는 원본은 건너뛴다(여러 번 돌려도 두 벌이 되지 않는다).
// 비밀번호는 환경변수로만 받는다. Google 값은 .env.local 에서 읽는다.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const EDGE = 480;
const DRY = process.argv.includes('--dry-run');

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

// 관리자로 로그인 — RLS 가 관리자만 file 에 쓰고 app_setting 을 읽게 한다
const session = await json(await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ksthink@ksthink.com', password }),
}));
const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, {
  ...init, headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

// 썸네일이 없는 사진 원본
const originals = await json(await rest(
  'file?select=id,item_id,storage_path,original_filename,mime,thumbs:file!derived_from(id)&role=eq.original&provider=eq.gdrive&mime=like.image/*&order=created_at'));
const todo = originals.filter((f) => !f.thumbs?.length);
console.log(`사진 원본 ${originals.length}개 중 썸네일 없는 것 ${todo.length}개`);
for (const f of todo) console.log(`  - ${f.original_filename} (${f.mime})`);
if (DRY || !todo.length) process.exit(0);

// Google 접근 토큰
const [{ value: refresh }] = await json(await rest('app_setting?select=value&key=eq.google_refresh_token'));
const { access_token: gToken } = await json(await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
}));
const drive = (path, init = {}) => fetch(`https://www.googleapis.com${path}`, { ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) } });

let made = 0;
for (const f of todo) {
  try {
    // 원본을 받아 줄인다. 원본은 건드리지 않는다.
    const res = await drive(`/drive/v3/files/${f.storage_path}?alt=media`);
    if (!res.ok) throw new Error(`원본을 받지 못했다 (${res.status})`);
    const { data: jpeg, info } = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate() // EXIF 방향대로 세운다
      .resize({ width: EDGE, height: EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    // 원본과 같은 폴더(그 자료의 묶음 폴더)에 올린다
    const { parents } = await json(await drive(`/drive/v3/files/${f.storage_path}?fields=parents`));
    const name = `썸네일 ${(f.original_filename ?? 'image').replace(/\.[^.]+$/, '')}.jpg`;
    const boundary = 'dodang-thumb';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents })}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
      jpeg,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const up = await json(await drive('/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum,size', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    }));

    const ins = await rest('file', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        item_id: f.item_id, role: 'thumb', derived_from: f.id, provider: 'gdrive',
        storage_path: up.id, original_filename: name, mime: 'image/jpeg',
        bytes: Number(up.size), width: info.width, height: info.height,
        checksum_md5: up.md5Checksum, checksum_verified: false,
      }),
    });
    if (!ins.ok) {
      // 표에 적지 못하면 Drive 에 떠도는 파일이 된다 — 되돌린다
      await drive(`/drive/v3/files/${up.id}`, { method: 'DELETE' });
      throw new Error(`표에 적지 못했다: ${await ins.text()}`);
    }
    made += 1;
    console.log(`  ✓ ${f.original_filename} → ${info.width}×${info.height} ${Math.round(jpeg.length / 1024)}KB`);
  } catch (e) {
    console.log(`  ✗ ${f.original_filename}: ${e.message}`);
  }
}
console.log(`썸네일 ${made}개를 만들었다.`);
