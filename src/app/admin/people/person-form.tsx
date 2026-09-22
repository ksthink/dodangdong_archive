type Row = Record<string, unknown> | null;

/** 사람은 한 번 등록해 두고 가리킨다 — "할머니", "김순자", "안동댁"이 한 사람으로 모인다. */
export default function PersonForm({
  action, person, submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  person?: Row;
  submitLabel: string;
}) {
  const v = (k: string) => (person?.[k] as string | null) ?? '';

  return (
    <form action={action} className="form">
      <Field label="호칭" help="아카이브를 만드는 사람 기준 하나로 쓴다. 예: 할머니">
        <input className="field" name="short_name" defaultValue={v('short_name')} />
      </Field>

      <Field label="실명" help="모르면 비워 둔다.">
        <input className="field" name="real_name" defaultValue={v('real_name')} />
      </Field>

      <Field label="다른 이름" span help="다른 가족이 부르는 이름, 택호 따위. 쉼표로 나눈다. 예: 외할머니, 안동댁">
        <input className="field" name="aliases"
          defaultValue={Array.isArray(person?.aliases) ? (person.aliases as string[]).join(', ') : ''} />
      </Field>

      <Field label="태어난 해" help="모르면 1936? · 193X 처럼 쓴다.">
        <input className="field is-mono" name="birth_edtf" defaultValue={v('birth_edtf')} placeholder="1936" />
      </Field>

      <Field label="돌아가신 해" help="살아 계시면 비워 둔다.">
        <input className="field is-mono" name="death_edtf" defaultValue={v('death_edtf')} />
      </Field>

      <Field label="나와의 관계" help="예: 아버지의 어머니">
        <input className="field" name="relation_to_root" defaultValue={v('relation_to_root')} />
      </Field>

      <Field label="화면 이름" help="비우면 '실명(호칭)'으로 만든다.">
        <input className="field" name="display_name" defaultValue={v('display_name')} placeholder="김순자(할머니)" />
      </Field>

      <Field label="짧은 소개" span help="담담한 평서문으로 한두 문장.">
        <textarea className="field" name="note" rows={3} defaultValue={v('note')} />
      </Field>

      <div className="form-foot">
        <button className="button" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}

function Field({ label, help, span, children }: { label: string; help?: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={span ? 'form-field span2' : 'form-field'}>
      <span className="label">{label}</span>
      {children}
      {help && <p className="help">{help}</p>}
    </div>
  );
}
