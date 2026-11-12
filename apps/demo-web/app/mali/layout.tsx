'use client';
import { RoleShell } from '../_shell';

export default function MaliLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Mali İşler"
      allow={['mali_isler']}
      menu={[
        {
          grup: 'Genel',
          items: [{ href: '/mali', label: 'Tahsilat Özeti' }],
        },
        {
          grup: 'Tahsilat',
          items: [
            { href: '/mali/borclar', label: 'Öğrenci Borç Arama' },
            { href: '/mali/fatura', label: 'Fatura / Tahakkuk' },
            { href: '/mali/mutabakat', label: 'Banka Mutabakatı' },
          ],
        },
        {
          grup: 'Harç',
          items: [
            { href: '/mali/harc-yonetim', label: 'Harç Yönetimi' },
            { href: '/mali/odeme-plani', label: 'Ödeme Planı' },
            { href: '/mali/iade-talepleri', label: 'İade Talepleri' },
          ],
        },
        {
          grup: 'Burs',
          items: [{ href: '/mali/burs', label: 'Burs / İndirim' }],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
