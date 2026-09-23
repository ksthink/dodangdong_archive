import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { bundleFolder, fileMeta, nameTaken, uploadSession } from '@/lib/google/drive';
import { extOf, faceName, originalName, streamName, thumbName } from '@/lib/google/naming';
import { isAllowedMime } from '@/lib/media-types';

export const dynamic = 'force-dynamic';

/** 브라우저가 Drive 로 바로 올릴 수 있는 세션 주소를 내준다. 관리자만. */
export async function POST(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: '관리자만 올릴 수 있다.' }, { status: 403 });

  const { itemId, name, mimeType, size, role, derivedFrom, faceOf } = await request.json();
  if (!itemId || !name || !size) {
    return NextResponse.json({ error: '자료·파일 이름·크기가 있어야 한다.' }, { status: 400 });
  }
  // 받는 갈래를 여기서 한 번 거른다(src/lib/media-types.ts). 내보내는 쪽도 같은 목록을 본다.
  if (!isAllowedMime(mimeType)) {
    return NextResponse.json({ error: `받지 않는 갈래다: ${String(mimeType ?? '알 수 없음')}` }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: item } = await supabase
      .from('item').select('identifier, bundle_id').eq('id', itemId).single();
    if (!item) return NextResponse.json({ error: '자료를 찾지 못했다.' }, { status: 404 });

    const folderId = await bundleFolder(item.bundle_id);

    // Drive 이름은 규칙대로(src/lib/google/naming.ts). 올린 원래 이름은 register 가 표에 남긴다.
    let driveName: string;
    if (role === 'thumb' || role === 'stream' || role === 'face') {
      // 파생 파일은 그 원본의 Drive 이름을 따른다 — 원본이 이 자료의 것인지 확인한다
      const { data: source } = await supabase
        .from('file').select('storage_path, mime').eq('id', derivedFrom ?? '').eq('item_id', itemId).eq('role', 'original').maybeSingle();
      if (!source) return NextResponse.json({ error: '파생 파일의 원본이 이 자료의 원본이 아니다.' }, { status: 400 });
      if (role === 'stream' && !source.mime?.startsWith('video/')) {
        return NextResponse.json({ error: '재생용은 영상 원본에만 붙인다.' }, { status: 400 });
      }
      if (role === 'face' && !source.mime?.startsWith('image/')) {
        return NextResponse.json({ error: '얼굴은 사진 원본에서만 잘라 낸다.' }, { status: 400 });
      }
      if (role === 'face' && !/^DP-\d+$/.test(String(faceOf ?? ''))) {
        return NextResponse.json({ error: '얼굴은 누구의 것인지 함께 보내야 한다.' }, { status: 400 });
      }
      const sourceName = (await fileMeta(source.storage_path)).name;
      if (role === 'thumb') driveName = thumbName(sourceName);
      else if (role === 'stream') driveName = streamName(sourceName);
      else {
        // 같은 사람을 다시 자르면 옛 파일이 아직 있다 — 겹치면 -2, -3
        let n = 1;
        while (await nameTaken(folderId, faceName(sourceName, String(faceOf), n))) {
          if (++n > 20) throw new Error('같은 이름이 너무 많다.');
        }
        driveName = faceName(sourceName, String(faceOf), n);
      }
    } else {
      const at = new Date();
      const ext = extOf(String(name));
      let n = 1;
      // 한 번에 여러 장을 고르면 같은 초에 올라갈 수 있다 — 겹치면 -2, -3 …
      while (await nameTaken(folderId, originalName(item.identifier, at, ext, n))) {
        if (++n > 50) throw new Error('같은 이름이 너무 많다. 잠시 뒤 다시 올린다.');
      }
      driveName = originalName(item.identifier, at, ext, n);
    }

    const url = await uploadSession({
      folderId,
      name: driveName,
      mimeType,
      size: Number(size),
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ url });
  } catch (cause) {
    console.error('drive/session', cause);
    return NextResponse.json({ error: '업로드 세션을 열지 못했다.' }, { status: 500 });
  }
}
