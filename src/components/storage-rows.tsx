'use client';

import { useState } from 'react';

/**
 * 저장소 칸의 내역 — 무엇이 얼마나 자리를 차지하는지.
 *
 * 줄 수가 스물에 가까워 눈으로 훑기 어렵다. 머리에 정렬 단추를 둔다.
 * Supabase 칸만 쿼리명(실제 표 이름)을 함께 적고 그것으로도 정렬한다 —
 * 화면 이름은 우리말이고 쿼리에 쓰는 이름은 영문이라 둘이 다르기 때문이다.
 */

export type Row = {
  /** 화면에 적는 이름 — 자료·파일, 또는 `영상 MP4` */
  label: string;
  /** 갯수나 행 수 */
  note: string;
  bytes: number;
  /** 실제 DB 표 이름. Supabase 칸에만 있다. */
  query?: string;
};

type Key = 'label' | 'bytes' | 'share' | 'query';

/** 용량과 비중은 같은 분모를 나눈 값이라 순서가 같다. 그래도 묻는 말이 달라 둘 다 둔다. */
const SORTS: { key: Key; label: string }[] = [
  { key: 'label', label: '유형' },
  { key: 'bytes', label: '용량' },
  { key: 'share', label: '비중' },
];

export default function StorageRows({ rows, whole }: { rows: Row[]; whole: number }) {
  const [key, setKey] = useState<Key>('bytes');
  const withQuery = rows.some((r) => r.query);
  const sorts = withQuery ? [...SORTS, { key: 'query' as Key, label: '쿼리명' }] : SORTS;

  const sorted = [...rows].sort((a, b) => {
    // 이름은 가나다·abc 순, 크기는 큰 것부터. 큰 것이 먼저 궁금하기 때문이다.
    if (key === 'label') return a.label.localeCompare(b.label, 'ko');
    if (key === 'query') return (a.query ?? '').localeCompare(b.query ?? '');
    return b.bytes - a.bytes;
  });

  const share = (n: number) => {
    if (!whole) return '0%';
    const percent = (n / whole) * 100;
    if (percent > 0 && percent < 1) return '<1%';
    return `${Math.round(percent)}%`;
  };

  return (
    <div className="storage-detail">
      <div className="sortbar">
        <span className="meta-label">정렬</span>
        {sorts.map((s) => (
          <button key={s.key} type="button" onClick={() => setKey(s.key)}
            className={key === s.key ? 'sort is-on' : 'sort'} aria-pressed={key === s.key}>
            {s.label}
          </button>
        ))}
      </div>

      <ul className={withQuery ? 'storage-rows has-query' : 'storage-rows'}>
        {sorted.map((r) => (
          <li key={r.query ?? r.label}>
            <span className="meta-label">{r.label}</span>
            {withQuery && <span className="meta-value storage-query">{r.query}</span>}
            <span className="meta-value">{r.note}</span>
            <span className="meta-value storage-share">{share(r.bytes)}</span>
            <span className="meta-value storage-bytes">{readable(r.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 1.4GB, 12.4MB 처럼 한 자리까지. 1000 으로 나눈다(디스크가 파는 단위와 같게). */
function readable(n: number): string {
  if (n >= 1e9) return `${Math.round(n / 1e8) / 10}GB`;
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}MB`;
  return `${Math.round(n / 1e2) / 10}KB`;
}
