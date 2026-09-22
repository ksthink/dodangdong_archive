import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  updateStory, deleteStory, addBlock, moveBlock, updateBlock, removeBlock,
} from '@/lib/story-actions';
import { TYPE_LABEL } from '@/lib/labels';
import { ilikeAny } from '@/lib/search';
import DeleteBox from '../../items/[identifier]/delete-box';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  text: '글', heading: '소제목', record: '자료', gallery: '사진 묶음', quote: '구술 인용', timeline: '연표',
};
const KIND_HELP: Record<string, string> = {
  text: '큐레이터의 서술. 담담한 평서문으로.',
  heading: '이야기 안의 소제목.',
  record: '자료 하나를 크게 끼워 넣는다. 설명글은 큐레이터의 말이다.',
  gallery: '같은 날 찍은 사진 여러 장처럼, 여러 자료를 한 묶음으로.',
  quote: '구술이나 편지의 한 대목. 원문에서 한 글자도 고치지 않는다.',
  timeline: '엮은 자료를 해별로 늘어놓는다. 식별자를 비우면 이 이야기의 모든 자료로 만든다.',
};

const ms = (v: number | null) => {
  if (v === null) return '';
  const s = Math.round(v / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default async function EditStoryPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; q?: string }>;
}) {
  const { id } = await params;
  const { saved, error, q } = await searchParams;
  const supabase = await createClient();

  const { data: story } = await supabase.from('collection').select('*').eq('id', id).eq('kind', 'story').maybeSingle();
  if (!story) notFound();

  let picker = supabase.from('item').select('identifier, title, type, created_edtf, access_level').order('submitted_at', { ascending: false }).limit(30);
  const cond = q ? ilikeAny(['title', 'identifier'], q) : null;
  if (cond) picker = picker.or(cond);

  const [{ data: blocks }, { data: people }, { data: pickable }] = await Promise.all([
    supabase.from('curation_block')
      .select('id, position, kind, body, caption, timecode_ms, speaker:speaker_id(display_name), curation_ref(sort_order, item(identifier, title, access_level))')
      .eq('collection_id', id).order('position'),
    supabase.from('person').select('id, display_name').order('born_year', { nullsFirst: false }),
    picker,
  ]);

  const save = updateStory.bind(null, id);
  const remove = deleteStory.bind(null, id, story.title);
  const add = addBlock.bind(null, id);

  return (
    <main className="page">
      <p className="meta-value"><Link href="/admin/stories">이야기</Link></p>
      <h1 className="title">{story.title}</h1>
      {saved && <p className="notice" role="status">저장했다.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <form action={save} className="form">
        <div className="form-field span2">
          <span className="label">제목</span>
          <input className="field" name="title" defaultValue={story.title} required />
        </div>
        <div className="form-field span2">
          <span className="label">요약</span>
          <input className="field" name="summary" defaultValue={story.summary ?? ''} placeholder="이야기 카드에 쓰는 한두 문장" />
        </div>
        <div className="form-field">
          <span className="label">기간 <span className="label-code">dcterms:temporal</span></span>
          <input className="field is-mono" name="period_edtf" defaultValue={story.period_edtf ?? ''} placeholder="1962/1998" />
        </div>
        <div className="form-field">
          <span className="label">공개 범위</span>
          <select className="field" name="access_level" defaultValue={story.access_level}>
            <option value="private">비공개</option>
            <option value="public">공개</option>
          </select>
          <p className="help">공개해도 그 안의 비공개 자료는 손님 화면에서 조용히 빠진다.</p>
        </div>
        <div className="form-foot"><button className="button" type="submit">저장</button></div>
      </form>

      <section className="section">
        <h2 className="section-title"><span>블록</span><span className="meta-value">{blocks?.length ?? 0}개</span></h2>
        {blocks?.length ? (
          <ol className="blocks">
            {blocks.map((b, i) => {
              const refs = ((b.curation_ref ?? []) as unknown as { sort_order: number; item: { identifier: string; title: string; access_level: string } | null }[])
                .sort((x, y) => x.sort_order - y.sort_order).map((r) => r.item).filter(Boolean) as { identifier: string; title: string; access_level: string }[];
              const speaker = (Array.isArray(b.speaker) ? b.speaker[0] : b.speaker) as { display_name: string } | null;
              return (
                <li key={b.id} className="block">
                  <div className="block-head">
                    <span className="adminbar-mode">{i + 1}. {KIND_LABEL[b.kind]}</span>
                    <span className="block-tools">
                      <form action={moveBlock.bind(null, id, b.id, 'up')}><button className="tool" disabled={i === 0} aria-label="위로">↑</button></form>
                      <form action={moveBlock.bind(null, id, b.id, 'down')}><button className="tool" disabled={i === blocks.length - 1} aria-label="아래로">↓</button></form>
                      <form action={removeBlock.bind(null, id, b.id)}><button className="tool" aria-label="빼기">빼기</button></form>
                    </span>
                  </div>
                  {refs.length > 0 && (
                    <p className="meta-value">
                      {refs.map((r, k) => (
                        <span key={r.identifier}>{k > 0 && ' · '}<Link href={`/admin/items/${r.identifier}`}>{r.identifier}</Link> {r.title}
                          {r.access_level !== 'public' && <span className="badge"> 비공개</span>}</span>
                      ))}
                    </p>
                  )}
                  {b.kind === 'quote' && (speaker || b.timecode_ms !== null) && (
                    <p className="meta-value">{speaker?.display_name}{b.timecode_ms !== null && ` · ${ms(b.timecode_ms)}`}</p>
                  )}
                  <form action={updateBlock.bind(null, id, b.id)} className="block-edit">
                    {['text', 'heading', 'quote'].includes(b.kind) && (
                      <textarea className="field" name="body" rows={b.kind === 'heading' ? 1 : 3} defaultValue={b.body ?? ''}
                        placeholder={b.kind === 'quote' ? '인용문 — 원문 그대로' : ''} />
                    )}
                    {b.kind !== 'heading' && (
                      <input className="field" name="caption" defaultValue={b.caption ?? ''} placeholder="설명글 (큐레이터의 말)" />
                    )}
                    <button className="button is-secondary" type="submit">고치기</button>
                  </form>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty">아직 블록이 없다. 아래에서 글이나 자료를 더한다.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">블록 더하기</h2>
        <form action={add} className="form">
          <div className="form-field">
            <span className="label">종류</span>
            <select className="field" name="kind" defaultValue="text">
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <ul className="help">
              {Object.entries(KIND_HELP).map(([k, h]) => <li key={k}><b>{KIND_LABEL[k]}</b> — {h}</li>)}
            </ul>
          </div>
          <div className="form-field">
            <span className="label">자료 식별자</span>
            <input className="field is-mono" name="items" placeholder="DA-0001, DA-0003" />
            <p className="help">자료·사진 묶음·구술 인용·연표 블록에 쓴다. 아래 목록에서 식별자를 찾는다.</p>
          </div>
          <div className="form-field span2">
            <span className="label">글</span>
            <textarea className="field" name="body" rows={3} placeholder="글·소제목·인용문" />
          </div>
          <div className="form-field span2">
            <span className="label">설명글</span>
            <input className="field" name="caption" placeholder="큐레이터의 말 — 원 자료의 설명과 섞지 않는다" />
          </div>
          <div className="form-field">
            <span className="label">말한 사람 <span className="label-code">구술 인용</span></span>
            <select className="field" name="speaker_id" defaultValue="">
              <option value="">—</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <span className="label">위치 <span className="label-code">구술 인용</span></span>
            <input className="field is-mono" name="timecode" placeholder="00:14:32" />
          </div>
          <div className="form-foot"><button className="button" type="submit">더하기</button></div>
        </form>

        <div style={{ marginTop: 'var(--space-8)' }}>
          <form className="inline-form" action={`/admin/stories/${id}`}>
            <input className="field" name="q" defaultValue={q ?? ''} placeholder="자료 찾기 — 제목이나 식별자" />
            <button className="button is-secondary" type="submit">찾기</button>
          </form>
          {pickable?.length ? (
            <table className="table" style={{ marginTop: 'var(--space-4)' }}>
              <tbody>
                {pickable.map((it) => (
                  <tr key={it.identifier}>
                    <td className="meta-value">{it.identifier}</td>
                    <td>{it.title}</td>
                    <td className="meta-value">{TYPE_LABEL[it.type]} · {it.created_edtf ?? '—'}</td>
                    <td>{it.access_level !== 'public' && <span className="badge">비공개</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="help" style={{ marginTop: 'var(--space-4)' }}>맞는 자료가 없다.</p>
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">지우기</h2>
        <p className="help" style={{ marginBottom: 'var(--space-2)' }}>이야기와 블록만 지운다. 엮었던 자료는 그대로 남는다.</p>
        <DeleteBox identifier={story.title} action={remove} />
      </section>
    </main>
  );
}
