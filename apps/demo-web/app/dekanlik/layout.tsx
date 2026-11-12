'use client';
import { RoleShell } from '../_shell';

export default function DekanlikLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Dekanlık"
      allow={['dekanlik']}
      menu={[
        {
          grup: 'Genel',
          items: [
            { href: '/dekanlik', label: 'Fakülte Panosu' },
            { href: '/dekanlik/program-dagilim', label: 'Program Dağılımı' },
            { href: '/dekanlik/program-izleme', label: 'Program İzleme' },
          ],
        },
        {
          grup: 'Onay Merkezi',
          items: [
            { href: '/dekanlik/talep-onay', label: 'Talep Onay Kuyruğu' },
            { href: '/dekanlik/cap-onay', label: 'ÇAP / Yandal Kuyruğu' },
          ],
        },
        {
          grup: 'Kurul',
          items: [
            { href: '/dekanlik/kurul', label: 'Kurul Kararları Özeti' },
            { href: '/dekanlik/ykk', label: 'YKK Kararları' },
          ],
        },
        {
          grup: 'Akademik İşleyiş',
          items: [
            { href: '/dekanlik/ders-acma', label: 'Ders Açma' },
            { href: '/dekanlik/danisman-atama', label: 'Danışman Atama' },
            { href: '/dekanlik/tez-sureci', label: 'Tez Süreci' },
          ],
        },
        {
          grup: 'Disiplin',
          items: [
            { href: '/dekanlik/disiplin', label: 'Disiplin Dosyaları' },
            { href: '/dekanlik/sorusturma', label: 'Soruşturma' },
          ],
        },
      ]}
    >
      {children}
    </RoleShell>
  );
}
