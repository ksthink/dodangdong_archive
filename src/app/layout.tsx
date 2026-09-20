import type { Metadata } from 'next';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: '도당동 아카이브',
  description: '한 집안의 사진·편지·음성·영상과 그에 얽힌 사건을 더블린코어로 기술해 둔 곳.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
