'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Alert,
  SkeletonStats,
  Skeleton,
  Meter,
  Donut,
  BarChart,
  DataTable,
  EmptyState,
  Icon,
  money,
} from '@/app/ui';

interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}
interface TopDebtor {
  studentId: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  outstanding: number;
}
interface FinanceSummary {
  collected: number;
  accrued: number;
  outstanding: number;
  debtorCount: number;
  invoiceCount: number;
  partialCount: number;
  paidCount: number;
  scholarshipCount: number;
  scholarshipTotal: number;
  topDebtors: TopDebtor[];
}
interface ActiveTerm {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface TermStats {
  sectionCount: number;
  totalQuota: number;
  totalFilled: number;
  fillRate: number;
  enrollmentsByStatus: Record<string, number>;
}

const num = (n: number): string => n.toLocaleString('tr-TR');
const pct = (part: number, whole: number): string =>
  whole > 0 ? ((part / whole) * 100).toFixed(1) + '%' : '—';

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  mezun: 'Mezun',
  kayit_dondurma: 'Kayıt Donduruldu',
  pasif: 'Pasif',
  iliskigi_kesildi: 'İlişiği Kesildi',
  azami_sure_doldu: 'Azami Süre Doldu',
  af_ogrencisi: 'Af Öğrencisi',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  mezun: 'ok',
  kayit_dondurma: 'warn',
  af_ogrencisi: 'warn',
  azami_sure_doldu: 'warn',
  pasif: 'muted',
  iliskigi_kesildi: 'danger',
};

