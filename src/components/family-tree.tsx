import Link from 'next/link';
import { CARD_H, CARD_W, type FamilyLayout } from '@/lib/family-tree';
import ScrollToCursor from './scroll-to-cursor';

const nameOf = (p: { short_name: string | null; display_name: string }) => p.short_name ?? p.display_name;

/**
 * 가계도 — 세대별 층, 부부는 나란히 혼인선으로, 자녀는 직각 선으로 매단다.
 * 칸은 링크(HTML), 선은 그 밑의 SVG. 좁은 화면에서는 가로로 밀어 보고 처음엔 "나"가 가운데.
 */
export default function FamilyTree({ layout }: { layout: FamilyLayout }) {
  const { nodes, segments, width, height, groups } = layout;
  return (
    <>
      <ScrollToCursor target=".tree-card.is-root" className="tree-scroll">
        <div className="tree" style={{ width, height }}>
          <svg className="tree-lines" width={width} height={height} viewBox={`0 0 ${width} ${height}`}
            shapeRendering="crispEdges" aria-hidden>
            {segments.map((s, i) => <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} />)}
          </svg>
          {nodes.map(({ person: p, x, y, isRoot }) => (
            <Link key={p.id} href={`/people/${p.identifier}`}
              className={isRoot ? 'tree-card is-root' : 'tree-card'}
              style={{ left: x, top: y, width: CARD_W, height: CARD_H }}
              aria-label={`${nameOf(p)}${p.real_name && p.real_name !== nameOf(p) ? ` ${p.real_name}` : ''}, ${p.birth_edtf ?? '?'}–${p.death_edtf ?? ''}`}>
              <span className="heading tree-name">{nameOf(p)}</span>
              {p.real_name && p.real_name !== nameOf(p) && <span className="body-sm">{p.real_name}</span>}
              <span className="meta-value">{p.birth_edtf ?? '?'}–{p.death_edtf ?? ''}</span>
            </Link>
          ))}
        </div>
      </ScrollToCursor>

      {/* 선은 눈으로만 읽힌다 — 같은 내용을 글로도 둔다 */}
      <ul className="sr-only">
        {groups.map((g) => (
          <li key={g.parents.map((p) => p.id).join('+')}>
            {g.parents.map(nameOf).join('·')}의 자녀: {g.children.map(nameOf).join(', ')}
          </li>
        ))}
      </ul>
    </>
  );
}
