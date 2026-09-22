import { createClient } from '@/lib/supabase/server';
import { googleClientId, googleClientSecret } from './env';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const REFRESH_TOKEN_KEY = 'google_refresh_token';
const ROOT_FOLDER_KEY = 'google_root_folder_id';

/** app_setting 은 관리자만 읽는다 — 손님 정책이 없어 한 행도 가지 않는다. */
async function setting(key: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('app_setting').select('value').eq('key', key).maybeSingle();
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
  await putSetting(REFRESH_TOKEN_KEY, token);
}

export async function disconnect() {
  const supabase = await createClient();
  await supabase.from('app_setting').delete().in('key', [REFRESH_TOKEN_KEY, ROOT_FOLDER_KEY]);
}

/**
 * 짧은 수명의 접근 토큰. 리프레시 토큰은 app_setting 에만 있고 브라우저로 나가지 않는다.
 * 토큰을 메모리에 캐시하지 않는다 — 함수 인스턴스가 재사용돼도 섞이지 않게.
 */
export async function accessToken(): Promise<string> {
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
    throw new Error(`Google 토큰을 갱신하지 못했다: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json.access_token as string;
}

async function drive(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Drive 요청이 실패했다 (${res.status}): ${await res.text()}`);
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

const ROOT_FOLDER_NAME = '도당동 아카이브';

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

  const existing = await findFolder(ROOT_FOLDER_NAME);
  const id = existing ?? (await createFolder(ROOT_FOLDER_NAME));
  await putSetting(ROOT_FOLDER_KEY, id);
  return id;
}

/** 묶음 하나가 폴더 하나다. bundle.drive_folder_id 에 적어 둔다. */
export async function bundleFolder(bundleId: string): Promise<string> {
  const supabase = await createClient();
  const { data: bundle } = await supabase
    .from('bundle').select('identifier, title, drive_folder_id').eq('id', bundleId).single();
  if (!bundle) throw new Error('묶음을 찾지 못했다.');
  if (bundle.drive_folder_id) return bundle.drive_folder_id;

  const id = await createFolder(`${bundle.identifier} ${bundle.title}`, await rootFolder());
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

  if (!res.ok) throw new Error(`업로드 세션을 열지 못했다 (${res.status}): ${await res.text()}`);
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
  const res = await drive(
    `/files/${fileId}?fields=id,name,mimeType,size,md5Checksum,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)`,
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

/** 자료를 지우면 원본도 지운다 — 남겨 두지 않는다. */
export async function deleteFile(fileId: string) {
  const token = await accessToken();
  const res = await fetch(`${API}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  // 이미 없는 파일은 지운 것으로 본다.
  if (!res.ok && res.status !== 404) {
    throw new Error(`원본을 지우지 못했다 (${res.status}): ${await res.text()}`);
  }
}

/** 바이트를 그대로 흘려보낸다. 공개 여부 판단은 부르는 쪽이 한다. */
export async function fileStream(fileId: string, range: string | null) {
  const token = await accessToken();
  return fetch(`${API}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(range ? { Range: range } : {}),
    },
    cache: 'no-store',
  });
}
