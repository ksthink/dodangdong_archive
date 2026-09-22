// (선택 도구) 영상 원본에서 재생용 사본을 이 컴퓨터에서 만들어 붙인다. 원본은 건드리지 않는다.
//
// 보통은 관리자가 PC 에서 H.264·AAC·웹 최적화 MP4 로 바꿔 관리 화면의 "재생용 올리기"로 붙인다.
// 이 스크립트는 그 일을 ffmpeg 로 대신한다 — 변환은 재생 시간의 몇 배가 걸리니 긴 영상은 오래 걸린다.
//
//   1. 원본 행의 빈 정보(길이·크기·코덱·목차 위치)를 ffprobe 로 채운다
//   2. 썸네일(목록·재생기 포스터)이 없으면 한 장면을 떠서 붙인다     → role 'thumb'
//   3. 재생용 사본이 필요하면 만들어 붙인다                          → role 'stream'
//        - H.264 인데 목차(moov)가 끝에 있음 → 무손실 재배치(faststart)
//        - HEVC 따위 널리 재생되지 않는 코덱 → H.264 로 변환(긴 변 최대 1920, faststart)
//      재생기는 사본이 있으면 사본을, 없으면 원본을 튼다.
//
//   ADMIN_PASSWORD='…' node scripts/tidy-videos.mjs                  # 할 일만 본다(드라이런)
//   ADMIN_PASSWORD='…' node scripts/tidy-videos.mjs --execute        # 실제로 한다
//   ADMIN_PASSWORD='…' node scripts/tidy-videos.mjs --item DA-0053   # 자료 하나만
//
// ffmpeg·ffprobe 가 있어야 한다. 비밀번호는 환경변수로만 받는다. Google 값은 .env.local 에서.
// 이름 규칙은 src/lib/google/naming.ts 와 같다(원본 이름 + _thumb.jpg / _stream.mp4).
import { readFileSync, createWriteStream, openAsBlob, mkdtempSync, rmSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const EXECUTE = process.argv.includes('--execute');
const ONLY = process.argv.includes('--item') ? process.argv[process.argv.indexOf('--item') + 1] : null;
const THUMB_EDGE = 480;
const STREAM_EDGE = 1920;
const WIDE = ['avc1', 'avc3'];

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

const session = await json(await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ksthink@ksthink.com', password }),
}));
const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, {
  ...init, headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});
const [{ value: refresh }] = await json(await rest('app_setting?select=value&key=eq.google_refresh_token'));
const { access_token: gToken } = await json(await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GOOGLE_OAUTH_CLIENT_ID, client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
}));
const drive = (path, init = {}) => fetch(`https://www.googleapis.com${path}`, { ...init, headers: { Authorization: `Bearer ${gToken}`, ...(init.headers ?? {}) } });

const ascii = (name) => { if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`파일 이름 규칙에 맞지 않는다: ${name}`); return name; };
const base = (name) => name.replace(/\.[^.]+$/, '');

/** 파일 맨 위 상자 순서로 목차(moov)가 본문(mdat)보다 앞인지 본다 */
function faststartOf(path) {
  const fd = openSync(path, 'r');
  const size = statSync(path).size;
  const head = Buffer.alloc(16);
  let pos = 0, moov = -1, mdat = -1;
  try {
    while (pos + 8 <= size) {
      readSync(fd, head, 0, 16, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (len === 1) len = Number(head.readBigUInt64BE(8));
      if (len === 0) len = size - pos;
      if (len < 8) break;
      if (type === 'moov') moov = pos;
      if (type === 'mdat') mdat = pos;
      pos += len;
    }
  } finally { closeSync(fd); }
  return mdat < 0 || (moov >= 0 && moov < mdat);
}

function probe(path) {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type,codec_tag_string,width,height', '-of', 'json', path]).toString());
  const video = out.streams.find((s) => s.codec_type === 'video');
  const audio = out.streams.find((s) => s.codec_type === 'audio');
  const tags = [video?.codec_tag_string, audio?.codec_tag_string].filter((t) => t && /^[A-Za-z0-9.]{4}$/.test(t));
  return {
    videoCodec: video?.codec_tag_string ?? null,
    audioCodec: audio?.codec_tag_string ?? null,
    codec: tags.length ? tags.join(',') : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationMs: out.format?.duration ? Math.round(Number(out.format.duration) * 1000) : null,
    faststart: faststartOf(path),
  };
}

/** 같은 폴더에 새 Drive 파일로 올린다 — resumable 세션 + PUT 한 번 */
async function upload(path, name, mime, parents) {
  const size = statSync(path).size;
  const start = await drive('/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify({ name, parents }),
  });
  if (!start.ok) throw new Error(`업로드 세션 (${start.status}) ${await start.text()}`);
  // 파일을 통째로 메모리에 올리지 않고 흘려 보낸다
  const put = await fetch(start.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': mime }, body: await openAsBlob(path) });
  const { id } = await json(put);
  return json(await drive(`/drive/v3/files/${id}?fields=id,size,md5Checksum`));
}

async function insertFile(row) {
  const [created] = await json(await rest('file', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }));
  return created;
}

