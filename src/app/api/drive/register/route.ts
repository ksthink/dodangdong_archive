import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { deleteFile, fileMeta } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

/**
 * 올리기를 마친 Drive 파일을 자료에 붙인다. 크기·해상도·md5 는 Drive 에서 받아 적는다.
 * 원본(original)이거나, 같은 자료의 원본에서 만든 썸네일(thumb)이다.
 */
export async function POST(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: '관리자만 올릴 수 있다.' }, { status: 403 });

  const { itemId, driveFileId, originalFilename, role = 'original', derivedFrom } = await request.json();
  if (!itemId || !driveFileId) {
    return NextResponse.json({ error: '자료와 파일 id 가 있어야 한다.' }, { status: 400 });
  }
  if (role !== 'original' && role !== 'thumb') {
    return NextResponse.json({ error: `알 수 없는 역할: ${role}` }, { status: 400 });
  }

  const supabase = await createClient();

  // 썸네일은 같은 자료의 원본에서 만든 것이어야 한다.
  if (role === 'thumb') {
    const { data: source } = derivedFrom
      ? await supabase.from('file').select('item_id, role').eq('id', derivedFrom).maybeSingle()
      : { data: null };
    if (!source || source.item_id !== itemId || source.role !== 'original') {
      await deleteFile(driveFileId).catch(() => {});
      return NextResponse.json({ error: '썸네일의 원본이 이 자료의 원본이 아니다.' }, { status: 400 });
    }
  }

  try {
    const meta = await fileMeta(driveFileId);

    const { data, error } = await supabase.from('file').insert({
      item_id: itemId,
      role,
      derived_from: role === 'thumb' ? derivedFrom : null,
      provider: 'gdrive',
      storage_path: meta.id,
      original_filename: originalFilename ?? meta.name,
      mime: meta.mimeType,
      bytes: meta.size,
      width: meta.width,
      height: meta.height,
      duration_ms: meta.durationMs,
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
    const message = cause instanceof Error ? cause.message : '파일을 붙이지 못했다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
