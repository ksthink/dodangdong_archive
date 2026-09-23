/**
 * 인물의 얼굴 자리. 사진이 정해져 있으면 그것을, 없으면 디더 면에 호칭 첫 글자.
 * 크기는 세 가지다 — 첫 화면 48px(is-s) · 인물 목록 96px · 인물 상세 144px(is-l).
 */
export default function Face({
  fileId, name, size,
}: { fileId?: string | null; name: string; size?: 's' | 'l' }) {
  const cls = size ? `face is-${size}` : 'face';
  if (!fileId) return <div className={cls}><span>{name.slice(0, 1)}</span></div>;
  return (
    <div className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/media/${fileId}`} alt={name} loading="lazy" />
    </div>
  );
}
