'use client';

import { useState } from 'react';

/** 삭제는 되돌릴 수 없다. 식별자를 그대로 다시 써야 버튼이 열린다. */
export default function DeleteBox({
  identifier, action,
}: {
  identifier: string;
  action: (form: FormData) => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const ready = typed.trim() === identifier;

  return (
    <form action={action} className="danger">
      <p className="body-sm">
        이 자료와 여기 딸린 원본 파일, 이야기에 엮인 자리가 함께 사라진다. 되돌릴 수 없다.
      </p>
      <label className="label" htmlFor="confirm">지우려면 {identifier} 를 그대로 쓴다</label>
      <input
        className="field is-mono" id="confirm" name="confirm" autoComplete="off"
        value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={identifier}
      />
      <button className="button is-danger" type="submit" disabled={!ready}>
        {identifier} 지우기
      </button>
    </form>
  );
}
