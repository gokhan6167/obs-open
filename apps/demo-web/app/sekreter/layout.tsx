'use client';
import { RoleShell } from '../_shell';

export default function SekreterLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Fakülte Sekreteri"
      allow={['fakulte_sekreteri']}
      menu={[
        {
          grup: 'Genel',
          items: [
            { href: '/sekreter', label: 'Bekleyen İşler' },
            { href: '/sekreter/onay-takip', label: 'Onay Takip' },
          ],
        },
        {
          grup: 'Öğrenci',
          items: [
            { href: '/sekreter/ogrenci-arama', label: 'Öğrenci Arama' },
            { href: '/sekreter/ogrenci-dosya', label: 'Öğrenci Dosyası' },
            { href: '/sekreter/danisman-atama', label: 'Danışman Atama' },
            { href: '/sekreter/oryantasyon', label: 'Oryantasyon' },
          ],
        },
        {
          grup: 'Derslik',
          items: [
            { href: '/sekreter/derslik', label: 'Derslik Tanımlama' },
            { href: '/sekreter/toplu-derslik', label: 'Toplu Derslik Atama' },
          ],
        },
        {
          grup: 'Kurul',
          items: [
            { href: '/sekreter/kurul-gundemi', label: 'Kurul Gündemi' },
            { href: '/sekreter/ykk', label: 'YKK Kararları' },
          ],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
