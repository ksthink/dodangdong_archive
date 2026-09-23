import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { googleClientId, googleClientSecret } from './env';
import { ROOT_FOLDER_NAME, bundleFolderName, isArchiveName, isDriveId } from './naming';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const REFRESH_TOKEN_KEY = 'google_refresh_token';
const ROOT_FOLDER_KEY = 'google_root_folder_id';

/**
 * app_setting 은 RLS 가 관리자만 읽게 막아 둔 표다. 그래도 서버는 손님의 사진 요청에
 * 답할 때 토큰이 있어야 하므로, 읽기만은 서버 자신의 권한으로 한다.
 * 이 값은 브라우저로 나가지 않는다 — 부르는 쪽(원본 프록시)이 공개 여부를 먼저 판단한다.
 */
async function setting(key: string): Promise<string | null> {
  // 서버 비밀 키가 아직 없으면 요청한 사람의 권한으로 읽는다 — 관리자는 계속 되고,
  // 손님만 사진이 막힌 채로 남는다. 배포 순서 때문에 관리자 업로드까지 깨지지 않게.
  const client = process.env.SUPABASE_SECRET_KEY ? createServiceClient() : await createClient();
  const { data, error } = await client
    .from('app_setting').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`설정을 읽지 못했다: ${error.message}`);
  return data?.value ?? null;
}

export async function putSetting(key: string, value: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('app_setting')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`설정을 저장하지 못했다: ${error.message}`);
}

export async function isConnected() {
  return Boolean(await setting(REFRESH_TOKEN_KEY));
}

export async function saveRefreshToken(token: string) {
  cached = null;
  await putSetting(REFRESH_TOKEN_KEY, token);
}

export async function disconnect() {
  cached = null;
  const supabase = await createClient();
  await supabase.from('app_setting').delete().in('key', [REFRESH_TOKEN_KEY, ROOT_FOLDER_KEY]);
}

/**
 * 짧은 수명의 접근 토큰. 리프레시 토큰은 app_setting 에만 있고 브라우저로 나가지 않는다.
 * 연결된 Drive 계정은 하나뿐이라 모든 요청의 토큰이 같다 — 인스턴스 메모리에 잠시 둬도 섞이지 않는다.
 * 다시 연결하면 이 인스턴스의 캐시는 버리고, 다른 인스턴스는 늦어도 한 시간 안에 새로 받는다.
 */
// 접근 토큰은 한 시간쯤 산다. 같은 함수 인스턴스 안에서는 만료 1분 전까지 다시 쓴다
// (요청마다 설정을 읽고 Google 에 새로 받으면 원본 한 번 여는 데 왕복이 두 번 더 든다).
let cached: { token: string; until: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const refresh = await setting(REFRESH_TOKEN_KEY);
  if (!refresh) throw new Error('Google Drive 가 아직 연결되지 않았다. 관리 → Drive 연결에서 잇는다.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('Google 토큰 갱신 실패', json);
    throw new Error('Google 토큰을 갱신하지 못했다. 관리 → Drive 연결에서 다시 잇는다.');
  }
  cached = { token: json.access_token as string, until: Date.now() + (Number(json.expires_in ?? 3600) - 60) * 1000 };
  return cached.token;
}

async function drive(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    // 구글이 준 본문은 서버 기록에만 남긴다 — 응답으로 내보내면 내부 사정이 함께 나간다.
    console.error(`Drive ${path} ${res.status}`, await res.text());
    throw new Error(`Drive 요청이 실패했다 (${res.status}).`);
  }
  return res;
}

async function createFolder(name: string, parent?: string): Promise<string> {
  const res = await drive('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
  return (await res.json()).id as string;
}

// 이름을 영문으로 바꾸기 전에 만든 바깥 폴더 — 저장된 id 가 없을 때 이것도 찾아 다시 쓴다
const LEGACY_ROOT_FOLDER_NAME = '도당동 아카이브';

/** 이 앱이 볼 수 있는 폴더 중 같은 이름이 이미 있으면 그것을 쓴다. */
async function findFolder(name: string): Promise<string | null> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const { files } = await res.json();
  return files?.[0]?.id ?? null;
}

/**
 * 아카이브 전체가 들어가는 바깥 폴더.
 * 전에 만들어 둔 것이 있으면 다시 쓴다 — 같은 이름의 폴더가 둘이 되지 않게.
 */
