import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import { resolveHero, todayKST } from '@/lib/hero';
import { updateHeroSlot } from '@/lib/hero-actions';

export const dynamic = 'force-dynamic';

const AUTO_LABEL: Record<string, string> = {
  story: '자동 — 가장 최근 이야기',
  today: '자동 — 오늘, N년 전 (확인된 날짜만)',
  recent: '자동 — 새로 들어온 기록',
};

export default async function HeroSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const [{ data: slots }, { data: stories }, live] = await Promise.all([
    supabase.from('hero_slot').select('*').order('slot'),
    supabase.from('collection').select('id, title, access_level').eq('kind', 'story').order('created_at', { ascending: false }),
    // 지금 손님에게 실제로 보이는 것 — 첫 화면과 같은 규칙, 손님 권한
    resolveHero(createAnonClient(), today),
  ]);
  const liveBySlot = new Map(live.map((s) => [s.slot, s]));

  return (
    <main className="page">
      <h1 className="title">첫 화면 편성</h1>
      <p className="measure body-sm" style={{ marginTop: 'var(--space-4)' }}>
        첫 화면 히어로의 자리 셋. 자리마다 이야기를 걸거나 자동으로 채우게 둔다.
        편성이 비었거나 기간이 지난 자리는 “오늘, N년 전”이, 그것도 없으면 가장 최근 이야기가 채운다.
        자동으로 넘기지 않는다. 오늘은 <span className="meta-value">{today}</span>(한국 날짜)이다.
      </p>
      {saved && <p className="notice" role="status">자리 {saved} 편성을 저장했다.</p>}
      {error && <p className="notice" role="alert">{error}</p>}

      <section className="section">
        <h2 className="section-title">자리</h2>
        <div className="hero-schedule">
          {(slots ?? []).map((s) => {
            const current = s.collection_id ? `story:${s.collection_id}` : s.auto_kind ? `auto:${s.auto_kind}` : '';
            const shown = liveBySlot.get(s.slot);
            return (
              <div key={s.slot} className="card schedule-row">
                <form action={updateHeroSlot.bind(null, s.slot)} className="schedule-form">
                  <p className="heading">자리 {s.slot}</p>
                  <label className="label" htmlFor={`pick-${s.slot}`}>무엇을 걸까</label>
                  <select className="field" id={`pick-${s.slot}`} name="pick" defaultValue={current} required>
                    <optgroup label="자동">
                      {Object.entries(AUTO_LABEL).map(([k, l]) => <option key={k} value={`auto:${k}`}>{l}</option>)}
                    </optgroup>
                    <optgroup label="이야기 걸기">
                      {(stories ?? []).map((st) => (
                        <option key={st.id} value={`story:${st.id}`}>
                          {st.title}{st.access_level !== 'public' ? ' (비공개 — 손님에게 안 보임)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="schedule-dates">
                    <label className="label">시작<input className="field is-mono" type="date" name="starts_on" defaultValue={s.starts_on ?? ''} /></label>
                    <label className="label">끝<input className="field is-mono" type="date" name="ends_on" defaultValue={s.ends_on ?? ''} /></label>
                  </div>
                  <p className="help">기간을 비우면 계속 건다.</p>
                  <label className="label" htmlFor={`note-${s.slot}`}>메모</label>
                  <input className="field" id={`note-${s.slot}`} name="note" defaultValue={s.note ?? ''} />
                  <button className="button" type="submit">저장</button>
                </form>
                <div className="schedule-live">
                  <p className="label">지금 손님에게 보이는 것</p>
                  {shown ? (
                    <>
                      <p className="hero-kind" style={{ justifySelf: 'start' }}>{shown.kind}</p>
                      <p><Link href={shown.href}>{shown.title}</Link></p>
                      <p className="help">{shown.why}</p>
                    </>
                  ) : (
                    <p className="help">채울 것이 없어 이 자리는 비어 있다.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p style={{ marginTop: 'var(--space-8)' }}><Link href="/">← 첫 화면에서 보기</Link></p>
    </main>
  );
}
