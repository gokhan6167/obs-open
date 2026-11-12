'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  Donut,
  BarChart,
  money,
} from '@/app/ui';

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}

interface ProgramRow {
  program: string;
  count: number;
}

export default function RaporlarPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [byProgram, setByProgram] = useState<ProgramRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    Promise.all([
      api<Dashboard>('/reports/dashboard'),
      api<ProgramRow[]>('/reports/students-by-program'),
    ])
      .then(([d, p]) => {
        if (!alive) return;
        setDash(d);
        setByProgram(p);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Raporlar yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Aktif öğrenci oranı — mevcut dashboard uçlarındaki tek dağılım.
  const activePct = useMemo(() => {
    if (!dash || dash.studentCount === 0) return 0;
    return (dash.activeStudents / dash.studentCount) * 100;
  }, [dash]);

  const chartData = useMemo(
    () => (byProgram ?? []).map((r) => ({ label: r.program, value: r.count })),
    [byProgram],
  );

  if (err) {
    return (
      <>
        <PageHeader title="Raporlar & İstatistikler" sub="Genel KPI ve program dağılımları" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Raporlar & İstatistikler" sub="Genel KPI ve program dağılımları" />

      {!dash ? (
        <SkeletonStats n={5} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam öğrenci', value: dash.studentCount, icon: 'users' },
            { label: 'Aktif öğrenci', value: dash.activeStudents, icon: 'checkCircle', tone: 'ok' },
            { label: 'Mezun', value: dash.graduatedStudents, icon: 'award' },
            { label: 'Toplam kayıt', value: dash.totalEnrollments, icon: 'book' },
            { label: 'Tahsilat', value: money(dash.collectedAmount), icon: 'wallet', tone: 'ok' },
          ]}
        />
      )}

      <div className="two-col">
        <Card title="Öğrenci durum dağılımı" icon="pie" hint="Aktif öğrenci oranı">
          {!dash ? (
            <Skeleton lines={3} />
          ) : dash.studentCount === 0 ? (
            <EmptyState title="Öğrenci verisi yok" sub="Henüz kayıtlı öğrenci bulunmuyor." />
          ) : (
            <div className="row" style={{ gap: 20, alignItems: 'center', marginBottom: 0 }}>
              <Donut value={activePct} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {dash.activeStudents} / {dash.studentCount}
                </div>
                <div className="muted">Aktif · {dash.activeStudents}</div>
                <div className="muted">Mezun · {dash.graduatedStudents}</div>
                <div className="muted">
                  Diğer · {dash.studentCount - dash.activeStudents - dash.graduatedStudents}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card title="Programa göre öğrenci" icon="chart" hint="Program bazında dağılım">
          {!byProgram ? (
            <Skeleton lines={4} />
          ) : chartData.length === 0 ? (
            <EmptyState title="Program verisi yok" sub="Programlara atanmış öğrenci bulunmuyor." />
          ) : (
            <BarChart data={chartData} />
          )}
        </Card>
      </div>

      <Card title="Program bazında öğrenci sayıları" icon="grid">
        {!byProgram ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable<ProgramRow>
            rows={byProgram}
            csv
            csvName="oidb-programa-gore-ogrenci"
            empty={<EmptyState title="Kayıt yok" sub="Program bazında öğrenci verisi bulunmuyor." />}
            columns={[
              { key: 'program', header: 'Program', sortable: true },
              { key: 'count', header: 'Öğrenci sayısı', num: true, sortable: true },
            ]}
          />
        )}
      </Card>
    </>
  );
}
