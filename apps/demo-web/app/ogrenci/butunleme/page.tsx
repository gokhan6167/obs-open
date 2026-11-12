'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, SkeletonStats,
} from '@/app/ui';

interface Sched {
  sectionId: string;
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  sectionCode: string;
  termName: string;
  status: string;
}

const TR: Record<string, string> = {
  approved: 'Onaylı', submitted: 'Beklemede', draft: 'Taslak',
  withdrawn: 'Çekildi', rejected: 'Reddedildi',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  approved: 'ok', submitted: 'warn', draft: 'muted', withdrawn: 'muted', rejected: 'danger',
};

export default function Butunleme(): React.ReactElement {
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Sched[]>('/portal/schedule')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const activeTermName = rows?.[0]?.termName ?? null;
  const active = useMemo(
    () => (rows ?? []).filter((r) => r.termName === activeTermName && r.status !== 'withdrawn'),
    [rows, activeTermName],
  );

  if (err) return (<><PageHeader title="Bütünleme Sınavları" /><Alert tone="err">{err}</Alert></>);
  if (!rows) return (
    <>
      <PageHeader title="Bütünleme Sınavları" sub="Yükleniyor…" />
      <SkeletonStats n={2} />
      <Skeleton lines={5} />
    </>
  );

  const totalEcts = active.reduce((a, r) => a + (r.ects ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Bütünleme Sınavları"
        sub={activeTermName ? `${activeTermName} · ${active.length} ders` : 'Bütünleme sınav takvimi'}
      />

      <StatGrid
        stats={[
          { label: 'Aktif dönem dersi', value: active.length, icon: 'book' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
        ]}
      />

      <Alert tone="info">
        Bütünleme sınav tarihleri henüz tanımlanmadı. Takvim açıklandığında sınav gün,
        saat ve yerleri bu ekranda ders bazında görüntülenecektir.
      </Alert>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="Bu dönem kayıtlı ders yok"
            sub="Bütünleme sınavına, aktif dönemde kayıtlı ve final sonucu başarısız olan derslerden girilebilir."
            action={<Link href="/ogrenci/program"><Button variant="primary" sm icon="arrowRight">Ders Programı</Button></Link>}
          />
        </Card>
      ) : (
        <Card>
          <DataTable
            rows={active}
            search
            columns={[
              { key: 'course', header: 'Ders', value: (r) => `${r.courseCode} ${r.courseName}`,
                render: (r) => (<><b>{r.courseCode}</b> · {r.courseName}</>) },
              { key: 'section', header: 'Şube', value: (r) => r.sectionCode },
              { key: 'ects', header: 'AKTS', num: true, value: (r) => r.ects },
              { key: 'exam', header: 'Bütünleme sınavı', value: () => 'Takvim açıklanmadı',
                render: () => <Badge tone="muted">Takvim açıklanmadı</Badge> },
              { key: 'status', header: 'Kayıt durumu', value: (r) => TR[r.status] ?? r.status,
                render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{TR[r.status] ?? r.status}</Badge> },
            ]}
          />
        </Card>
      )}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Yönetmelik: Bir dersin final sınavına girip başarısız olan veya final sınavına
        katılamayan öğrenciler o dersin bütünleme sınavına girebilir. Bütünleme sınavından
        alınan not, final notu yerine geçer ve ders başarı notu buna göre hesaplanır.
        Bütünleme sınavı sonrası mazeret sınavı yapılmaz. Bu ekran salt görünümdür.
      </p>
    </>
  );
}
