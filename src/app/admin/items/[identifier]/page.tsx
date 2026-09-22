import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateItem, deleteItem, detachFile } from '@/lib/actions';
import { saveTranscript } from '@/lib/transcript-actions';
import { parseTranscript } from '@/lib/transcript';
import ItemForm from '../item-form';
import DeleteBox from './delete-box';
import Uploader from './uploader';
import StreamUploader from './stream-uploader';
import { folderUrl, isConnected } from '@/lib/google/drive';

export const dynamic = 'force-dynamic';

export default async function EditItemPage({
  params, searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { identifier } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const { data: item } = await supabase.from('item').select('*').eq('identifier', identifier).maybeSingle();
  if (!item) notFound();

  const [{ data: bundles }, { data: places }, { data: subjects }, { data: chosen }, { data: files }, driveReady,
    { data: people }, { data: depicted }, { data: transcript }, { data: folder }] =
    await Promise.all([
      supabase.from('bundle').select('id, identifier, title').order('identifier'),
      supabase.from('place').select('id, family_name').order('family_name'),
      supabase.from('subject').select('id, label, parent_id').order('sort_order'),
      supabase.from('item_subject').select('subject_id').eq('item_id', item.id),
      supabase.from('file').select('id, original_filename, mime, bytes, width, height, duration_ms, codec, faststart, derived:file!derived_from(id, role, original_filename, bytes, width, height, codec)')
        .eq('item_id', item.id).eq('role', 'original').order('created_at'),
      isConnected(),
      supabase.from('person').select('id, display_name').order('born_year', { nullsFirst: false }),
      supabase.from('item_person').select('person_id').eq('item_id', item.id).eq('role', 'depicted'),
      supabase.from('transcript').select('full_text, reviewed, modified_at').eq('item_id', item.id).maybeSingle(),
      // 이 자료의 원본이 들어가는 Drive 폴더(묶음 폴더)
      item.bundle_id
        ? supabase.from('bundle').select('identifier, drive_folder_id').eq('id', item.bundle_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const save = updateItem.bind(null, identifier);
  const remove = deleteItem.bind(null, identifier);
  const saveText = saveTranscript.bind(null, identifier);
  // 녹취록은 음성·영상 자료에 붙는다. 다른 유형이라도 이미 있으면 보여 준다.
  const hasTranscriptSlot = item.type === 'Sound' || item.type === 'MovingImage' || !!transcript;
  const segCount = transcript?.full_text ? parseTranscript(transcript.full_text).length : 0;

  return (
    <main className="page">
      <p className="meta-value">{identifier}</p>
      <h1 className="title">{item.title}</h1>

      {saved && <p className="notice" role="status">{saved === 'transcript' ? '녹취록을 저장했다.' : '저장했다.'}</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <ItemForm
        action={save}
        item={item}
        bundles={bundles ?? []} places={places ?? []} subjects={subjects ?? []}
        chosen={chosen?.map((c) => c.subject_id) ?? []}
        people={people ?? []}
        chosenPeople={depicted?.map((d) => d.person_id) ?? []}
        submitLabel="고친 것 저장"
      />

      <section className="section">
        <h2 className="section-title">
          <span>원본</span>
          <span className="meta-value">{files?.length ?? 0}개</span>
        </h2>
        {folder?.drive_folder_id && (
          <p className="help" style={{ marginBottom: 'var(--space-4)' }}>
            Drive 의 {folder.identifier} 폴더에 들어 있다.{' '}
            <a href={folderUrl(folder.drive_folder_id)} target="_blank" rel="noopener noreferrer">폴더 열기 ↗</a>
          </p>
        )}

        {files?.length ? (
          <ul className="filelist">
            {files.map((f) => {
              const detach = detachFile.bind(null, identifier, f.id);
              type Derived = { id: string; role: string; original_filename: string | null; bytes: number | null;
                width: number | null; height: number | null; codec: string | null };
              const derived = (f.derived as unknown as Derived[] | null) ?? [];
              const thumb = derived.find((d) => d.role === 'thumb')?.id;
              const stream = derived.find((d) => d.role === 'stream');
              const isImage = f.mime?.startsWith('image/');
              const isVideo = f.mime?.startsWith('video/');
              const videoCodec = f.codec?.split(',')[0];
              // 재생 규격(H.264·AAC·목차 앞) 밖의 원본 — 손님이 틀려면 재생용이 따로 있어야 한다
              const offSpec = isVideo && ((videoCodec && !['avc1', 'avc3'].includes(videoCodec)) || f.faststart === false || !f.codec);
              const showThumb = isImage || isVideo;
              return (
                <li key={f.id} className={showThumb ? 'has-thumb' : ''}>
                  {showThumb && (
                    <span className="file-thumb">
                      {thumb
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/media/${thumb}`} alt="" />
                        : <span className="help">썸네일 없음</span>}
                    </span>
                  )}
                  <span>
                    <a href={`/api/media/${f.id}`} target="_blank" rel="noreferrer">
                      {f.original_filename ?? '이름 없음'}
                    </a>
                    <br />
                    <span className="meta-value">
                      {[f.mime, f.bytes ? `${Math.round(f.bytes / 1024 / 1024 * 10) / 10} MB` : null,
                        f.width && f.height ? `${f.width}×${f.height}` : null,
                        f.duration_ms ? `${Math.round(f.duration_ms / 1000)}초` : null,
                        f.codec, f.faststart === false ? '목차 끝' : null,
                        isImage || isVideo ? (thumb ? '썸네일 있음' : '썸네일 없음') : null,
                        stream ? '재생용 있음' : null]
                        .filter(Boolean).join(' · ')}
                    </span>
                    {isVideo && stream && (
                      <span className="stream-row">
                        <span className="help">
                          재생용 — 손님은 이 파일을 튼다:{' '}
                          <a href={`/api/media/${stream.id}`} target="_blank" rel="noreferrer">{stream.original_filename}</a>{' '}
                          <span className="meta-value">
                            {[stream.codec, stream.width && stream.height ? `${stream.width}×${stream.height}` : null,
                              stream.bytes ? `${Math.round(stream.bytes / 1024 / 1024 * 10) / 10} MB` : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <form action={detachFile.bind(null, identifier, stream.id)}>
                          <button className="tool" type="submit">재생용 떼기</button>
                        </form>
                      </span>
                    )}
                    {isVideo && !stream && offSpec && (
                      <span className="stream-row">
                        <span className="help">
                          {f.codec
                            ? `재생 규격 밖이다${videoCodec && !['avc1', 'avc3'].includes(videoCodec) ? ` — ${videoCodec === 'hvc1' || videoCodec === 'hev1' ? 'HEVC' : videoCodec} 는 일부 브라우저에서 재생되지 않는다` : ''}${f.faststart === false ? ' — 목차가 끝에 있어 재생 시작이 느리다' : ''}. `
                            : '코덱을 모른다. '}
                          H.264·AAC·웹 최적화 MP4 로 바꿔 재생용으로 붙인다.
                        </span>
                        {driveReady && <StreamUploader itemId={item.id} originalId={f.id} hasThumb={!!thumb} />}
                      </span>
                    )}
                  </span>
                  <form action={detach}>
                    <button className="button is-secondary" type="submit">떼기</button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}

        {driveReady ? (
          <div style={{ marginTop: 'var(--space-4)' }}><Uploader itemId={item.id} /></div>
        ) : (
          <p className="empty">
            <Link href="/admin/drive">Google Drive 를 연결</Link>해야 원본을 올릴 수 있다.
          </p>
        )}
      </section>

      {hasTranscriptSlot && (
        <section className="section" id="transcript">
          <h2 className="section-title">
            <span>녹취록</span>
            <span className="meta-value">{transcript ? `구간 ${segCount}개` : '없음'}</span>
          </h2>
          <form action={saveText} className="transcript-form">
            <label className="label" htmlFor="full_text">원문</label>
            <textarea className="field transcript-field" id="full_text" name="full_text" rows={14}
              defaultValue={transcript?.full_text ?? ''}
              placeholder={'[00:12] 할머니: 그때는 전화가 동네에 한 대뿐이었어.\n[00:31] 나: 그럼 어디서 걸었어요?\n할머니: 이장 댁에서.'} />
            <ul className="help">
              <li>한 줄이 한 구간이다. 빈 줄은 건너뛴다.</li>
              <li>줄 머리의 <span className="meta-value">[분:초]</span> 나 <span className="meta-value">[시:분:초]</span> 는 재생 위치가 된다 — 손님이 누르면 그 자리부터 들린다. 시각만 적은 줄은 바로 다음 줄에 붙는다.</li>
              <li><span className="meta-value">이름: </span> 처럼 쌍점 뒤에 한 칸을 띄우면 말한 사람이 된다. 둘 다 없어도 된다.</li>
              <li>원문을 모두 지우고 저장하면 녹취록이 지워진다.</li>
            </ul>
            <label className="check">
              <input type="checkbox" name="reviewed" defaultChecked={transcript?.reviewed ?? false} />
              원음과 대조해 검토했다
            </label>
            <button className="button" type="submit">녹취록 저장</button>
          </form>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">지우기</h2>
        <DeleteBox identifier={identifier} action={remove} />
      </section>

      <p style={{ marginTop: 'var(--space-8)' }}>
        <Link href="/admin/items">← 자료 목록</Link>
      </p>
    </main>
  );
}
