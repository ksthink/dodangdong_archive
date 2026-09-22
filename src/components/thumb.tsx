/**
 * 목록 썸네일. 4:3 으로 채워 자른다(원본 비율은 상세에서).
 * 썸네일이 없으면 rule 디더 무늬 위에 DCMI 유형 코드.
 */
export default function Thumb({ fileId, type, alt }: { fileId?: string; type: string; alt: string }) {
  if (!fileId) return <div className="thumb-empty"><span>{type}</span></div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="thumb" src={`/api/media/${fileId}`} alt={alt} loading="lazy" />
  );
}
