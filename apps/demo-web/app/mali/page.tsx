'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  SkeletonStats,
  Skeleton,
  Meter,
  BarChart,
  Donut,
  Alert,
  Segmented,
  money,
} from '@/app/ui';

interface Summary {
  collected: number;
  accrued: number;
  outstanding: number;
  debtorCount: number;
  invoiceCount: number;
  partialCount: number;
  paidCount: number;
  scholarshipCount: number;
  scholarshipTotal: number;
  topDebtors: {
    studentId: string;
    studentNo: string;
    fullName: string;
    programName: string;
    status: string;
    outstanding: number;
  }[];
}

interface FinanceReport {
  term: { id: string; name: string } | null;
  totalAccrued: number;
  totalCollected: number;
  openReceivable: number;
  collectionRateBps: number;
  invoiceStatus: {
    unpaid: { count: number; amount: number };
    partial: { count: number; amount: number };
    paid: { count: number; amount: number };
  };
  scholarshipCount: number;
  byTerm: { termId: string; termName: string; accrued: number; collected: number }[];
  byProgram: { program: string; accrued: number; collected: number; openDebt: number }[];
}

type ProgramRow = FinanceReport['byProgram'][number];
type TermRow = FinanceReport['byTerm'][number];
type DebtorRow = Summary['topDebtors'][number];

const pct = (bps: number): string => (bps / 100).toFixed(1) + '%';

