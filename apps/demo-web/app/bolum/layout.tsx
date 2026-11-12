'use client';
import { RoleShell } from '../_shell';

export default function BolumLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Bölüm Başkanı"
      allow={['bolum_baskani']}
      menu={[
        {
          grup: 'Genel',
          items: [{ href: '/bolum', label: 'Bölüm Panosu' }],
        },
        {
          grup: 'Bölüm',
          items: [
            { href: '/bolum/ogrenciler', label: 'Bölüm Öğrencileri' },
            { href: '/bolum/subeler', label: 'Ders / Şube & Kontenjan' },
            { href: '/bolum/mufredat', label: 'Müfredat' },
          ],
        },
        {
          grup: 'Ders & Müfredat',
          items: [
            { href: '/bolum/ders-katalogu', label: 'Ders Kataloğu' },
            { href: '/bolum/ogretim-plani', label: 'Öğretim Planı' },
            { href: '/bolum/mufredat-ders', label: 'Müfredat Dersleri' },
            { href: '/bolum/secmeli-havuz', label: 'Seçmeli Havuz' },
          ],
        },
        {
          grup: 'Dönem İşlemleri',
          items: [
            { href: '/bolum/ders-acma', label: 'Ders Açma' },
            { href: '/bolum/ders-acma-detay', label: 'Ders Açma Detayı' },
            { href: '/bolum/sinav-takvimi', label: 'Sınav Takvimi' },
          ],
        },
        {
          grup: 'Öğrenci Süreçleri',
          items: [
            { href: '/bolum/danisman-atama', label: 'Danışman Atama' },
            { href: '/bolum/staj', label: 'Staj' },
            { href: '/bolum/tez-sureci', label: 'Tez Süreci' },
          ],
        },
        {
          grup: 'Onaylar',
          items: [{ href: '/bolum/not-onay', label: 'Onay Kuyruğu' }],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