export default function UstYonetimKpi(): React.ReactElement {
  const [d, setD] = useState<Dashboard | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [term, setTerm] = useState<ActiveTerm | null>(null);
  const [ts, setTs] = useState<TermStats | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // KPI + mali özet paralel; dönem istatistiği aktif döneme bağlı (sıralı).
        const [dash, finance, activeTerm] = await Promise.all([
          api<Dashboard>('/reports/dashboard'),
          api<FinanceSummary>('/finance/summary').catch(() => null),
          api<ActiveTerm | null>('/calendar/active-term').catch(() => null),
        ]);
        if (!alive) return;
        setD(dash);
        setFin(finance);
        setTerm(activeTerm);
        if (activeTerm) {
          const stats = await api<TermStats>(`/enrollment/stats/${activeTerm.id}`).catch(() => null);
          if (alive) setTs(stats);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Hata');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sub = (
    <>
      Kurum geneli komuta paneli · canlı · rapor + finans + kayıt motorları
      {term ? ` · aktif dönem: ${term.name}` : ' · aktif dönem tanımsız'}
    </>
  );

  if (err) {
    return (
      <>
        <PageHeader title="Üst Yönetim KPI" sub={sub} />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }
  if (loading || !d) {
    return (
      <>
        <PageHeader title="Üst Yönetim KPI" sub={sub} />
        <SkeletonStats n={6} />
        <Skeleton lines={5} />
      </>
    );
  }

  const collectionRate = fin && fin.accrued > 0 ? (fin.collected / fin.accrued) * 100 : null;
  const statusEntries = ts ? Object.entries(ts.enrollmentsByStatus) : [];

  return (
    <>
      <PageHeader
        title="Üst Yönetim KPI"
        sub={sub}
        actions={
          <>
            <Link href="/rektorluk/mali-ozet" className="btn ghost sm">
              <Icon name="money" size={15} /> Mali özet
            </Link>
            <Link href="/rektorluk/denetim" className="btn ghost sm">
              <Icon name="shield" size={15} /> Denetim
            </Link>
          </>
        }
      />

      <StatGrid
        stats={[
          { label: 'Toplam Öğrenci', value: num(d.studentCount), icon: 'users' },
          { label: `Aktif · ${pct(d.activeStudents, d.studentCount)}`, value: num(d.activeStudents), icon: 'check', tone: 'ok' },
          { label: `Mezun · ${pct(d.graduatedStudents, d.studentCount)}`, value: num(d.graduatedStudents), icon: 'award' },
          { label: 'Toplam Ders Kaydı', value: num(d.totalEnrollments), icon: 'book' },
          { label: 'Toplam Tahsilat', value: money(d.collectedAmount), icon: 'wallet', tone: 'ok' },
          ...(collectionRate != null
            ? [{ label: 'Tahsilat Oranı', value: collectionRate.toFixed(1) + '%', icon: 'activity', tone: (collectionRate >= 80 ? 'ok' : collectionRate >= 50 ? 'warn' : 'danger') as 'ok' | 'warn' | 'danger' }]
            : []),
        ]}
      />

      <div className="home-grid" style={{ marginTop: 4 }}>
        <Card title="Mali Sağlık" icon="wallet" hint="Tüm dönemler · tahakkuk vs. tahsilat">
          {!fin ? (
            <EmptyState icon="wallet" title="Mali özet yüklenemedi" sub="Finans motoru geçici olarak yanıt vermedi." />
          ) : (
            <>
              <table>
                <tbody>
                  <tr>
                    <td>Tahakkuk (fatura toplamı)</td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{money(fin.accrued)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Tahsil edilen</td>
                    <td style={{ textAlign: 'right' }}>{money(fin.collected)}</td>
                  </tr>
                  <tr>
                    <td>Açık alacak</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge tone={fin.outstanding > 0 ? 'danger' : 'ok'}>{money(fin.outstanding)}</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
              {collectionRate != null && (
                <div style={{ marginTop: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span className="muted">Tahsilat oranı</span>
                    <b>{collectionRate.toFixed(1)}%</b>
                  </div>
                  <Meter value={collectionRate} />
                </div>
              )}
              <StatGrid
                stats={[
                  { label: 'Borçlu öğrenci', value: num(fin.debtorCount), tone: fin.debtorCount > 0 ? 'warn' : undefined },
                  { label: 'Kapanan fatura', value: num(fin.paidCount), tone: 'ok' },
                  { label: 'Kısmi ödenen', value: num(fin.partialCount) },
                  { label: 'Burslu öğrenci', value: num(fin.scholarshipCount) },
                ]}
              />
            </>
          )}
        </Card>

        <Card title="Akademik Sağlık · Aktif Dönem" icon="grade" hint={term ? `${term.name} · kontenjan doluluğu` : undefined}>
          {!term ? (
            <EmptyState icon="calendar" title="Aktif dönem tanımlı değil" sub="Dönem açıldığında canlı doluluk verisi burada görünür." />
          ) : !ts ? (
            <EmptyState icon="chart" title="Dönem istatistiği yüklenemedi" sub="Kayıt motoru geçici olarak yanıt vermedi." />
          ) : (
            <>
              <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                <Donut value={ts.fillRate * 100} />
                <div style={{ flex: 1 }}>
                  <StatGrid
                    stats={[
                      { label: 'Dolu koltuk', value: num(ts.totalFilled) },
                      { label: 'Toplam kontenjan', value: num(ts.totalQuota) },
                      { label: 'Şube', value: num(ts.sectionCount) },
                    ]}
                  />
                </div>
              </div>
              {statusEntries.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="hint" style={{ marginBottom: 8 }}>Kayıt Durum Dağılımı</div>
                  <BarChart data={statusEntries.map(([k, v]) => ({ label: STATUS_TR[k] ?? k, value: v }))} />
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="En Yüksek Açık Alacaklı Öğrenciler"
        icon="alert"
        hint="Salt-izleme · tahsilat işlemleri Mali İşler panelinde yürütülür"
      >
        <DataTable
          rows={fin?.topDebtors ?? []}
          csv
          csvName="acik-alacaklilar"
          search={false}
          empty={<EmptyState icon="checkCircle" title="Açık alacaklı öğrenci yok" sub="Tüm faturalar kapanmış görünüyor." />}
          columns={[
            { key: 'studentNo', header: 'No', sortable: true, value: (r) => r.studentNo, render: (r) => <b>{r.studentNo}</b> },
            { key: 'fullName', header: 'Öğrenci', sortable: true, value: (r) => r.fullName },
            { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
            {
              key: 'status',
              header: 'Durum',
              value: (r) => STATUS_TR[r.status] ?? r.status,
              render: (r) => <Badge tone={STATUS_BADGE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>,
            },
            {
              key: 'outstanding',
              header: 'Açık Alacak',
              num: true,
              sortable: true,
              value: (r) => r.outstanding,
              render: (r) => <b>{money(r.outstanding)}</b>,
            },
          ]}
        />
      </Card>

      <Alert tone="info">
        Bu ekran yalnızca izleme amaçlıdır; rektörlük panelinden veri yazılmaz. Rakamlar tenant
        kapsamında rapor/finans/kayıt motorlarından (canlı aggregation) gelir.
      </Alert>
    </>
  );
}