export default function TahsilatOzeti(): React.ReactElement {
  const [termId, setTermId] = useState<string>('');
  const [nonce, setNonce] = useState(0);
  const [sum, setSum] = useState<Summary | null>(null);
  const [rep, setRep] = useState<FinanceReport | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setErr('');
    const qs = termId ? `?termId=${termId}` : '';
    Promise.all([
      api<Summary>(`/finance/summary${qs}`),
      api<FinanceReport>(`/reports/finance-summary${qs}`),
    ])
      .then(([s, r]) => {
        setSum(s);
        setRep(r);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Tahsilat verisi alınamadı'))
      .finally(() => setLoading(false));
  }, [termId, nonce]);

  // Dönem seçici, backend'in ürettiği dönem serisinden beslenir (ayrı uç yok).
  const termOptions = useMemo(
    () => [
      { value: '', label: 'Tüm dönemler' },
      ...(rep?.byTerm ?? []).map((t) => ({ value: t.termId, label: t.termName })),
    ],
    [rep],
  );

  const rate = rep ? rep.collectionRateBps / 100 : 0;

  const invoiceChart = useMemo(() => {
    if (!rep) return [];
    return [
      { label: 'Ödendi', value: rep.invoiceStatus.paid.count },
      { label: 'Kısmi', value: rep.invoiceStatus.partial.count },
      { label: 'Ödenmemiş', value: rep.invoiceStatus.unpaid.count },
    ];
  }, [rep]);

  const debtorColumns = [
    { key: 'studentNo', header: 'Öğrenci No', sortable: true, value: (d: DebtorRow) => d.studentNo },
    { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (d: DebtorRow) => d.fullName },
    { key: 'programName', header: 'Program', sortable: true, value: (d: DebtorRow) => d.programName },
    {
      key: 'status',
      header: 'Durum',
      value: (d: DebtorRow) => d.status,
      render: (d: DebtorRow) => (
        <Badge tone={d.status === 'aktif' ? 'ok' : 'muted'}>{d.status}</Badge>
      ),
    },
    {
      key: 'outstanding',
      header: 'Kalan Borç',
      num: true,
      sortable: true,
      value: (d: DebtorRow) => d.outstanding,
      render: (d: DebtorRow) => (
        <span style={{ color: 'var(--danger)' }}>{money(d.outstanding)}</span>
      ),
    },
    {
      key: 'act',
      header: '',
      render: (d: DebtorRow) => (
        <a className="btn ghost sm" href={`/mali/borclar?id=${d.studentId}`}>
          Ekstre
        </a>
      ),
    },
  ];

  const programColumns = [
    { key: 'program', header: 'Program', sortable: true, value: (p: ProgramRow) => p.program },
    {
      key: 'accrued',
      header: 'Tahakkuk',
      num: true,
      sortable: true,
      value: (p: ProgramRow) => p.accrued,
      render: (p: ProgramRow) => money(p.accrued),
    },
    {
      key: 'collected',
      header: 'Tahsilat',
      num: true,
      sortable: true,
      value: (p: ProgramRow) => p.collected,
      render: (p: ProgramRow) => (
        <span style={{ color: 'var(--ok)' }}>{money(p.collected)}</span>
      ),
    },
    {
      key: 'openDebt',
      header: 'Açık Alacak',
      num: true,
      sortable: true,
      value: (p: ProgramRow) => p.openDebt,
      render: (p: ProgramRow) => (
        <span style={{ color: p.openDebt > 0 ? 'var(--danger)' : 'var(--ok)' }}>
          {money(p.openDebt)}
        </span>
      ),
    },
  ];

  const termColumns = [
    { key: 'termName', header: 'Dönem', sortable: true, value: (t: TermRow) => t.termName },
    {
      key: 'accrued',
      header: 'Tahakkuk',
      num: true,
      sortable: true,
      value: (t: TermRow) => t.accrued,
      render: (t: TermRow) => money(t.accrued),
    },
    {
      key: 'collected',
      header: 'Tahsilat',
      num: true,
      sortable: true,
      value: (t: TermRow) => t.collected,
      render: (t: TermRow) => (
        <span style={{ color: 'var(--ok)' }}>{money(t.collected)}</span>
      ),
    },
    {
      key: 'rate',
      header: 'Oran',
      num: true,
      sortable: true,
      value: (t: TermRow) => (t.accrued > 0 ? Math.round((t.collected / t.accrued) * 100) : 0),
      render: (t: TermRow) => {
        const r = t.accrued > 0 ? Math.round((t.collected / t.accrued) * 100) : 0;
        return <div style={{ minWidth: 120 }}><Meter value={r} label={`%${r}`} /></div>;
      },
    },
  ];

  const scope = rep?.term ? rep.term.name : 'Kümülatif (tüm dönemler)';

  return (
    <>
      <PageHeader
        title="Tahsilat Özeti"
        sub="Tahakkuk, tahsilat ve açık alacak; tahsilat oranı, fatura durum dağılımı, dönem ve program bazlı kırılım. Tüm rakamlar canlı mali kayıtlardan toplulaştırılır."
        actions={
          <Button
            variant="ghost"
            icon="refresh"
            onClick={() => setNonce((n) => n + 1)}
          >
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      <Card title="Dönem Kapsamı" icon="calendar" hint={loading ? 'Yükleniyor…' : `Seçili kapsam: ${scope}`}>
        <Segmented value={termId} onChange={setTermId} options={termOptions} />
      </Card>

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Tahsil edilen', value: sum ? money(sum.collected) : '—', icon: 'wallet', tone: 'ok' },
            { label: 'Tahakkuk (brüt fatura)', value: sum ? money(sum.accrued) : '—', icon: 'money' },
            {
              label: 'Açık alacak',
              value: sum ? money(sum.outstanding) : '—',
              icon: 'alert',
              tone: (sum?.outstanding ?? 0) > 0 ? 'danger' : 'ok',
            },
            {
              label: 'Borçlu öğrenci',
              value: sum ? sum.debtorCount : '—',
              icon: 'users',
              tone: (sum?.debtorCount ?? 0) > 0 ? 'warn' : 'ok',
            },
          ]}
        />
      )}

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 320px', display: 'flex' }}>
        <Card title="Tahsilat Oranı" icon="target" hint="Tahsil edilen / tahakkuk eden (seçili kapsam).">
          {loading ? (
            <Skeleton lines={3} />
          ) : (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <Donut value={Math.round(rate)} />
              <div>
                <div style={{ fontSize: 30, fontWeight: 700 }}>{rep ? pct(rep.collectionRateBps) : '—'}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Açık alacak:{' '}
                  <strong style={{ color: (rep?.openReceivable ?? 0) > 0 ? 'var(--danger)' : 'var(--ok)' }}>
                    {rep ? money(rep.openReceivable) : '—'}
                  </strong>
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  Aktif burslu öğrenci: <strong>{rep ? rep.scholarshipCount : '—'}</strong>
                </div>
              </div>
            </div>
          )}
        </Card>
        </div>

        <div style={{ flex: '2 1 420px', display: 'flex' }}>
        <Card title="Fatura Durum Dağılımı" icon="pie">
          {loading ? (
            <Skeleton lines={4} />
          ) : !rep ? null : (
            <>
              <BarChart data={invoiceChart} />
              <div className="row" style={{ marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
                <span>
                  <Badge tone="ok">ödendi</Badge> {rep.invoiceStatus.paid.count} · {money(rep.invoiceStatus.paid.amount)}
                </span>
                <span>
                  <Badge tone="warn">kısmi</Badge> {rep.invoiceStatus.partial.count} ·{' '}
                  <span style={{ color: 'var(--warn)' }}>{money(rep.invoiceStatus.partial.amount)}</span>
                </span>
                <span>
                  <Badge tone="danger">ödenmemiş</Badge> {rep.invoiceStatus.unpaid.count} ·{' '}
                  <span style={{ color: 'var(--danger)' }}>{money(rep.invoiceStatus.unpaid.amount)}</span>
                </span>
              </div>
            </>
          )}
        </Card>
        </div>
      </div>

      <Card title="Dönem Bazlı Tahsilat" icon="chart">
        {loading ? (
          <Skeleton lines={4} />
        ) : !rep || rep.byTerm.length === 0 ? (
          <EmptyState icon="calendar" title="Dönem verisi bulunmuyor" sub="Seçili kapsamda toplulaştırılacak dönem kaydı yok." />
        ) : (
          <DataTable
            rows={rep.byTerm}
            columns={termColumns}
            csv
            csvName="donem-tahsilat"
            search={false}
            pageSize={12}
          />
        )}
      </Card>

      <Card title="Program Bazlı Açık Alacak" icon="layers">
        {loading ? (
          <Skeleton lines={4} />
        ) : !rep || rep.byProgram.length === 0 ? (
          <EmptyState icon="layers" title="Program verisi bulunmuyor" sub="Seçili kapsamda program kırılımı yok." />
        ) : (
          <DataTable
            rows={rep.byProgram}
            columns={programColumns}
            csv
            csvName="program-alacak"
            pageSize={15}
          />
        )}
      </Card>

      <Card
        title="En Yüksek Borçlu Öğrenciler"
        icon="users"
        hint={
          <>
            Tahsilat için <a href="/mali/borclar">Öğrenci Borç Arama</a>; fatura kesmek için{' '}
            <a href="/mali/fatura">Fatura / Tahakkuk</a>.
          </>
        }
      >
        {loading ? (
          <Skeleton lines={5} />
        ) : !sum || sum.topDebtors.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Açık borçlu öğrenci yok"
            sub="Seçili kapsamda açık borcu olan öğrenci bulunmuyor."
          />
        ) : (
          <DataTable
            rows={sum.topDebtors}
            columns={debtorColumns}
            csv
            csvName="borclu-ogrenciler"
            pageSize={15}
          />
        )}
      </Card>
    </>
  );
}
