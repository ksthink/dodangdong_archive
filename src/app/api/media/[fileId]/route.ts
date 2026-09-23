import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getAdmin } from '@/lib/supabase/server';
import { accessToken, fileStream } from '@/lib/google/drive';
import { isAllowedMime } from '@/lib/media-types';

export const dynamic = 'force-dynamic';

/** 헤더에 넣을 파일 이름. ASCII 만 따로 남기고 원래 이름은 RFC 5987 로 덧붙인다. */
function disposition(kind: 'inline' | 'attachment', name: string | null) {
  if (!name) return kind;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * 원본 바이트는 늘 이곳을 거친다. Drive 파일 자체는 비공개로 두고,
 * 공개 범위 판단을 여기서 한 번만 한다 — 자료를 비공개로 돌리면 즉시 막힌다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  // Google 접근 토큰을 파일 조회와 동시에 준비해 둔다(없으면 받아 오고, 있으면 곧바로 끝난다)
  const warm = accessToken().catch(() => null);
  const supabase = await createClient();

  // RLS 가 이미 손님에게는 공개 자료의 file 행만 준다. 못 찾으면 없는 것과 같다.
  const { data: file } = await supabase
    .from('file')
    .select('storage_path, mime, original_filename, item_id, item(access_level)')
    .eq('id', fileId)
    .maybeSingle();

  if (!file) return new NextResponse('찾을 수 없다.', { status: 404 });

  const item = Array.isArray(file.item) ? file.item[0] : file.item;
  const isPublic = item?.access_level === 'public';
  // 손님에게 비공개가 새지 않게 한 번 더 확인한다.
  if (!isPublic && !(await getAdmin())) return new NextResponse('찾을 수 없다.', { status: 404 });

  try {
    await warm;
    const upstream = await fileStream(file.storage_path, request.headers.get('range'));
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse('원본을 읽지 못했다.', { status: upstream.status });
    }

    // 올린 때의 mime 을 그대로 믿지 않는다 — 목록에 없으면 내려받기로 돌린다.
    const mime = (file.mime ?? '').toLowerCase();
    const inline = isAllowedMime(mime);

    const headers = new Headers();
    headers.set('Content-Type', inline ? mime : 'application/octet-stream');
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('Accept-Ranges', 'bytes');
    // 적어 준 갈래 그대로 읽게 한다. 브라우저가 내용을 보고 짐작하면 위 검사가 헛돈다.
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', disposition(inline ? 'inline' : 'attachment', file.original_filename));
    // 혹시 펼쳐지더라도 같은 출처의 권한은 주지 않는다.
    headers.set('Content-Security-Policy', 'sandbox');
    // 공개 자료만 edge 에 잠깐 둔다. 비공개는 어디에도 남기지 않는다.
    // 부분 응답(206)은 범위마다 다른 바이트라 캐시에 두지 않는다.
    headers.set(
      'Cache-Control',
      isPublic && upstream.status !== 206 ? 'public, max-age=0, s-maxage=60' : 'private, no-store',
    );

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (cause) {
    // 상류(구글·DB)가 무슨 말을 했는지는 서버 기록에만 남긴다.
    console.error(`media ${fileId}`, cause);
    return new NextResponse('원본을 읽지 못했다.', { status: 500 });
  }
}
