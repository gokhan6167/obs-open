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
  ProgressBar,
  Segmented,
  EmptyState,
} from '@/app/ui';

interface SectionRow {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  instructorName: string | null;
  quota: number;
  enrolled: number;
  fillRate: number;
  isOpen: boolean;
}
interface Term {
  id: string;
  name: string;
}
interface TermStats {
  sectionCount: number;
  totalQuota: number;
  totalFilled: number;
  fillRate: number;
  enrollmentsByStatus: Record<string, number>;
}

type FillTone = 'ok' | 'warn' | 'danger';
function fillTone(rate: number): FillTone {
  if (rate >= 100) return 'danger';
  if (rate >= 80) return 'warn';
  return 'ok';
}

export default function BolumSubeler(): React.ReactElement {
  const [rows, setRows] = useState<SectionRow[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [stats, setStats] = useState<TermStats | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'all' | 'full'>('all');

  useEffect(() => {
    (async () => {
      try {
        const [sec, t] = await Promise.all([
          api<{ items: SectionRow[] }>('/portal/sections'),
          api<Term | null>('/calendar/active-term'),
        ]);
        setRows(sec.items);
        setTerm(t);
        if (t?.id) setStats(await api<TermStats>(`/enrollment/stats/${t.id}`).catch(() => null));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Yükleme hatası');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => (scope === 'full' ? !r.isOpen : true))
        .sort((a, b) => b.fillRate - a.fillRate),
    [rows, scope],
  );

  const totalQuota = rows.reduce((a, r) => a + r.quota, 0);
  const totalEnrolled = rows.reduce((a, r) => a + r.enrolled, 0);
  const fullCount = rows.filter((r) => !r.isOpen).length;
  const avgFill = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.fillRate, 0) / rows.length)
    : 0;

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Ders / Şube & Kontenjan"
        sub={`${term ? `${term.name} · ` : ''}Şube doluluk ısı-haritası ve kontenjan durumu.`}
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Şube', value: rows.length, icon: 'layers' },
            {
              label: 'Dolu / Kontenjan',
              value: `${totalEnrolled}/${totalQuota}`,
              icon: 'users',
            },
            {
              label: 'Ortalama doluluk',
              value: `%${avgFill}`,
              icon: 'pie',
              tone: avgFill >= 85 ? 'warn' : undefined,
            },
            {
              label: 'Dolu şube',
              value: fullCount,
              icon: 'alert',
              tone: fullCount > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      {stats && (
        <Card
          title="Dönem Kayıt İstatistiği"
          icon="chart"
          hint="Canlı dönem toplamları (aktif tüm şubeler)."
        >
          <StatGrid
            stats={[
              { label: 'Toplam şube', value: stats.sectionCount, icon: 'layers' },
              {
                label: 'Dolu / Kontenjan',
                value: `${stats.totalFilled}/${stats.totalQuota}`,
                icon: 'users',
              },
              {
                label: 'Doluluk',
                value: `%${Math.round(stats.fillRate * 100)}`,
                icon: 'pie',
                tone: stats.fillRate >= 0.85 ? 'warn' : undefined,
              },
              {
                label: 'Onay bekleyen',
                value: stats.enrollmentsByStatus['submitted'] ?? 0,
                icon: 'inbox',
                tone: (stats.enrollmentsByStatus['submitted'] ?? 0) > 0 ? 'warn' : undefined,
              },
            ]}
          />
        </Card>
      )}

      <Card
        title="Doluluk Isı-Haritası"
        icon="target"
        actions={
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'full', label: 'Dolu şubeler' },
            ]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<SectionRow>
            rows={sorted}
            search
            csv
            csvName="bolum-subeler"
            empty={
              <EmptyState
                icon="layers"
                title="Gösterilecek şube yok"
                sub={scope === 'full' ? 'Şu an dolu şube bulunmuyor.' : 'Aktif dönemde şube kaydı yok.'}
              />
            }
            columns={[
              {
                key: 'course',
                header: 'Ders',
                sortable: true,
                value: (r) => `${r.courseCode} ${r.courseName}`,
                render: (r) => (
                  <>
                    <b>{r.courseCode}</b> · {r.courseName}
                  </>
                ),
              },
              {
                key: 'sectionCode',
                header: 'Şube',
                sortable: true,
                value: (r) => r.sectionCode,
              },
              {
                key: 'instructorName',
                header: 'Hoca',
                sortable: true,
                value: (r) => r.instructorName ?? '',
                render: (r) => r.instructorName ?? <span className="muted">atanmadı</span>,
              },
              {
                key: 'fillRate',
                header: 'Doluluk',
                sortable: true,
                num: true,
                value: (r) => r.fillRate,
                render: (r) => (
                  <Badge tone={fillTone(r.fillRate)}>
                    {r.enrolled}/{r.quota} · %{r.fillRate}
                  </Badge>
                ),
              },
              {
                key: 'heat',
                header: 'Isı',
                render: (r) => {
                  const t = fillTone(r.fillRate);
                  return (
                    <div style={{ minWidth: 120 }} title={`%${r.fillRate}`}>
                      <ProgressBar
                        value={Math.min(r.fillRate, 100)}
                        tone={t === 'ok' ? undefined : t}
                      />
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
