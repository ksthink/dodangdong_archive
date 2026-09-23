import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateBundle, deleteBundle } from '@/lib/bundle-actions';
import { folderUrl } from '@/lib/google/drive';
import { TYPE_LABEL } from '@/lib/labels';
import { BUNDLE_KIND_LABEL } from '../kinds';
import DeleteBox from '../../items/[identifier]/delete-box';

export const dynamic = 'force-dynamic';

export default async function EditBundlePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();

  const { data: bundle } = await supabase.from('bundle').select('*').eq('id', id).maybeSingle();
  if (!bundle) notFound();

  const { data: items } = await supabase
    .from('item').select('identifier, title, type, access_level').eq('bundle_id', id).order('identifier');

  const save = updateBundle.bind(null, id);
  const remove = deleteBundle.bind(null, id, bundle.identifier);

  return (
    <main className="page">
      <p className="crumbs meta-value"><Link href="/admin/bundles">묶음</Link> &gt; {bundle.identifier}</p>
      <h1 className="title" style={{ marginTop: 'var(--space-2)' }}>{bundle.title}</h1>
      {saved && <p className="notice" role="status">저장했다.</p>}
      {error && <p className="notice is-danger" role="alert">{error}</p>}

      <form action={save} className="form">
        <div className="form-field span2">
          <label className="label" htmlFor="title">이름</label>
          <input className="field" id="title" name="title" defaultValue={bundle.title} required />
        </div>

        <div className="form-field">
          <label className="label" htmlFor="kind">갈래</label>
          <select className="field" id="kind" name="kind" defaultValue={bundle.kind}>
            {Object.entries(BUNDLE_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="label" htmlFor="default_access_level">기본 공개 범위</label>
          <select className="field" id="default_access_level" name="default_access_level"
            defaultValue={bundle.default_access_level}>
            <option value="private">비공개</option>
            <option value="public">공개</option>
          </select>
          <p className="help">여기 새로 넣는 자료가 기본으로 어느 쪽인지다. 자료마다 따로 고칠 수 있다.</p>
        </div>

        <div className="form-field">
          <label className="label" htmlFor="source">출처 <span className="label-code">dc:source</span></label>
          <input className="field" id="source" name="source" defaultValue={bundle.source} required />
        </div>

        <div className="form-field">
          <label className="label" htmlFor="period_edtf">기간 <span className="label-code">EDTF</span></label>
          <input className="field is-mono" id="period_edtf" name="period_edtf"
            defaultValue={bundle.period_edtf ?? ''} placeholder="1975/1979" />
        </div>

        <div className="form-field span2">
          <label className="label" htmlFor="provenance">내력 <span className="label-code">dcterms:provenance</span></label>
          <input className="field" id="provenance" name="provenance" defaultValue={bundle.provenance ?? ''}
            placeholder="누구에게서 어떻게 왔는지" />
        </div>

        <div className="form-field span2">
          <label className="label" htmlFor="rights">이용조건 <span className="label-code">dc:rights</span></label>
          <input className="field" id="rights" name="rights" defaultValue={bundle.rights ?? ''} />
        </div>

        <div className="form-field span2">
          <label className="label" htmlFor="note">메모</label>
          <textarea className="field" id="note" name="note" rows={3} defaultValue={bundle.note ?? ''} />
        </div>

        <div className="form-field span2">
          <button className="button" type="submit">저장</button>
        </div>
      </form>

      <section className="section">
        <h2 className="section-title">
          <span>든 자료</span>
          <span className="meta-value">{items?.length ?? 0}건</span>
        </h2>
        {items?.length ? (
          <table className="table">
            <thead><tr><th>식별자</th><th>제목</th><th>유형</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.identifier}>
                  <td className="meta-value">{it.identifier}</td>
                  <td><Link href={`/admin/items/${it.identifier}`}>{it.title}</Link></td>
                  <td className="meta-value">{TYPE_LABEL[it.type] ?? it.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">아직 든 자료가 없다.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Drive 폴더</h2>
        {bundle.drive_folder_id ? (
          <p className="body-sm">
            <a href={folderUrl(bundle.drive_folder_id)} target="_blank" rel="noreferrer">Drive 에서 열기</a>
            <span className="meta-value"> · {bundle.drive_folder_id}</span>
          </p>
        ) : (
          <p className="empty">아직 없다. 이 묶음의 자료에 원본을 처음 올릴 때 저절로 만들어진다.</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">지우기</h2>
        <DeleteBox identifier={bundle.identifier} action={remove}
          what="자료가 하나도 없는 묶음만 지운다. Drive 폴더는 그대로 남는다 — 바이트를 지우는 일은 손으로 한다." />
      </section>
    </main>
  );
}
