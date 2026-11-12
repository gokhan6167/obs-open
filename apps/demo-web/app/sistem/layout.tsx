'use client';
import { RoleShell } from '../_shell';

const MENU = [
  {
    grup: 'Genel',
    items: [{ href: '/sistem', label: 'Genel Bakış' }],
  },
  {
    grup: 'Yönetim',
    items: [
      { href: '/sistem/kullanicilar', label: 'Kullanıcı & Rol' },
      { href: '/sistem/parametreler', label: 'Parametreler' },
      { href: '/sistem/feature-flags', label: 'Feature Flag' },
      { href: '/sistem/calendar', label: 'Takvim & Dönem' },
    ],
  },
  {
    grup: 'İzleme',
    items: [
      { href: '/sistem/mali-ozet', label: 'Mali Özet & Mutabakat' },
      { href: '/sistem/audit', label: 'Audit Log' },
    ],
  },
];

export default function SistemLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Sistem Yöneticisi"
      allow={['sistem_yoneticisi']}
      menu={MENU}
    >
      {children}
    </RoleShell>
  );
}
