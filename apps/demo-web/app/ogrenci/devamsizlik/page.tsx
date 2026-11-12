'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Meter,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
} from '@/app/ui';

interface Attendance {
  sectionId: string;
  courseCode: string;
  courseName: string;
  kind: string;
  totalSessions: number;
  absent: number;
  ratePct: number;
  limitPct: number;
  atRisk: boolean;
}

const KIND_TR: Record<string, string> = {
  theory: 'Teori',
  practice: 'Uygulama',
  lab: 'Laboratuvar',
};

export default function Devamsizlik(): React.ReactElement {
  const [rows, setRows] = useState<Attendance[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Attendance[]>('/portal/attendance')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Devamsızlık" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!rows)
    return (
      <>
        <PageHeader title="Devamsızlık" sub="Yoklama kayıtlarınız yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={5} />
      </>
    );

  const atRisk = rows.filter((r) => r.atRisk);
  const trackedCourses = new Set(rows.map((r) => r.courseCode)).size;
  const totalSessions = rows.reduce((a, r) => a + r.totalSessions, 0);

  // Ders bazında grupla (bir dersin teori + uygulama satırları birlikte).
  const byCourse = new Map<string, Attendance[]>();
  for (const r of rows)
    (byCourse.get(r.courseCode) ?? byCourse.set(r.courseCode, []).get(r.courseCode)!).push(r);

  return (
    <>
      <PageHeader
        title="Devamsızlık"
        sub="Ders×tür bazında devamsızlık oranınız. Eşik aşımında NA (devamsızlıktan kalma) riski oluşur."
      />

      <StatGrid
        stats={[
          { label: 'Takip edilen ders', value: trackedCourses, icon: 'book' },
          { label: 'İşlenen oturum', value: totalSessions, icon: 'clock' },
          {
            label: 'Eşik aşan ders',
            value: atRisk.length,
            icon: 'alert',
            tone: atRisk.length > 0 ? 'danger' : 'ok',
          },
        ]}
      />

      {atRisk.length > 0 && (
        <Alert tone="err">
          {atRisk.length} derste devamsızlık üst sınırına ulaştınız/aştınız. Bu derslerde
          devamsızlıktan kalma (NA) riski var — dersleri kaçırmayın.
        </Alert>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="Henüz yoklama kaydı yok"
            sub="Devamsızlık, öğretim elemanı yoklama girdikçe bu tabloya işlenir."
            action={
              <Link href="/ogrenci/ders-secme">
                <Button variant="primary" sm icon="arrowRight">
                  Ders seç
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        Array.from(byCourse.entries()).map(([code, list]) => {
          const first = list[0];
          const courseAtRisk = list.some((r) => r.atRisk);
          return (
            <Card
              key={code}
              title={`${code} · ${first.courseName}`}
              icon="calendar"
              actions={courseAtRisk ? <Badge tone="danger">Riskli</Badge> : undefined}
            >
              <DataTable
                rows={list}
                search={false}
                columns={[
                  {
                    key: 'kind',
                    header: 'Tür',
                    value: (r) => KIND_TR[r.kind] ?? r.kind,
                  },
                  {
                    key: 'absent',
                    header: 'Devamsızlık / Toplam',
                    value: (r) => r.absent,
                    render: (r) => `${r.absent} / ${r.totalSessions}`,
                  },
                  {
                    key: 'rate',
                    header: 'Oran',
                    num: true,
                    value: (r) => r.ratePct,
                    render: (r) => (
                      <div style={{ minWidth: 160 }}>
                        <Meter
                          value={r.ratePct}
                          label={`%${r.ratePct}`}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'limit',
                    header: 'Üst sınır',
                    num: true,
                    value: (r) => r.limitPct,
                    render: (r) => <span className="muted">%{r.limitPct}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => (r.atRisk ? 'Eşik aşıldı' : 'Sınırlar içinde'),
                    render: (r) => (
                      <Badge tone={r.atRisk ? 'danger' : 'ok'}>
                        {r.atRisk ? 'Eşik aşıldı' : 'Sınırlar içinde'}
                      </Badge>
                    ),
                  },
                ]}
              />
            </Card>
          );
        })
      )}
    </>
  );
}
