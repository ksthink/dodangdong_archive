/**
 * 가계도 배치 — 부모·배우자 관계로 "나"와 이어진 사람들을 세대별로 쌓는다.
 *
 * 친가와 외가가 부모의 혼인에서 만나므로 엄밀한 나무가 아니다(그물). 그래서
 * - 세대: "나"에서 부모 쪽으로 한 칸 위, 자녀 쪽으로 한 칸 아래, 배우자는 같은 줄
 * - 묶음: 같은 세대에서 배우자로 이어진 사람들은 한 묶음으로 나란히
 * - 순서: 층마다 부모·자녀 묶음의 평균 자리로 정렬(몇 번 위아래로 쓸어 교차를 줄인다)
 * - 가로 위치: 부모 아래에 자녀가, 자녀 위에 부모가 오게 반복해 맞추되
 *   겹치지 않는 가장 가까운 자리(순서를 지키는 최소제곱, PAV)를 고른다.
 * 부모·배우자 관계로 이어지지 않은 사람(측근·지인 등)은 outsiders 로 따로 돌려준다.
 */

export type TreePerson = {
  id: string;
  identifier: string;
  display_name: string;
  short_name: string | null;
  real_name: string | null;
  birth_edtf: string | null;
  death_edtf: string | null;
  born_year: number | null;
  relation_to_root: string | null;
  /* 가계도가 쓰지는 않지만, outsiders 를 그대로 인물 카드로 그리므로 함께 들고 다닌다 */
  face_file_id: string | null;
};
export type TreeRelation = { from_person_id: string; to_person_id: string; kind: 'parent' | 'spouse' };

export type TreeNode = { person: TreePerson; x: number; y: number; isRoot: boolean };
export type Segment = { x: number; y: number; w: number; h: number };
export type FamilyGroup = { parents: TreePerson[]; children: TreePerson[] };
export type FamilyLayout = {
  nodes: TreeNode[];
  segments: Segment[];
  width: number;
  height: number;
  groups: FamilyGroup[];
  outsiders: TreePerson[];
};

export const CARD_W = 152;
export const CARD_H = 104;
const COUPLE_GAP = 24; // 부부 사이 — 혼인선이 지나간다
const UNIT_GAP = 32; // 묶음 사이
const GEN_GAP = 80; // 세대 사이 — 자녀선이 지나간다
const STROKE = 2;
const BAR_BASE = 20; // 부모 칸 아래에서 형제 가름대까지
const BAR_STEP = 12; // 가름대가 겹치면 이만큼 내린다

const byBirth = (a: TreePerson, b: TreePerson) =>
  (a.born_year ?? 9999) - (b.born_year ?? 9999) || a.identifier.localeCompare(b.identifier);

