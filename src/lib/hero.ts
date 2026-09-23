import type { SupabaseClient } from '@supabase/supabase-js';
import { TYPE_LABEL } from '@/lib/labels';
import { thumbsFor } from '@/lib/thumbs';

/**
 * 첫 화면 히어로 — 자리 셋.
 *
 * 자리마다: 기간 안에 편성된 이야기 → 그 자리의 자동 종류 → "오늘, N년 전" → 가장 최근 이야기.
 * 같은 이야기나 같은 자동 종류가 두 자리에 겹치지 않는다. 채울 것이 없으면 그 자리는 비운다.
 * 자동으로 넘기지 않는다 — 사람이 넘긴다.
 *
 * 히어로에는 **공개** 이야기·자료만 건다. 예전에는 손님 권한 클라이언트를 넘겨 RLS 에 맡겼는데,
 * 손님 읽기를 DB 에서 걷어낸 뒤(0014)로는 세션 클라이언트를 받아 여기서 직접 거른다.
 * 그래서 "공개" 는 이제 "첫 화면에 걸릴 수 있는가" 라는 뜻이다.
 */

/** 공개이고 접히지 않은 자료만 — 히어로의 모든 자료 조회에 건다 */
const PUBLIC_ITEM = { access_level: 'public', is_archived: false } as const;
type ItemRef = { id: string; title: string; access_level: string; is_archived: boolean } | null;

export type HeroSource = 'scheduled' | 'story' | 'today' | 'recent';
export type HeroSlide = {
  slot: number;
  source: HeroSource;
  kind: string;      // 검은 꼬리표: 이달의 이야기 · 오늘, N년 전 · 새로 들어온 기록
  kicker: string;
  title: string;
  summary: string | null;
  meta: string[];
  href: string;
  cta: string;
  images: { src: string; alt: string }[];
  /** 관리 화면용: 왜 이것이 걸렸는가 */
  why: string;
};

/** 한국 날짜(YYYY-MM-DD). 서버 시각은 UTC 라 자정 무렵 하루가 어긋난다. */
export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const inRange = (today: string, start: string | null, end: string | null) =>
  (!start || start <= today) && (!end || today <= end);

type Story = { id: string; title: string; summary: string | null; period_edtf: string | null; cover_item_id: string | null };

async function storySlide(db: SupabaseClient, s: Story): Promise<Omit<HeroSlide, 'slot' | 'source' | 'why'>> {
  const { data: blocks } = await db
    .from('curation_block')
    .select('position, curation_ref(sort_order, item(id, title, access_level, is_archived))')
    .eq('collection_id', s.id)
    .order('position');
  // 블록 순서대로 엮은 자료 가운데 공개된 것만. 표지가 지정되어 있으면 맨 앞에.
  const items: { id: string; title: string }[] = [];
  for (const b of blocks ?? []) {
    const refs = ((b.curation_ref ?? []) as unknown as { sort_order: number; item: ItemRef }[])
      .sort((x, y) => x.sort_order - y.sort_order);
    for (const r of refs) {
      const it = r.item;
      if (it && it.access_level === 'public' && !it.is_archived && !items.some((i) => i.id === it.id)) items.push({ id: it.id, title: it.title });
    }
  }
  if (s.cover_item_id) {
    const at = items.findIndex((i) => i.id === s.cover_item_id);
    if (at > 0) items.unshift(...items.splice(at, 1));
  }
  const thumbs = await thumbsFor(db, items.map((i) => i.id));
  return {
    kind: '이달의 이야기',
    kicker: '이야기',
    title: s.title,
    summary: s.summary,
    meta: [items.length ? `엮은 자료 ${items.length}건` : null, s.period_edtf].filter(Boolean) as string[],
    href: `/story/${s.id}`,
    cta: '이야기 읽기',
    images: items.filter((i) => thumbs.has(i.id)).slice(0, 3).map((i) => ({ src: `/api/media/${thumbs.get(i.id)}`, alt: i.title })),
  };
}

/** 오늘과 월·일이 같고, 증빙으로 확인된 날짜의 자료. 가장 많은 해(같으면 최근 해)를 고른다. */
async function todaySlide(db: SupabaseClient, today: string): Promise<Omit<HeroSlide, 'slot' | 'source' | 'why'> | null> {
  const { data } = await db
    .from('item')
    .select('id, identifier, title, type, created_start')
    .match(PUBLIC_ITEM)
    .eq('date_verified', true)
    .eq('created_precision', 'day');
  const md = today.slice(5);
  const hits = (data ?? []).filter((i) => i.created_start?.slice(5) === md && i.created_start < today);
  if (!hits.length) return null;

  const byYear = new Map<string, typeof hits>();
  for (const h of hits) byYear.set(h.created_start.slice(0, 4), [...(byYear.get(h.created_start.slice(0, 4)) ?? []), h]);
  const [year, items] = [...byYear.entries()].sort((a, b) => b[1].length - a[1].length || b[0].localeCompare(a[0]))[0];

  const ago = Number(today.slice(0, 4)) - Number(year);
  const types = new Map<string, number>();
  for (const i of items) types.set(i.type, (types.get(i.type) ?? 0) + 1);
  const thumbs = await thumbsFor(db, items.map((i) => i.id));
  return {
    kind: `오늘, ${ago}년 전`,
    kicker: items[0].created_start,
    title: items[0].title,
    summary: `${year}년 오늘의 자료 ${items.length}건 — ${[...types].map(([t, n]) => `${TYPE_LABEL[t] ?? t} ${n}`).join(' · ')}.`,
    meta: [`날짜 확인됨`],
    href: `/chronicle?decade=${Math.floor(Number(year) / 10) * 10}#y${year}`,
    cta: '그해 연표 보기',
    images: items.filter((i) => thumbs.has(i.id)).slice(0, 3).map((i) => ({ src: `/api/media/${thumbs.get(i.id)}`, alt: i.title })),
  };
}