export async function rootFolder(): Promise<string> {
  const saved = await setting(ROOT_FOLDER_KEY);
  if (saved) return saved;

  const existing = (await findFolder(ROOT_FOLDER_NAME)) ?? (await findFolder(LEGACY_ROOT_FOLDER_NAME));
  const id = existing ?? (await createFolder(ROOT_FOLDER_NAME));
  await putSetting(ROOT_FOLDER_KEY, id);
  return id;
}

/** 이 폴더에 같은 이름의 파일이 이미 있는가(이 앱이 만든 파일 가운데). */
export async function nameTaken(folderId: string, name: string): Promise<boolean> {
  const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
  const res = await drive(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const { files } = await res.json();
  return Boolean(files?.length);
}

/** 이미 만들어 둔 바깥 폴더. 없으면 null — 보여 주려고 폴더를 새로 만들지는 않는다. */
export async function savedRootFolder(): Promise<string | null> {
  return setting(ROOT_FOLDER_KEY);
}

/** Drive 웹에서 폴더를 여는 주소. 폴더를 만든 Google 계정으로 로그인해 있어야 열린다. */
export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

/** 묶음 하나가 폴더 하나다. bundle.drive_folder_id 에 적어 둔다. */
export async function bundleFolder(bundleId: string): Promise<string> {
  const supabase = await createClient();
  const { data: bundle } = await supabase
    .from('bundle').select('identifier, drive_folder_id').eq('id', bundleId).single();
  if (!bundle) throw new Error('묶음을 찾지 못했다.');
  if (bundle.drive_folder_id) return bundle.drive_folder_id;

  const id = await createFolder(bundleFolderName(bundle.identifier), await rootFolder());
  await supabase.from('bundle').update({ drive_folder_id: id }).eq('id', bundleId);
  return id;
}

/**
 * 브라우저가 Drive 로 바로 올릴 수 있는 세션 주소를 받아 온다.
 * 파일 바이트가 우리 서버를 거치지 않아 큰 영상도 견딘다.
 */
export async function uploadSession(opts: {
  folderId: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
}): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mimeType,
      'X-Upload-Content-Length': String(opts.size),
      Origin: opts.origin,
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId] }),
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error(`Drive upload session ${res.status}`, await res.text());
    throw new Error(`업로드 세션을 열지 못했다 (${res.status}).`);
  }
  const location = res.headers.get('location');
  if (!location) throw new Error('업로드 세션 주소를 받지 못했다.');
  return location;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  md5Checksum: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export async function fileMeta(fileId: string): Promise<DriveFile> {
  if (!isDriveId(fileId)) throw new Error('파일 id 가 규칙에 맞지 않는다.');
  const res = await drive(
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)`,
  );
  const f = await res.json();
  const image = f.imageMediaMetadata ?? {};
  const video = f.videoMediaMetadata ?? {};
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : null,
    md5Checksum: f.md5Checksum ?? null,
    width: image.width ?? video.width ?? null,
    height: image.height ?? video.height ?? null,
    durationMs: video.durationMillis ? Number(video.durationMillis) : null,
  };
}

/**
 * 자료를 지우면 원본도 지운다 — 남겨 두지 않는다.
 * 이 앱이 규칙대로 지은 이름의 파일만 지운다(naming.ts). 앱은 drive.file 범위라
 * 제 손으로 만든 것만 보이지만, 잘못된 id 하나로 다른 자료의 파일을 지우지 않게 한 겹 더 둔다.
 */
export async function deleteFile(fileId: string) {
  if (!isDriveId(fileId)) throw new Error('파일 id 가 규칙에 맞지 않는다.');
  const meta = await fileMeta(fileId).catch(() => null);
  if (!meta) return; // 이미 없거나 볼 수 없는 파일은 지운 것으로 본다
  if (!isArchiveName(meta.name)) {
    throw new Error('이 앱이 만든 이름이 아니라 지우지 않는다.');
  }

  const token = await accessToken();
  const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  // 이미 없는 파일은 지운 것으로 본다.
  if (!res.ok && res.status !== 404) {
    console.error(`Drive delete ${res.status}`, await res.text());
    throw new Error(`원본을 지우지 못했다 (${res.status}).`);
  }
}

/** 바이트를 그대로 흘려보낸다. 공개 여부 판단은 부르는 쪽이 한다. */
export async function fileStream(fileId: string, range: string | null) {
  if (!isDriveId(fileId)) throw new Error('파일 id 가 규칙에 맞지 않는다.');
  const token = await accessToken();
  return fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(range ? { Range: range } : {}),
    },
    cache: 'no-store',
  });
}
