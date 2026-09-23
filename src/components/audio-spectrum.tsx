'use client';

import { useEffect, useRef } from 'react';

/**
 * 음성 재생기와 그 위의 스펙트럼.
 *
 * 이 사이트에서 **유일하게 움직이는 두 번째 자리**다(첫째는 인트로). 소리가 나는 동안에만
 * 움직이고, 멈추면 바닥 선만 남는다 — 가만히 있는 화면에서 저 혼자 떨지 않게.
 * 움직임을 줄여 달라고 한 사람에게는 그리지 않는다.
 *
 * `<audio>` 는 브라우저 것을 그대로 쓴다. 녹취록(components/transcript-view.tsx)이
 * `media-<파일 id>` 로 이 요소를 찾아 자리를 옮기므로 id 를 바꾸지 않는다.
 */

/** 막대 한 칸(글꼴이 픽셀이라 격자를 3px 배수로 맞춘다) */
const BAR = 9;
const GAP = 3;
/** 막대 높이를 이 단위로 끊는다 — 매끈하게 오르내리지 않고 픽셀처럼 턱턱 선다 */
const STEP = 3;
const HEIGHT = 96;

/** 한 요소에 소스 노드는 한 번만 만들 수 있다. 다시 그려도 쓰던 것을 돌려준다. */
const sources = new WeakMap<HTMLMediaElement, AnalyserNode>();

/**
 * 재생기를 소리 길(Web Audio)로 넘긴다. **소리 길이 열린 것을 확인한 뒤에** 넘긴다 —
 * 잠긴 길로 넘기면 그림은 고사하고 소리가 아예 나지 않는다. 열지 못하면 그냥 두고
 * 브라우저가 제 길로 틀게 한다(그림만 없다).
 */
async function graph(el: HTMLMediaElement): Promise<AnalyserNode | null> {
  const made = sources.get(el);
  if (made) return made;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    // 브라우저는 사람이 누르기 전까지 소리 길을 잠가 둔다 — 누른 지금 연다.
    await ctx.resume();
    if (ctx.state !== 'running') { void ctx.close().catch(() => {}); return null; }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    // 앞뒤 칸이 조금 이어져야 사람이 소리로 느낀다. 0 이면 칸마다 튄다.
    analyser.smoothingTimeConstant = 0.7;
    ctx.createMediaElementSource(el).connect(analyser);
    analyser.connect(ctx.destination);
    sources.set(el, analyser);
    return analyser;
  } catch {
    return null;
  }
}

export default function AudioSpectrum({ fileId, src }: { fileId: string; src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ink = getComputedStyle(canvas).getPropertyValue('--ink').trim() || '#111';
    // 바닥 선은 들어간 면(paper-sunken) 위에 놓이므로 rule(#dcdcdc)로는 묻힌다.
    const edge = getComputedStyle(canvas).getPropertyValue('--rule-strong').trim() || '#8c8c8c';
    let frame = 0;
    let analyser: AnalyserNode | null = null;
    let bins: Uint8Array | null = null;

    /** 화면 밀도만큼 크게 잡아야 막대 모서리가 흐려지지 않는다. */
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const width = canvas!.clientWidth;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(HEIGHT * dpr);
      const ctx = canvas!.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
      }
      draw();
    }

    /** 멈춰 있을 때의 모습 — 바닥 선 하나. */
    function flat() {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      const w = canvas!.clientWidth;
      ctx.clearRect(0, 0, w, HEIGHT);
      ctx.fillStyle = edge;
      ctx.fillRect(0, HEIGHT - STEP, w, STEP);
    }

    function draw() {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      if (!analyser || !bins || audio!.paused || still.matches) { flat(); return; }

      analyser.getByteFrequencyData(bins as Uint8Array<ArrayBuffer>);
      const w = canvas!.clientWidth;
      const count = Math.max(1, Math.floor((w + GAP) / (BAR + GAP)));
      ctx.clearRect(0, 0, w, HEIGHT);
      ctx.fillStyle = edge;
      ctx.fillRect(0, HEIGHT - STEP, w, STEP);
      ctx.fillStyle = ink;

      // 사람 목소리는 아래쪽에 몰려 있다 — 칸을 로그로 나눠야 낮은 소리가 한 막대에 뭉치지 않는다.
      // 다만 로그만 쓰면 왼쪽 막대 여럿이 같은 칸을 읽어 통짜 덩어리가 된다. 앞에서 읽은
      // 데까지를 손가락(cursor)으로 들고 다니며 막대마다 적어도 한 칸씩 나아가게 한다.
      const top = Math.floor(bins.length * 0.7);
      let cursor = 0;
      for (let i = 0; i < count; i += 1) {
        const from = cursor;
        const to = Math.min(top, Math.max(from + 1, Math.round(top ** ((i + 1) / count))));
        let peak = 0;
        for (let b = from; b < to && b < bins.length; b += 1) peak = Math.max(peak, bins[b]);
        cursor = to;
        // 255 단계를 3px 격자에 끊어 앉힌다.
        const h = Math.round((peak / 255) * (HEIGHT - STEP) / STEP) * STEP;
        if (h > 0) ctx.fillRect(i * (BAR + GAP), HEIGHT - STEP - h, BAR, h);
        if (cursor >= top) break;
      }
    }

    function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (still.matches) return;
      void graph(audio!).then((made) => {
        if (!made || audio!.paused) return;
        analyser = made;
        bins = new Uint8Array(made.frequencyBinCount);
        cancelAnimationFrame(frame);
        loop();
      });
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      flat();
    }

    resize();
    audio.addEventListener('play', start);
    audio.addEventListener('pause', stop);
    audio.addEventListener('ended', stop);
    window.addEventListener('resize', resize);
    still.addEventListener('change', draw);

    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('play', start);
      audio.removeEventListener('pause', stop);
      audio.removeEventListener('ended', stop);
      window.removeEventListener('resize', resize);
      still.removeEventListener('change', draw);
    };
  }, []);

  return (
    <div className="spectrum">
      {/* 소리를 눈으로 본 것일 뿐 새 정보가 아니다 — 읽어 주는 기계에는 감춘다. */}
      <canvas ref={canvasRef} className="spectrum-canvas" style={{ height: HEIGHT }} aria-hidden />
      <audio ref={audioRef} id={`media-${fileId}`} controls preload="none" src={src} />
    </div>
  );
}
