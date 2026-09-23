import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { deleteFile, fileMeta } from '@/lib/google/drive';
import { isDriveId } from '@/lib/google/naming';

export const dynamic = 'force-dynamic';

/**
 * 올리기를 마친 Drive 파일을 자료에 붙인다. 크기·해상도·md5 는 Drive 에서 받아 적는다.
 * 원본(original)이거나, 같은 자료의 원본에서 만든 썸네일(thumb)·재생용(stream)이다.
 */
export async function POST(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: '관리자만 올릴 수 있다.' }, { status: 403 });

  const { itemId, driveFileId, originalFilename, role = 'original', derivedFrom, media } = await request.json();
  // 브라우저가 mp4 머리에서 읽은 값(src/lib/mp4.ts). 믿을 만한 모양일 때만 쓴다.
  const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= max ? (v as number) : null);
  const info = media && typeof media === 'object' ? media : {};
  const codecs = Array.isArray(info.codecs) ? info.codecs.filter((c: unknown) => typeof c === 'string' && /^[A-Za-z0-9.]{4}$/.test(c)).slice(0, 4) : [];
  if (!itemId || !driveFileId) {
    return NextResponse.json({ error: '자료와 파일 id 가 있어야 한다.' }, { status: 400 });
  }
  // 이 id 는 Drive 주소에 그대로 들어가고 되돌리기(지우기)의 대상이 된다 — 모양부터 본다.
  if (!isDriveId(driveFileId)) {
    return NextResponse.json({ error: '파일 id 가 규칙에 맞지 않는다.' }, { status: 400 });
  }
  if (role !== 'original' && role !== 'thumb' && role !== 'stream' && role !== 'face') {
    return NextResponse.json({ error: `알 수 없는 역할: ${role}` }, { status: 400 });
  }

  const supabase = await createClient();

  // 썸네일·재생용은 같은 자료의 원본에서 만든 것이어야 한다.
  if (role === 'thumb' || role === 'stream' || role === 'face') {
    const { data: source } = derivedFrom
      ? await supabase.from('file').select('item_id, role').eq('id', derivedFrom).maybeSingle()
      : { data: null };
    if (!source || source.item_id !== itemId || source.role !== 'original') {
      await deleteFile(driveFileId).catch(() => {});
      return NextResponse.json({ error: '파생 파일의 원본이 이 자료의 원본이 아니다.' }, { status: 400 });
    }
  }

  try {
    const meta = await fileMeta(driveFileId);

    const { data, error } = await supabase.from('file').insert({
      item_id: itemId,
      role,
      derived_from: role === 'original' ? null : derivedFrom,
      provider: 'gdrive',
      storage_path: meta.id,
      original_filename: originalFilename ?? meta.name,
      mime: meta.mimeType,
      bytes: meta.size,
      // Drive 가 준 값이 먼저, 없으면 브라우저가 읽은 값
      width: meta.width ?? int(info.width, 20000),
      height: meta.height ?? int(info.height, 20000),
      duration_ms: meta.durationMs ?? int(info.durationMs, 2_000_000_000),
      codec: codecs.length ? codecs.join(',') : null,
      faststart: typeof info.faststart === 'boolean' && codecs.length ? info.faststart : null,
      // 내려받아 계산한 값이 아니라 Drive 가 보고한 값이다.
      checksum_md5: meta.md5Checksum,
      checksum_verified: false,
    }).select('id').single();

    if (error) {
      // 표에 남기지 못하면 Drive 에 떠도는 파일이 된다 — 되돌린다.
      await deleteFile(meta.id).catch(() => {});
      throw new Error(error.message);
    }

    if (role === 'original') await supabase.from('event_log').insert({ item_id: itemId, action: 'file.add' });
    return NextResponse.json({ id: data.id });
  } catch (cause) {
    console.error('drive/register', cause);
    return NextResponse.json({ error: '파일을 붙이지 못했다.' }, { status: 500 });
  }
}
