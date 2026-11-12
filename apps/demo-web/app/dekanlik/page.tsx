'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  Meter,
  ProgressBar,
  EmptyState,
  money,
} from '@/app/ui';

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}
interface ProgRow {
  program: string;
  count: number;
}
interface QueueItem {
  id: string;
  status: string;
  createdAt: string;
}

const isPending = (s: string): boolean => s === 'submitted' || s === 'in_review';
const daysWaiting = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function FakultePanosu(): React.ReactElement {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [progs, setProgs] = useState<ProgRow[]>([]);
  const [reqs, setReqs] = useState<QueueItem[]>([]);
  const [apps, setApps] = useState<QueueItem[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Dashboard>('/reports/dashboard'),
      api<ProgRow[]>('/reports/students-by-program'),
      api<QueueItem[]>('/portal/requests'),
      api<QueueItem[]>('/portal/double-major'),
    ])
      .then(([d, p, r, a]) => {
        setDash(d);
        setProgs([...p].sort((x, y) => y.count - x.count));
        setReqs(r);
        setApps(a);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const total = useMemo(() => progs.reduce((s, p) => s + p.count, 0), [progs]);
  const max = useMemo(() => progs.reduce((m, p) => Math.max(m, p.count), 0) || 1, [progs]);

  if (err) return <Alert tone="err">{err}</Alert>;

  const gradRate =
    dash && dash.studentCount > 0 ? (dash.graduatedStudents / dash.studentCount) * 100 : 0;
  const activeRate =
    dash && dash.studentCount > 0 ? (dash.activeStudents / dash.studentCount) * 100 : 0;

  const pendingReqs = reqs.filter((r) => isPending(r.status));
  const pendingApps = apps.filter((a) => isPending(a.status));
  const overdueReqs = pendingReqs.filter((r) => daysWaiting(r.createdAt) >= 3).length;
  const overdueApps = pendingApps.filter((a) => daysWaiting(a.createdAt) >= 3).length;
  const totalPending = pendingReqs.length + pendingApps.length;
  const totalOverdue = overdueReqs + overdueApps;

  return (
    <>
      <PageHeader
        title="Fakülte Panosu"
        sub="Fakülte geneli öğrenci, başarı, doluluk ve tahsilat göstergeleri ile açık onay iş yükü. Program bazlı dağılım için Program Dağılımı sayfasına bakınız."
        actions={
          <Link href="/dekanlik/program-dagilim">
            <Button variant="ghost" icon="chart">
              Program Dağılımı
            </Button>
          </Link>
        }
      />

      {loading ? (
        <SkeletonStats n={5} />
      ) : (
        <>
          {totalPending > 0 && (
            <Alert tone={totalOverdue > 0 ? 'err' : 'ok'}>
              Onay bekleyen <b>{totalPending}</b> kayıt var
              {totalOverdue > 0 ? (
                <>
                  , bunların <b>{totalOverdue}</b> tanesi 3+ gündür gecikmiş.
                </>
              ) : (
                '.'
              )}{' '}
              <Link href="/dekanlik/talep-onay">Talep Kuyruğu</Link> ·{' '}
              <Link href="/dekanlik/cap-onay">ÇAP/Yandal Kuyruğu</Link>
            </Alert>
          )}

          {dash && (
            <StatGrid
              stats={[
                { label: 'Toplam Öğrenci', value: dash.studentCount, icon: 'users' },
                {
                  label: `Aktif Öğrenci (%${activeRate.toFixed(0)})`,
                  value: dash.activeStudents,
                  icon: 'checkCircle',
                  tone: 'ok',
                },
                {
                  label: `Mezun (%${gradRate.toFixed(0)})`,
                  value: dash.graduatedStudents,
                  icon: 'award',
                },
                { label: 'Toplam Ders Kaydı', value: dash.totalEnrollments, icon: 'book' },
                { label: 'Tahsil Edilen', value: money(dash.collectedAmount), icon: 'wallet' },
              ]}
            />
          )}

          <Card title="Öğrenci Başarı Oranları" icon="pie">
            <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Meter value={activeRate} label={`Aktif öğrenci oranı · %${activeRate.toFixed(0)}`} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Meter value={gradRate} label={`Mezuniyet oranı · %${gradRate.toFixed(0)}`} />
              </div>
            </div>
          </Card>

          <StatGrid
            stats={[
              { label: 'Bekleyen Öğrenci Talebi', value: pendingReqs.length, icon: 'inbox' },
              { label: 'Bekleyen ÇAP/Yandal', value: pendingApps.length, icon: 'layers' },
              {
                label: 'Gecikmiş (3+ gün)',
                value: totalOverdue,
                icon: 'clock',
                tone: totalOverdue > 0 ? 'danger' : 'ok',
              },
            ]}
          />

          <Card
            title="Program Bazlı Öğrenci Dağılımı"
            icon="chart"
            hint={`${progs.length} programda toplam ${total} öğrenci. Program adına göre arayın; CSV olarak dışa aktarabilirsiniz.`}
          >
            <DataTable<ProgRow>
              rows={progs}
              search
              csv
              csvName="program-dagilimi"
              empty={
                <EmptyState
                  icon="chart"
                  title="Program verisi bulunamadı"
                  sub="Henüz kayıtlı öğrenci dağılımı yok."
                />
              }
              columns={[
                {
                  key: 'program',
                  header: 'Program',
                  sortable: true,
                  value: (p) => p.program,
                  render: (p) => <b>{p.program}</b>,
                },
                {
                  key: 'count',
                  header: 'Öğrenci',
                  sortable: true,
                  num: true,
                  value: (p) => p.count,
                },
                {
                  key: 'share',
                  header: 'Pay',
                  num: true,
                  value: (p) => (total > 0 ? (p.count / total) * 100 : 0),
                  render: (p) => (
                    <span className="muted">
                      %{total > 0 ? ((p.count / total) * 100).toFixed(1) : '0'}
                    </span>
                  ),
                },
                {
                  key: 'dist',
                  header: 'Dağılım',
                  render: (p) => (
                    <div style={{ minWidth: 120 }}>
                      <ProgressBar value={(p.count / max) * 100} />
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {loading && <Skeleton lines={6} />}
    </>
  );
}
