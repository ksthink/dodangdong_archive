import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { bundleFolder, uploadSession } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

/** 브라우저가 Drive 로 바로 올릴 수 있는 세션 주소를 내준다. 관리자만. */
export async function POST(request: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: '관리자만 올릴 수 있다.' }, { status: 403 });

  const { itemId, name, mimeType, size } = await request.json();
  if (!itemId || !name || !size) {
    return NextResponse.json({ error: '자료·파일 이름·크기가 있어야 한다.' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: item } = await supabase
      .from('item').select('identifier, bundle_id').eq('id', itemId).single();
    if (!item) return NextResponse.json({ error: '자료를 찾지 못했다.' }, { status: 404 });

    const folderId = await bundleFolder(item.bundle_id);
    const url = await uploadSession({
      folderId,
      // 파일 이름 앞에 식별자를 붙여 Drive 에서도 어느 자료의 원본인지 보이게 한다.
      name: `${item.identifier} ${name}`,
      mimeType: mimeType || 'application/octet-stream',
      size: Number(size),
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ url });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '업로드 세션을 열지 못했다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
