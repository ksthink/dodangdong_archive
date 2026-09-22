import { TYPE_LABEL } from '@/lib/labels';

type Row = Record<string, unknown> | null;

/** 칸 순서는 상세정보 표(MetadataTable)와 같다 — 등록 화면과 읽는 화면이 어긋나지 않게. */
export default function ItemForm({
  action, item, bundles, places, subjects, chosen, people = [], chosenPeople = [], submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  item?: Row;
  bundles: { id: string; identifier: string; title: string }[];
  places: { id: string; family_name: string }[];
  subjects: { id: string; label: string; parent_id: string | null }[];
  chosen?: string[];
  people?: { id: string; display_name: string }[];
  chosenPeople?: string[];
  submitLabel: string;
}) {
  const v = (k: string) => (item?.[k] as string | null) ?? '';
  const on = (k: string) => Boolean(item?.[k]);

  return (
    <form action={action} className="form">
      <Field label="제목" code="dc:title" required>
        <input className="field" name="title" defaultValue={v('title')} required />
      </Field>

      <Field label="묶음" code="dcterms:isPartOf" required help="자료는 반드시 묶음 하나에 든다.">
        <select className="field" name="bundle_id" defaultValue={v('bundle_id')} required>
          {bundles.map((b) => <option key={b.id} value={b.id}>{b.identifier} · {b.title}</option>)}
        </select>
      </Field>

      <Field label="설명" code="dc:description" span help="담담한 평서문 '-다'체로 쓴다.">
        <textarea className="field" name="description" rows={4} defaultValue={v('description')} />
      </Field>

      <Field label="생산자" code="dc:creator" help="등록된 인물이면 고른다. 기관이나 모르는 사람은 아래에 이름만 쓴다.">
        <select className="field" name="creator_person_id" defaultValue={v('creator_person_id')}>
          <option value="">등록된 인물 아님</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <input className="field" name="creator" defaultValue={v('creator')} placeholder="이름만 — 예: 군청, 미상" />
      </Field>

      <Field label="생산일자" code="dc:date" help="모르면 1978? · 197X · 1975/1979 처럼 쓴다.">
        <input className="field is-mono" name="created_edtf" defaultValue={v('created_edtf')} placeholder="1978-05-14" />
        <label className="check">
          <input type="checkbox" name="date_verified" defaultChecked={on('date_verified')} />
          증빙으로 확인된 날짜다
        </label>
      </Field>

      <Field label="형태분류" code="dc:type" required>
        <select className="field" name="type" defaultValue={v('type') || 'StillImage'} required>
          {Object.entries(TYPE_LABEL).map(([code, label]) => (
            <option key={code} value={code}>{label} · {code}</option>
          ))}
        </select>
      </Field>

      <Field label="세부 형태" code="dc:type" help="편지 · 일기 · 족보 · 제문 따위.">
        <input className="field" name="doc_type" defaultValue={v('doc_type')} />
      </Field>

      <Field label="출처분류" code="dc:source" help="어디서 나왔는가.">
        <input className="field" name="source" defaultValue={v('source')} />
      </Field>

      <Field label="입수 경위" code="dcterms:provenance">
        <input className="field" name="provenance" defaultValue={v('provenance')} />
      </Field>

      <Field label="주제분류" code="dc:subject" span help="여러 개를 고를 수 있다 — 혼례이면서 음식인 사진이 있다. 하위 주제를 고르면 그 아래로 모인다.">
        {/* 저장할 때 연결을 모두 새로 쓰므로, 걸 수 있는 주제는 하나도 빠짐없이 그려야 한다.
            (상위만 그리던 때는 저장 한 번에 하위 주제 연결이 사라졌다.) */}
        <div className="subject-tree">
          {subjects.filter((s) => !s.parent_id).map((top) => {
            const children = subjects.filter((s) => s.parent_id === top.id);
            return (
              <div key={top.id} className="subject-group">
                <label className="chip">
                  <input type="checkbox" name="subject_id" value={top.id} defaultChecked={chosen?.includes(top.id)} />
                  {top.label}
                </label>
                {children.length > 0 && (
                  <div className="chips subject-children">
                    {children.map((c) => (
                      <label key={c.id} className="chip">
                        <input type="checkbox" name="subject_id" value={c.id} defaultChecked={chosen?.includes(c.id)} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="등장인물" code="dc:subject" span help="이 자료에 나오는 사람. 등록된 인물만 고를 수 있다.">
        {people.length ? (
          <div className="chips">
            {people.map((p) => (
              <label key={p.id} className="chip">
                <input type="checkbox" name="person_id" value={p.id} defaultChecked={chosenPeople.includes(p.id)} />
                {p.display_name}
              </label>
            ))}
          </div>
        ) : (
          <p className="help">아직 등록한 인물이 없다. 관리 → 인물에서 먼저 등록한다.</p>
        )}
      </Field>

      <Field label="장소" code="dcterms:spatial">
        <select className="field" name="place_id" defaultValue={v('place_id')}>
          <option value="">기록 없음</option>
          {places.map((p) => <option key={p.id} value={p.id}>{p.family_name}</option>)}
        </select>
      </Field>

      <Field label="참여자" code="dc:contributor" help="촬영·녹음·전사를 도운 사람.">
        <input className="field" name="contributor" defaultValue={v('contributor')} />
      </Field>

      <Field label="발행처" code="dc:publisher" help="사진관·신문사처럼 제3자 생산처.">
        <input className="field" name="publisher" defaultValue={v('publisher')} />
      </Field>

      <Field label="형식" code="dc:format" help="재질이나 매체.">
        <input className="field" name="medium" defaultValue={v('medium')} />
      </Field>

      <Field label="크기·길이" code="dcterms:extent">
        <input className="field is-mono" name="extent" defaultValue={v('extent')} />
      </Field>

      <Field label="언어" code="dc:language">
        <input className="field is-mono" name="language" defaultValue={v('language')} placeholder="ko" />
      </Field>

      <Field label="이용조건" code="dc:rights" span>
        <input className="field" name="rights" defaultValue={v('rights')} />
      </Field>

      <Field label="공개 범위" code="dc:rights" help="새 자료는 비공개로 시작한다. 비공개는 손님 화면에서 조용히 빠진다.">
        <select className="field" name="access_level" defaultValue={(v('access_level') || 'private')}>
          <option value="private">비공개</option>
          <option value="public">공개</option>
        </select>
      </Field>

      <Field label="태그" code="dc:subject" help="분류에 없는 자유어. 쉼표로 나눈다.">
        <input className="field" name="tags"
          defaultValue={Array.isArray(item?.tags) ? (item.tags as string[]).join(', ') : ''} />
      </Field>

      <div className="form-foot">
        <button className="button" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}

function Field({
  label, code, help, required, span, children,
}: {
  label: string; code: string; help?: string; required?: boolean; span?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={span ? 'form-field span2' : 'form-field'}>
      <span className="label">
        {label}{required && <b aria-hidden> *</b>} <span className="label-code">{code}</span>
      </span>
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  );
}
