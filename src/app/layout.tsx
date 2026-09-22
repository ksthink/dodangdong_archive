import type { Metadata, Viewport } from 'next';
import './tokens.css';
import './globals.css';
import TipLayer from '@/components/tip-layer';

export const metadata: Metadata = {
  title: '도당동 아카이브',
  description: '한 집안의 사진·편지·음성·영상과 그에 얽힌 사건을 더블린코어로 기술해 둔 곳.',
};

// 밝은 화면 하나뿐이다. 운영체제가 다크 모드여도, 브라우저가 자동으로 어둡게 뒤집지 않게 한다.
export const viewport: Viewport = { colorScheme: 'only light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <TipLayer />
      </body>
    </html>
  );
}
