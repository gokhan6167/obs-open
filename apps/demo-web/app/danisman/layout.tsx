'use client';
import { RoleShell } from '../_shell';

export default function DanismanLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Danışman"
      allow={['danisman']}
      menu={[
        {
          grup: 'Genel',
          items: [
            { href: '/danisman', label: 'Danışan Öğrencilerim' },
            { href: '/danisman/ogrenci', label: 'Öğrenci 360' },
          ],
        },
        {
          grup: 'Onaylar',
          items: [
            { href: '/danisman/kayit-onay', label: 'Ders Kayıt Onay Kuyruğu' },
            { href: '/danisman/mezuniyet-kontrol', label: 'Mezuniyet Ön Kontrol' },
          ],
        },
        {
          grup: 'Öğrenci Takibi',
          items: [
            { href: '/danisman/staj', label: 'Staj' },
            { href: '/danisman/tez-sureci', label: 'Tez Süreci' },
            { href: '/danisman/ogrenci-talepleri', label: 'Öğrenci Talepleri' },
          ],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
