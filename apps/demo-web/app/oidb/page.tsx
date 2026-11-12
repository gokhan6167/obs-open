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
  Alert,
  Skeleton,
  SkeletonStats,
  Meter,
  Donut,
  EmptyState,
  money,
} from '@/app/ui';

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number; // kuruş
}
interface Req {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}
interface Cap {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}
interface Pending {
  enrollmentId: string;
  studentNo: string;
  courseCode: string;
}
interface FinanceSummary {
  collected: number; // kuruş
  accrued: number; // kuruş
  outstanding: number; // kuruş
  debtorCount: number;
  topDebtors: {
    studentId: string;
    studentNo: string;
    programName: string;
    outstanding: number;
  }[];
}
interface AuditItem {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string;
}

const OPEN = new Set(['submitted', 'in_review']);
function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// Denetim eylemi → okunur etiket (öneklere göre).
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'student.status.change': 'Öğrenci durum değişikliği',
    'request.transition': 'Talep geçişi',
    'double_major.transition': 'ÇAP/Yandal geçişi',
    'graduation.approve': 'Mezuniyet onayı',
    'invoice.pay': 'Ödeme alındı',
    'yoksis.export': 'YÖKSİS bildirimi',
    'enrollment.transition': 'Ders kayıt geçişi',
  };
  if (map[action]) return map[action];
  // nokta ayraçlı aksiyonları insancıllaştır
  return action.replace(/[._]/g, ' ');
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export default function OidbDashboard(): React.ReactElement {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Kritik veri (dashboard) hata verirse sayfa hata gösterir; yan
      // kaynaklar (finans/denetim/kayıt) opsiyoneldir, sessizce boş kalabilir.
      const [d, r, c] = await Promise.all([
        api<Dashboard>('/reports/dashboard'),
        api<Req[]>('/portal/requests'),
        api<Cap[]>('/portal/double-major'),
      ]);
      setDash(d);
      setReqs(r);
      setCaps(c);
      await Promise.all([
        api<{ items: Pending[] }>('/portal/pending-enrollments')
          .then((p) => setPending(p.items ?? []))
          .catch(() => undefined),
        api<FinanceSummary>('/finance/summary')
          .then(setFin)
          .catch(() => undefined),
        api<{ items: AuditItem[] }>('/portal/audit')
          .then((a) => setAudit(a.items ?? []))
          .catch(() => undefined),
      ]);
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  if (err) return <Alert tone="err">{err}</Alert>;

  if (loading || !dash) {
    return (
      <>
        <PageHeader
          title="Öğrenci İşleri Panosu"
          sub="Bekleyen iş kuyrukları, öğrenci gövdesi, tahsilat ve günlük hacim özeti."
        />
        <SkeletonStats n={4} />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  const openReqs = reqs.filter((r) => OPEN.has(r.status)).length;
  const openCaps = caps.filter((c) => OPEN.has(c.status)).length;
  const todayReqs = reqs.filter((r) => isToday(r.createdAt)).length;
  const todayCaps = caps.filter((c) => isToday(c.createdAt)).length;
  const openPending = pending.length;
  const totalQueue = openReqs + openCaps + openPending;
  const collectionRate =
    fin && fin.accrued > 0 ? Math.round((fin.collected / fin.accrued) * 100) : null;

  return (
    <>
      <PageHeader
        title="Öğrenci İşleri Panosu"
        sub="Bekleyen iş kuyrukları, öğrenci gövdesi, tahsilat ve günlük hacim özeti."
      />

      {totalQueue > 0 && (
        <Alert tone="warn">
          <b>{totalQueue} kalem işlem bekliyor.</b> {openReqs} talep, {openCaps} ÇAP/Yandal ve{' '}
          {openPending} ders kayıt onayı sonuçlandırılmayı bekliyor.
        </Alert>
      )}

      <StatGrid
        stats={[
          {
            label: 'Bekleyen talep',
            value: openReqs,
            icon: 'inbox',
            tone: openReqs > 0 ? 'warn' : undefined,
          },
          {
            label: 'Bekleyen ÇAP / Yandal',
            value: openCaps,
            icon: 'layers',
            tone: openCaps > 0 ? 'warn' : undefined,
          },
          {
            label: 'Bekleyen ders kaydı',
            value: openPending,
            icon: 'book',
            tone: openPending > 0 ? 'warn' : undefined,
          },
          { label: 'Bugün gelen başvuru', value: todayReqs + todayCaps, icon: 'activity' },
        ]}
      />

      <StatGrid
        stats={[
          { label: 'Aktif öğrenci', value: dash.activeStudents, icon: 'users', tone: 'ok' },
          { label: 'Mezun öğrenci', value: dash.graduatedStudents, icon: 'award' },
          { label: 'Toplam öğrenci', value: dash.studentCount, icon: 'user' },
          { label: 'Toplam ders kaydı', value: dash.totalEnrollments, icon: 'grade' },
        ]}
      />

      <Card
        title="Tahsilat Özeti"
        icon="wallet"
        hint="Fatura/ödeme agregasyonu (tüm dönemler)."
      >
        {!fin ? (
          <EmptyState
            icon="wallet"
            title="Tahsilat verisi alınamadı"
            sub="Finans özeti için yetkiniz olmayabilir veya veri henüz oluşmadı."
          />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Tahsil edilen', value: money(fin.collected), icon: 'checkCircle', tone: 'ok' },
                { label: 'Tahakkuk', value: money(fin.accrued), icon: 'money' },
                {
                  label: 'Açık alacak',
                  value: money(fin.outstanding),
                  icon: 'alert',
                  tone: fin.outstanding > 0 ? 'danger' : undefined,
                },
                {
                  label: 'Borçlu öğrenci',
                  value: fin.debtorCount,
                  icon: 'users',
                  tone: fin.debtorCount > 0 ? 'warn' : undefined,
                },
              ]}
            />
            {collectionRate != null && (
              <div
                className="row"
                style={{ alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}
              >
                <Donut
                  value={collectionRate}
                  color={collectionRate >= 80 ? 'var(--ok)' : 'var(--accent)'}
                />
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    Tahsilat oranı %{collectionRate}
                  </div>
                  <Meter value={collectionRate} />
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {money(fin.collected)} / {money(fin.accrued)} tahsil edildi
                  </div>
                </div>
              </div>
            )}
            {fin.topDebtors.length > 0 && (
              <>
                <h2 style={{ marginTop: 16 }}>
                  En yüksek açık alacak{' '}
                  <span className="hint">({fin.debtorCount} borçlu öğrenci)</span>
                </h2>
                <DataTable
                  rows={fin.topDebtors.slice(0, 5)}
                  search={false}
                  columns={[
                    {
                      key: 'studentNo',
                      header: 'Öğrenci No',
                      value: (d) => d.studentNo,
                      render: (d) => <b>{d.studentNo}</b>,
                    },
                    { key: 'programName', header: 'Program', value: (d) => d.programName },
                    {
                      key: 'outstanding',
                      header: 'Açık alacak',
                      num: true,
                      value: (d) => d.outstanding,
                      render: (d) => <Badge tone="danger">{money(d.outstanding)}</Badge>,
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Card>

      <Card title="İş kuyruklarına git" icon="flag" hint="Bekleyen kalemleri gerekçeli olarak sonuçlandırın.">
        <div className="home-grid">
          <Link className="btn ghost" href="/oidb/talepler">
            Talep Kuyruğu ({openReqs})
          </Link>
          <Link className="btn ghost" href="/oidb/cap">
            ÇAP / Yandal ({openCaps})
          </Link>
          <Link className="btn ghost" href="/oidb/mezuniyet">
            Mezuniyet &amp; Belge
          </Link>
          <Link className="btn ghost" href="/oidb/ogrenciler">
            Öğrenci Arama &amp; 360
          </Link>
          <Link className="btn ghost" href="/oidb/yoksis">
            YÖKSİS Bildirim
          </Link>
        </div>
      </Card>

      <Card
        title="Son İşlemler"
        icon="activity"
        hint="Denetim kaydındaki son 8 hareket (zaman çizelgesi)."
      >
        {audit.length === 0 ? (
          <EmptyState icon="activity" title="Görüntülenecek denetim kaydı yok" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {audit.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="list-item"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <b>{actionLabel(a.action)}</b>
                  <div className="meta">
                    {a.entity}
                    {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}
                  </div>
                </div>
                <Badge tone="muted">
                  <span title={new Date(a.at).toLocaleString('tr-TR')}>{timeAgo(a.at)}</span>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
