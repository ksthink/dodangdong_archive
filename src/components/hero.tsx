'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HeroSlide } from '@/lib/hero';

/**
 * 첫 화면 히어로. 왼쪽 글, 오른쪽 사진 1–3장을 겹친 콜라주(좁은 화면에서는 사진이 위로).
 * 자동으로 넘기지 않는다 — ← → 와 네모 점으로 사람이 넘긴다. 키보드 ← → 도 된다.
 */
export default function Hero({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  if (!slides.length) return null;
  const go = (i: number) => setIndex((i + slides.length) % slides.length);

  return (
    <section className="hero" aria-roledescription="carousel" aria-label="이번에 보는 이야기"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(index - 1);
        if (e.key === 'ArrowRight') go(index + 1);
      }}>
      {/* 모든 장을 처음부터 그려 두고 보이는 장만 바꾼다 — 넘길 때 사진을 그제야 받느라
          빈 칸이 보이지 않게, 페이지를 열 때 미리 받아 둔다. */}
      {slides.map((s, i) => (
        <div key={s.slot} className="hero-slide" role="group" aria-roledescription="slide"
          aria-label={`${i + 1} / ${slides.length}`} hidden={i !== index}>
          <div className="hero-text">
            <p className="hero-kind">{s.kind}</p>
            <p className="meta-value">{s.kicker}</p>
            <h2 className="title hero-title">{s.title}</h2>
            {s.summary && <p className="hero-summary">{s.summary}</p>}
            {s.meta.length > 0 && <p className="meta-value">{s.meta.join(' · ')}</p>}
            <Link className="button hero-cta" href={s.href}>{s.cta} →</Link>
          </div>
          <div className={`hero-collage n${Math.max(1, s.images.length)}`} aria-hidden={!s.images.length}>
            {s.images.length ? (
              s.images.map((img, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.src} src={img.src} alt={img.alt} className={`c${k}`} />
              ))
            ) : (
              // 사진이 없는 이야기(구술 따위)는 디더 면에 꼬리표만
              <div className="thumb-empty hero-empty"><span>{s.kind}</span></div>
            )}
          </div>
        </div>
      ))}

      {slides.length > 1 && (
        <div className="hero-nav">
          <button type="button" className="tool" onClick={() => go(index - 1)} aria-label="앞 이야기">←</button>
          <span className="hero-dots">
            {slides.map((x, i) => (
              <button key={x.slot} type="button" className={i === index ? 'dot is-on' : 'dot'}
                aria-label={`${i + 1}번째: ${x.title}`} aria-current={i === index} onClick={() => go(i)} />
            ))}
          </span>
          <button type="button" className="tool" onClick={() => go(index + 1)} aria-label="다음 이야기">→</button>
          <span className="meta-value">{index + 1} / {slides.length}</span>
        </div>
      )}
    </section>
  );
}
