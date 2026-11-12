'use client';
import { RoleShell } from '../_shell';

export default function KoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Bologna/Akreditasyon Koordinatörü"
      allow={['koordinator']}
      menu={[
        {
          grup: 'Genel',
          items: [{ href: '/koordinator', label: 'Program Kataloğu' }],
        },
        {
          grup: 'Bologna',
          items: [
            { href: '/koordinator/ders-bilgi-paketi', label: 'Ders Bilgi Paketi' },
            { href: '/koordinator/program-ciktilari', label: 'Program Çıktıları (PÇ)' },
            { href: '/koordinator/matris', label: 'TYYÇ / PÇ-DÇ Matrisi' },
          ],
        },
        {
          grup: 'Müfredat',
          items: [
            { href: '/koordinator/ders-katalogu', label: 'Ders Kataloğu' },
            { href: '/koordinator/ogretim-plani', label: 'Öğretim Planı' },
            { href: '/koordinator/mufredat-ders', label: 'Müfredata Ders & Ön Koşul' },
            { href: '/koordinator/secmeli-havuz', label: 'Seçmeli Ders Havuzu' },
          ],
        },
        {
          grup: 'Raporlar',
          items: [
            { href: '/koordinator/akreditasyon', label: 'Akreditasyon Dökümü' },
            { href: '/koordinator/program-izleme', label: 'Program İzleme' },
          ],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