/** 가장 최근에 들어온 공개 자료가 속한 묶음. */
async function recentSlide(db: SupabaseClient): Promise<Omit<HeroSlide, 'slot' | 'source' | 'why'> | null> {
  const { data: latest } = await db
    .from('item').select('bundle_id').match(PUBLIC_ITEM).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return null;
  const [{ data: bundle }, { data: items }] = await Promise.all([
    db.from('bundle').select('identifier, title, source').eq('id', latest.bundle_id).maybeSingle(),
    db.from('item').select('id, title').match(PUBLIC_ITEM).eq('bundle_id', latest.bundle_id).order('submitted_at', { ascending: false }),
  ]);
  if (!bundle || !items?.length) return null;
  const thumbs = await thumbsFor(db, items.map((i) => i.id));
  return {
    kind: '새로 들어온 기록',
    kicker: bundle.source ?? bundle.identifier,
    title: bundle.title,
    summary: `최근 들어온 자료 ${items.length}건.`,
    meta: [bundle.identifier],
    href: `/search?bundle=${bundle.identifier}`,
    cta: '자료 보기',
    images: items.filter((i) => thumbs.has(i.id)).slice(0, 3).map((i) => ({ src: `/api/media/${thumbs.get(i.id)}`, alt: i.title })),
  };
}

export async function resolveHero(db: SupabaseClient, today = todayKST()): Promise<HeroSlide[]> {
  const [{ data: slots }, { data: storiesData }] = await Promise.all([
    db.from('hero_slot').select('slot, collection_id, auto_kind, starts_on, ends_on').order('slot'),
    db.from('collection').select('id, title, summary, period_edtf, cover_item_id')
      .eq('kind', 'story').eq('access_level', 'public').order('sort_order').order('created_at', { ascending: false }),
  ]);
  const stories = (storiesData ?? []) as Story[];
  const usedStories = new Set<string>();
  const usedAuto = new Set<HeroSource>();
  const slides: HeroSlide[] = [];

  const tryStory = async (s: Story | undefined) => (s && !usedStories.has(s.id) ? (usedStories.add(s.id), storySlide(db, s)) : null);
  const latestStory = () => tryStory(stories.find((s) => !usedStories.has(s.id)));
  const tryAuto = async (kind: HeroSource) => {
    if (usedAuto.has(kind)) return null;
    const got = kind === 'today' ? await todaySlide(db, today)
      : kind === 'recent' ? await recentSlide(db)
      : kind === 'story' ? await latestStory() : null;
    if (got && kind !== 'story') usedAuto.add(kind);
    return got;
  };

  for (const s of slots ?? []) {
    let slide: Omit<HeroSlide, 'slot' | 'source' | 'why'> | null = null;
    let source: HeroSource = 'story';
    let why = '';

    // 1) 기간 안에 편성된 이야기 — 비공개면 stories 에 없으니 건너뛴다
    if (s.collection_id) {
      const scheduled = stories.find((x) => x.id === s.collection_id);
      if (!inRange(today, s.starts_on, s.ends_on)) why = '편성 기간이 아니어서 자동으로 채웠다';
      else if (!scheduled) why = '편성한 이야기가 비공개라 첫 화면에 걸지 않고 자동으로 채웠다';
      else if ((slide = await tryStory(scheduled))) { source = 'scheduled'; why = '편성한 이야기'; }
      else why = '같은 이야기가 앞 자리에 있어 자동으로 채웠다';
    }
    // 2) 그 자리의 자동 종류
    if (!slide && s.auto_kind) {
      slide = await tryAuto(s.auto_kind as HeroSource);
      if (slide) { source = s.auto_kind as HeroSource; why = why || `자동 — ${ {story: '가장 최근 이야기', today: '오늘, N년 전', recent: '새로 들어온 기록'}[s.auto_kind as 'story'] }`; }
    }
    // 3) 빈 자리는 "오늘, N년 전", 그것도 없으면 가장 최근 이야기
    if (!slide) {
      if ((slide = await tryAuto('today'))) { source = 'today'; why = `${why ? why + ' — ' : ''}빈 자리를 "오늘, N년 전"으로 채웠다`; }
      else if ((slide = await latestStory())) { source = 'story'; why = `${why ? why + ' — ' : ''}빈 자리를 가장 최근 이야기로 채웠다`; }
    }
    if (slide) slides.push({ ...slide, slot: s.slot, source, why });
  }
  return slides;
}