export function layoutFamily(people: TreePerson[], relations: TreeRelation[]): FamilyLayout {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const a = m.get(k) ?? [];
    if (!a.includes(v)) m.set(k, [...a, v]);
  };
  for (const r of relations) {
    if (!byId.has(r.from_person_id) || !byId.has(r.to_person_id)) continue;
    if (r.kind === 'parent') {
      push(parentsOf, r.from_person_id, r.to_person_id);
      push(childrenOf, r.to_person_id, r.from_person_id);
    } else {
      push(spousesOf, r.from_person_id, r.to_person_id);
      push(spousesOf, r.to_person_id, r.from_person_id);
    }
  }

  // 뿌리: "나". 없으면 관계가 가장 많이 얽힌 사람.
  const degree = (id: string) =>
    (parentsOf.get(id)?.length ?? 0) + (childrenOf.get(id)?.length ?? 0) + (spousesOf.get(id)?.length ?? 0);
  const root =
    people.find((p) => p.relation_to_root?.trim() === '나') ??
    [...people].sort((a, b) => degree(b.id) - degree(a.id))[0];

  const empty = { nodes: [], segments: [], width: 0, height: 0, groups: [] };
  if (!root || degree(root.id) === 0) return { ...empty, outsiders: [...people].sort(byBirth) };

  // 세대 — 뿌리에서 넓게 퍼지며 매긴다
  const gen = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    const visit = (other: string, og: number) => {
      if (!gen.has(other)) { gen.set(other, og); queue.push(other); }
    };
    for (const p of parentsOf.get(id) ?? []) visit(p, g - 1);
    for (const c of childrenOf.get(id) ?? []) visit(c, g + 1);
    for (const s of spousesOf.get(id) ?? []) visit(s, g);
  }
  const minGen = Math.min(...gen.values());
  for (const [id, g] of gen) gen.set(id, g - minGen);
  const inTree = people.filter((p) => gen.has(p.id));
  const outsiders = people.filter((p) => !gen.has(p.id)).sort(byBirth);
  const genCount = Math.max(...gen.values()) + 1;

  // 묶음 — 같은 세대에서 배우자로 이어진 사람들
  type Unit = { members: string[]; x: number; gen: number };
  const unitOf = new Map<string, Unit>();
  const layers: Unit[][] = Array.from({ length: genCount }, () => []);
  for (const p of [...inTree].sort(byBirth)) {
    if (unitOf.has(p.id)) continue;
    const g = gen.get(p.id)!;
    const members: string[] = [];
    const stack = [p.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (members.includes(id)) continue;
      members.push(id);
      for (const s of spousesOf.get(id) ?? []) if (gen.get(s) === g) stack.push(s);
    }
    const unit: Unit = { members, x: 0, gen: g };
    for (const m of members) unitOf.set(m, unit);
    layers[g].push(unit);
  }

  const offset = (u: Unit, id: string) => u.members.indexOf(id) * (CARD_W + COUPLE_GAP) + CARD_W / 2;
  const width = (u: Unit) => u.members.length * CARD_W + (u.members.length - 1) * COUPLE_GAP;
  const center = (id: string) => { const u = unitOf.get(id)!; return u.x + offset(u, id); };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const treeParents = (id: string) => (parentsOf.get(id) ?? []).filter((p) => unitOf.has(p));
  const treeChildren = (id: string) => (childrenOf.get(id) ?? []).filter((c) => unitOf.has(c));

  // 순서 — 층마다 이웃 층 묶음들의 평균 자리로. 위아래로 몇 번 쓴다.
  const indexIn = (id: string) => layers[unitOf.get(id)!.gen].indexOf(unitOf.get(id)!);
  const reorder = (g: number, neighbours: (id: string) => string[]) => {
    const key = new Map<Unit, number>();
    layers[g].forEach((u, i) => {
      const ns = u.members.flatMap(neighbours);
      key.set(u, ns.length ? mean(ns.map(indexIn)) : i);
    });
    layers[g].sort((a, b) => key.get(a)! - key.get(b)!);
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let g = 1; g < genCount; g++) reorder(g, treeParents);
    for (let g = genCount - 2; g >= 0; g--) reorder(g, treeChildren);
  }
  for (let g = 1; g < genCount; g++) reorder(g, treeParents);
  // 묶음 안: 부모 묶음이 왼쪽에 있는 사람을 왼쪽에 (친가·외가가 제 쪽을 향하게)
  for (const layer of layers) {
    for (const u of layer) {
      const k = (id: string) => { const ps = treeParents(id); return ps.length ? mean(ps.map(indexIn)) : null; };
      const known = u.members.map(k).filter((v): v is number => v !== null);
      const fallback = known.length ? mean(known) : 0;
      u.members.sort((a, b) => (k(a) ?? fallback) - (k(b) ?? fallback) || byBirth(byId.get(a)!, byId.get(b)!));
    }
  }

  // 가로 위치 — 순서를 지키며 원하는 자리에 가장 가깝게(PAV)
  const place = (layer: Unit[], desired: number[]) => {
    const off: number[] = [];
    let acc = 0;
    layer.forEach((u, i) => { off[i] = acc; acc += width(u) + UNIT_GAP; });
    const blocks: { sum: number; n: number; start: number }[] = [];
    desired.forEach((d, i) => {
      blocks.push({ sum: d - off[i], n: 1, start: i });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.n <= b.sum / b.n) break;
        blocks.splice(-2, 2, { sum: a.sum + b.sum, n: a.n + b.n, start: a.start });
      }
    });
    for (const b of blocks) for (let i = b.start; i < b.start + b.n; i++) layer[i].x = b.sum / b.n + off[i];
  };
  for (const layer of layers) place(layer, layer.map(() => 0));

  const fromParents = (u: Unit) => {
    const want = u.members.flatMap((m) => {
      const ps = treeParents(m);
      return ps.length ? [mean(ps.map(center)) - offset(u, m)] : [];
    });
    return want.length ? mean(want) : u.x;
  };
  const fromChildren = (u: Unit) => {
    const want = u.members.flatMap((m) => {
      const cs = treeChildren(m);
      if (!cs.length) return [];
      // 자녀의 부모가 이 묶음에 둘 다 있으면 혼인선 가운데가 기준
      const anchorOffset = mean(cs.map((c) => mean(treeParents(c).filter((p) => u.members.includes(p)).map((p) => offset(u, p)))));
      return [mean(cs.map(center)) - anchorOffset];
    });
    return want.length ? mean(want) : u.x;
  };
  for (let it = 0; it < 12; it++) {
    for (let g = 1; g < genCount; g++) place(layers[g], layers[g].map(fromParents));
    for (let g = genCount - 2; g >= 0; g--) place(layers[g], layers[g].map(fromChildren));
  }

  // 0 에서 시작하게 옮기고 정수로 (선이 픽셀에 맞게)
  const minX = Math.min(...layers.flat().map((u) => u.x));
  for (const u of layers.flat()) u.x = Math.round(u.x - minX);
  const top = (g: number) => g * (CARD_H + GEN_GAP);

  const nodes: TreeNode[] = layers.flat().flatMap((u) =>
    u.members.map((id) => ({ person: byId.get(id)!, x: u.x + offset(u, id) - CARD_W / 2, y: top(u.gen), isRoot: id === root.id })),
  );

  // 선 — 모두 2px 직각. 가로선은 {h: STROKE}, 세로선은 {w: STROKE}
  const segments: Segment[] = [];
  const hLine = (x1: number, x2: number, y: number) =>
    segments.push({ x: Math.min(x1, x2) - STROKE / 2, y: y - STROKE / 2, w: Math.abs(x2 - x1) + STROKE, h: STROKE });
  const vLine = (x: number, y1: number, y2: number) =>
    segments.push({ x: x - STROKE / 2, y: Math.min(y1, y2), w: STROKE, h: Math.abs(y2 - y1) });

  // 혼인선
  for (const u of layers.flat()) {
    for (let i = 0; i + 1 < u.members.length; i++) {
      const [a, b] = [u.members[i], u.members[i + 1]];
      if (spousesOf.get(a)?.includes(b)) hLine(center(a) + CARD_W / 2, center(b) - CARD_W / 2, top(u.gen) + CARD_H / 2);
    }
  }

  // 형제 묶음 — 같은 부모를 둔 자녀들
  const groupsByKey = new Map<string, { parents: string[]; children: string[] }>();
  for (const p of inTree) {
    const ps = treeParents(p.id).sort();
    if (!ps.length) continue;
    const key = ps.join('+');
    const g = groupsByKey.get(key) ?? { parents: ps, children: [] };
    g.children.push(p.id);
    groupsByKey.set(key, g);
  }
  const bars: { g: number; x1: number; x2: number; ax: number; startY: number; kids: string[]; level: number }[] = [];
  for (const { parents, children } of groupsByKey.values()) {
    const pg = gen.get(parents[0])!;
    const pu = unitOf.get(parents[0])!;
    const ax = Math.round(mean(parents.map(center)));
    // 부모 둘이 한 묶음에 나란히 있으면 혼인선에서, 아니면 부모 칸 밑에서 내려온다
    const married = parents.length > 1 && parents.every((p) => pu.members.includes(p));
    const startY = married ? top(pg) + CARD_H / 2 : top(pg) + CARD_H;
    const xs = [ax, ...children.map(center)];
    bars.push({ g: pg, x1: Math.min(...xs), x2: Math.max(...xs), ax, startY, kids: children, level: 0 });
  }
  // 같은 세대 틈에서 가름대가 가로로 겹치면 층을 나눈다
  for (let g = 0; g < genCount; g++) {
    const here = bars.filter((b) => b.g === g).sort((a, b) => a.x1 - b.x1);
    const ends: number[] = [];
    for (const b of here) {
      let lv = ends.findIndex((e) => e + 8 < b.x1);
      if (lv < 0) { lv = ends.length; ends.push(b.x2); } else ends[lv] = b.x2;
      b.level = lv;
    }
  }
  for (const b of bars) {
    const barY = top(b.g) + CARD_H + BAR_BASE + b.level * BAR_STEP;
    vLine(b.ax, b.startY, barY);
    if (b.x2 > b.x1) hLine(b.x1, b.x2, barY);
    for (const c of b.kids) vLine(center(c), barY, top(b.g + 1));
  }

  const groups: FamilyGroup[] = [...groupsByKey.values()].map((g) => ({
    parents: g.parents.map((id) => byId.get(id)!).sort(byBirth),
    children: g.children.map((id) => byId.get(id)!).sort(byBirth),
  }));

  return {
    nodes,
    segments,
    width: Math.max(...nodes.map((n) => n.x + CARD_W)),
    height: top(genCount - 1) + CARD_H,
    groups,
    outsiders,
  };
}