const originals = await json(await rest(
  'file?select=id,item_id,storage_path,mime,width,height,duration_ms,codec,faststart,item(identifier,title),derived:file!derived_from(role)'
  + '&role=eq.original&provider=eq.gdrive&mime=like.video/*&order=created_at'));
const todo = originals.filter((f) => !ONLY || f.item?.identifier === ONLY);
console.log(`영상 원본 ${todo.length}개${EXECUTE ? '' : ' — 드라이런(바꾸지 않는다)'}\n`);

for (const f of todo) {
  const label = `${f.item?.identifier} ${f.item?.title ?? ''}`;
  const hasThumb = f.derived?.some((d) => d.role === 'thumb');
  const hasStream = f.derived?.some((d) => d.role === 'stream');
  const dir = mkdtempSync(join(tmpdir(), 'tidy-'));
  try {
    const meta = await json(await drive(`/drive/v3/files/${f.storage_path}?fields=name,parents`));
    const src = join(dir, 'original');
    const res = await drive(`/drive/v3/files/${f.storage_path}?alt=media`);
    if (!res.ok) throw new Error(`원본을 받지 못했다 (${res.status})`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(src)); // 큰 파일도 디스크로 흘려 받는다
    const info = probe(src);
    const wide = WIDE.includes(info.videoCodec);
    const needStream = !hasStream && (!wide || !info.faststart);
    console.log(`■ ${label}  (${meta.name})`);
    console.log(`  코덱 ${info.codec} · ${info.width}×${info.height} · ${(info.durationMs / 1000).toFixed(1)}초 · 목차 ${info.faststart ? '앞' : '끝'}`);

    // 1. 원본 행의 빈 정보
    const fill = {};
    if (f.duration_ms == null && info.durationMs) fill.duration_ms = info.durationMs;
    if (f.width == null && info.width) fill.width = info.width;
    if (f.height == null && info.height) fill.height = info.height;
    if (f.codec == null && info.codec) fill.codec = info.codec;
    if (f.faststart == null) fill.faststart = info.faststart;
    if (Object.keys(fill).length) {
      console.log(`  ✎ 원본 정보 채움: ${Object.keys(fill).join(', ')}`);
      if (EXECUTE) await json(await rest(`file?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify(fill) }));
    }

    // 2. 썸네일
    if (!hasThumb) {
      const name = ascii(`${base(meta.name)}_thumb.jpg`);
      console.log(`  ＋ 썸네일 ${name}`);
      if (EXECUTE) {
        const jpg = join(dir, 'thumb.jpg');
        const at = Math.min(1, (info.durationMs ?? 2000) / 2000);
        execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', src, '-frames:v', '1',
          '-vf', `scale=${THUMB_EDGE}:${THUMB_EDGE}:force_original_aspect_ratio=decrease`, '-q:v', '4', jpg, '-y']);
        const t = probe(jpg);
        const up = await upload(jpg, name, 'image/jpeg', meta.parents);
        await insertFile({ item_id: f.item_id, role: 'thumb', derived_from: f.id, provider: 'gdrive', storage_path: up.id,
          original_filename: name, mime: 'image/jpeg', bytes: Number(up.size), width: t.width, height: t.height, checksum_md5: up.md5Checksum });
      }
    }

    // 3. 재생용 사본
    if (needStream) {
      const name = ascii(`${base(meta.name)}_stream.mp4`);
      const how = wide ? '무손실 재배치(faststart)' : `${info.videoCodec} → H.264 변환`;
      console.log(`  ＋ 재생용 사본 ${name} — ${how}`);
      if (EXECUTE) {
        const out = join(dir, 'stream.mp4');
        const args = wide
          ? ['-v', 'error', '-i', src, '-map', '0', '-c', 'copy', '-movflags', '+faststart', out, '-y']
          : ['-v', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?',
            '-vf', `scale='if(gt(iw,ih),min(${STREAM_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${STREAM_EDGE},ih))'`,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-c:a', info.audioCodec === 'mp4a' ? 'copy' : 'aac', '-movflags', '+faststart', out, '-y'];
        const t0 = Date.now();
        execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
        const s = probe(out);
        const up = await upload(out, name, 'video/mp4', meta.parents);
        await insertFile({ item_id: f.item_id, role: 'stream', derived_from: f.id, provider: 'gdrive', storage_path: up.id,
          original_filename: name, mime: 'video/mp4', bytes: Number(up.size), width: s.width, height: s.height,
          duration_ms: s.durationMs, codec: s.codec, faststart: s.faststart, checksum_md5: up.md5Checksum });
        console.log(`    ${((Date.now() - t0) / 1000).toFixed(1)}초 · ${(statSync(out).size / 1e6).toFixed(1)}MB · ${s.codec} ${s.width}×${s.height} · 목차 ${s.faststart ? '앞' : '끝'}`);
      }
    } else if (!hasStream) {
      console.log('  · 재생용 사본 필요 없음(H.264, 목차 앞)');
    }
  } catch (e) {
    console.log(`  ✗ ${label}: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
if (!EXECUTE) console.log('\n실제로 하려면 --execute 를 붙인다.');
