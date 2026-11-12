'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  Donut,
  BarChart,
} from '@/app/ui';

interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
}

interface Stats {
  sectionCount: number;
  totalQuota: number;
  totalFilled: number;
  fillRate: number;
  enrollmentsByStatus: Record<string, number>;
}

interface PendingItem {
  studentNo: string;
  fullName: string;
  courseCode: string;
  courseName: string;
}

// Öğrencinin kayıt akışındaki aşamalarını (durum makinesi) Türkçeleştir.
const STATUS_TR: Record<string, string> = {
  draft: 'Sisteme girmemiş',
  selecting: 'Ders seçimi',
  submitted: 'Danışman onayında',
  approved: 'Tamamlanan',
  rejected: 'Reddedilen',
  dropped: 'Bırakılan',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  draft: 'muted',
  selecting: 'info',
  submitted: 'warn',
  approved: 'ok',
  rejected: 'danger',
  dropped: 'muted',
};

interface DistRow {
  status: string;
  count: number;
}

export default function KayitIstatistikPage(): React.ReactElement {
  const [term, setTerm] = useState<Term | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await api<Term | null>('/calendar/active-term');
      setTerm(t);
      if (!t) return;
      const [s, p] = await Promise.all([
        api<Stats>(`/enrollment/stats/${t.id}`),
        api<{ items: PendingItem[] }>('/portal/pending-enrollments'),
      ]);
      setStats(s);
      setPending(p.items ?? []);
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  const fillPct = stats ? Math.round(stats.fillRate * 100) : 0;

  const dist = useMemo<DistRow[]>(() => {
    if (!stats) return [];
    const order = ['draft', 'selecting', 'submitted', 'approved', 'rejected', 'dropped'];
    const known = new Set(order);
    const rows: DistRow[] = order
      .filter((s) => stats.enrollmentsByStatus[s] !== undefined)
      .map((s) => ({ status: s, count: stats.enrollmentsByStatus[s] ?? 0 }));
    // Beklenmedik statüler varsa sona ekle.
    for (const [s, c] of Object.entries(stats.enrollmentsByStatus)) {
      if (!known.has(s)) rows.push({ status: s, count: c });
    }
    return rows;
  }, [stats]);

  const chartData = useMemo(
    () => dist.map((d) => ({ label: STATUS_TR[d.status] ?? d.status, value: d.count })),
    [dist],
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Kayıt İstatistikleri" sub="Aktif dönem kayıt yoğunluğu ve doluluk." />
        <SkeletonStats n={4} />
        <Skeleton lines={8} />
      </>
    );
  }

  if (err) {
    return (
      <>
        <PageHeader title="Kayıt İstatistikleri" sub="Aktif dönem kayıt yoğunluğu ve doluluk." />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!term || !stats) {
    return (
      <>
        <PageHeader title="Kayıt İstatistikleri" sub="Aktif dönem kayıt yoğunluğu ve doluluk." />
        <Card title="Aktif dönem" icon="calendar">
          <EmptyState
            icon="calendar"
            title="Aktif dönem bulunamadı"
            sub="İstatistikler yalnızca aktif dönem için hesaplanır."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Kayıt İstatistikleri"
        sub={`${term.name} · aktif dönem kayıt yoğunluğu ve doluluk.`}
      />

      <StatGrid
        stats={[
          { label: 'Şube sayısı', value: stats.sectionCount, icon: 'layers' },
          { label: 'Toplam kontenjan', value: stats.totalQuota, icon: 'users' },
          { label: 'Dolu koltuk', value: stats.totalFilled, icon: 'checkCircle', tone: 'ok' },
          {
            label: 'Doluluk',
            value: `%${fillPct}`,
            icon: 'chart',
            tone: fillPct >= 85 ? 'warn' : undefined,
          },
        ]}
      />

      <div className="two-col">
        <Card title="Genel doluluk" icon="pie">
          <div className="row" style={{ gap: 20, alignItems: 'center', marginBottom: 0 }}>
            <Donut value={fillPct} />
            <div>
              <div className="muted">Dolu / Kontenjan</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {stats.totalFilled} / {stats.totalQuota}
              </div>
              <div className="muted">{stats.sectionCount} şube üzerinden</div>
            </div>
          </div>
        </Card>

        <Card title="Durum dağılımı" icon="chart">
          {chartData.length > 0 ? (
            <BarChart data={chartData} />
          ) : (
            <EmptyState icon="chart" title="Kayıt verisi yok" />
          )}
        </Card>
      </div>

      <Card title="Kayıt durumu dağılımı" icon="activity">
        <DataTable<DistRow>
          rows={dist}
          search={false}
          csv
          csvName="oidb-kayit-durum"
          empty={<EmptyState icon="activity" title="Kayıt verisi yok" />}
          columns={[
            {
              key: 'status',
              header: 'Durum',
              value: (r) => STATUS_TR[r.status] ?? r.status,
              render: (r) => (
                <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                  {STATUS_TR[r.status] ?? r.status}
                </Badge>
              ),
            },
            {
              key: 'count',
              header: 'Adet',
              num: true,
              sortable: true,
              value: (r) => r.count,
            },
          ]}
        />
      </Card>

      <Card
        title="Danışman onayı bekleyen kayıtlar"
        icon="clock"
        hint={`${pending.length} kayıt`}
      >
        <DataTable<PendingItem>
          rows={pending}
          search
          csv
          csvName="oidb-onay-bekleyen"
          empty={
            <EmptyState
              icon="checkCircle"
              title="Onay bekleyen kayıt yok"
              sub="Tüm ders seçimleri danışmanlar tarafından sonuçlandırılmış."
            />
          }
          columns={[
            {
              key: 'studentNo',
              header: 'Öğrenci No',
              sortable: true,
              value: (r) => r.studentNo,
              render: (r) => <b>{r.studentNo}</b>,
            },
            {
              key: 'fullName',
              header: 'Öğrenci',
              sortable: true,
              value: (r) => r.fullName,
            },
            {
              key: 'course',
              header: 'Ders',
              sortable: true,
              value: (r) => `${r.courseCode} ${r.courseName}`,
              render: (r) => (
                <span>
                  <b>{r.courseCode}</b> · {r.courseName}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
