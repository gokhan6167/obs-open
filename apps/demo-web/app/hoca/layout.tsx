'use client';
import { RoleShell } from '../_shell';

export default function Layout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Öğretim Elemanı"
      allow={['ogretim_elemani', 'danisman']}
      menu={[
        {
          grup: 'Genel',
          items: [{ href: '/hoca', label: 'Şubelerim' }],
        },
        {
          grup: 'Derslerim',
          items: [
            { href: '/hoca/ogrenciler', label: 'Öğrenci Listesi' },
            { href: '/hoca/not-girisi', label: 'Not Girişi' },
            { href: '/hoca/not-ice-aktar', label: "Excel'den İçe Aktar" },
            { href: '/hoca/not-duzeltme', label: 'Not Düzeltme' },
          ],
        },
        {
          grup: 'Akademik',
          items: [
            { href: '/hoca/ders-katalogu', label: 'Ders Kataloğu' },
            { href: '/hoca/sinav-takvimi', label: 'Sınav Takvimi' },
          ],
        },
        {
          grup: 'Danışmanlık',
          items: [
            { href: '/hoca/danismanlik', label: 'Danışmanlık' },
            { href: '/hoca/staj', label: 'Staj' },
          ],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
