'use client';
import { RoleShell } from '../_shell';

export default function Layout({ children }: { children: React.ReactNode }): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Rektörlük"
      allow={['rektorluk']}
      menu={[
        {
          grup: 'Genel Bakış',
          items: [{ href: '/rektorluk', label: 'Üst Yönetim KPI' }],
        },
        {
          grup: 'Akademik',
          items: [
            { href: '/rektorluk/program-dagilim', label: 'Program Dağılımı' },
            { href: '/rektorluk/akademik-izleme', label: 'Akademik İzleme' },
            { href: '/rektorluk/program-izleme', label: 'Program İzleme' },
          ],
        },
        {
          grup: 'Mali',
          items: [{ href: '/rektorluk/mali-ozet', label: 'Mali Özet' }],
        },
        {
          grup: 'Raporlama',
          items: [
            { href: '/rektorluk/rapor-merkezi', label: 'Rapor Merkezi' },
            { href: '/rektorluk/liste-raporlari', label: 'Liste Raporları' },
          ],
        },
        {
          grup: 'Yönetişim',
          items: [{ href: '/rektorluk/denetim', label: 'Denetim İzleri' }],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
