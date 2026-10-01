import SettingsTabs from '@/components/settings-tabs';

// 자주 손대지 않는 것(분류, Drive 연결)을 '설정' 하나로 모은다.
// 묶음 폴더라 주소는 그대로다(/admin/taxonomy, /admin/drive) — Google 로그인이 돌아오는 길을 건드리지 않는다.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
