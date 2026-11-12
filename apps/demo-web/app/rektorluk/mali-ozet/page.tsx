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
  SkeletonStats,
  Skeleton,
  EmptyState,
  Drawer,
  ProgressBar,
  Meter,
  Icon,
  money,
} from '@/app/ui';

interface InvoiceBucket {
  count: number;
  amount: number;
}
interface ByTerm {
  termId: string;
  termName: string;
  accrued: number;
  collected: number;
}
interface ByProgram {
  program: string;
  accrued: number;
  collected: number;
  openDebt: number;
}
interface FinanceReport {
  term: { id: string; name: string } | null;
  totalAccrued: number;
  totalCollected: number;
  openReceivable: number;
  collectionRateBps: number;
  invoiceStatus: {
    unpaid: InvoiceBucket;
    partial: InvoiceBucket;
    paid: InvoiceBucket;
  };
  scholarshipCount: number;
  byTerm: ByTerm[];
  byProgram: ByProgram[];
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
  topDebtors: TopDebtor[];
  debtorCount: number;
}

const num = (n: number): string => n.toLocaleString('tr-TR');

export default function MaliOzet(): React.ReactElement {
  const [termId, setTermId] = useState<string>('');
  const [rep, setRep] = useState<FinanceReport | null>(null);
  const [debtors, setDebtors] = useState<TopDebtor[]>([]);
  const [terms, setTerms] = useState<ByTerm[]>([]);
  const [openProg, setOpenProg] = useState<ByProgram | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Dönem filtresi değiştikçe rapor + borçlu listesini yeniden çek.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const qs = termId ? `?termId=${termId}` : '';
        const [report, summary] = await Promise.all([
          api<FinanceReport>(`/reports/finance-summary${qs}`),
          api<FinanceSummary>(`/finance/summary${qs}`).catch(() => ({ topDebtors: [], debtorCount: 0 })),
        ]);
        if (!alive) return;
        setRep(report);
        setDebtors(summary.topDebtors ?? []);
        // Dönem listesi tüm dönemleri kapsar (byTerm filtresizdir); ilk yüklemede sabitlenir.
        if (report.byTerm.length && terms.length === 0) setTerms(report.byTerm);
        setErr('');
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Hata');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const termMax = useMemo(() => Math.max(1, ...(rep?.byTerm ?? []).map((t) => t.accrued)), [rep]);
  const progMax = useMemo(() => Math.max(1, ...(rep?.byProgram ?? []).map((p) => p.accrued)), [rep]);

  const sub = rep
    ? `Tahakkuk / tahsilat / açık alacak · ${rep.term ? rep.term.name : 'tüm dönemler'} · canlı finans motoru`
    : 'Tahakkuk / tahsilat / açık alacak · canlı finans motoru';

  const filterBar = (
    <Card title="Dönem Filtresi" icon="filter">
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div className="field" style={{ flex: '1 1 260px', marginBottom: 0 }}>
          <label>Dönem</label>
          <select value={termId} onChange={(e) => setTermId(e.target.value)} disabled={loading}>
            <option value="">Tüm dönemler</option>
            {terms.map((t) => (
              <option key={t.termId} value={t.termId}>
                {t.termName}
              </option>
            ))}
          </select>
        </div>
        {loading && <span className="muted">Güncelleniyor…</span>}
        <Button variant="ghost" icon="download" sm onClick={() => window.print()}>
          PDF / Yazdır
        </Button>
      </div>
    </Card>
  );

  if (err) {
    return (
      <>
        <PageHeader title="Mali Özet" sub={sub} />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }
  if (!rep) {
    return (
      <>
        <PageHeader title="Mali Özet" sub={sub} />
        <SkeletonStats n={5} />
        <Skeleton lines={6} />
      </>
    );
  }

  const collRate = rep.collectionRateBps / 100;
  const st = rep.invoiceStatus;
  const totalInvoices = st.unpaid.count + st.partial.count + st.paid.count;
  const statusMax = Math.max(1, st.unpaid.amount, st.partial.amount, st.paid.amount);
  const openProgRate = openProg && openProg.accrued > 0 ? (openProg.collected / openProg.accrued) * 100 : 0;

  return (
    <>
      <PageHeader title="Mali Özet" sub={sub} />

      {filterBar}

      <StatGrid
        stats={[
          { label: 'Tahakkuk', value: money(rep.totalAccrued), icon: 'file' },
          { label: 'Tahsilat', value: money(rep.totalCollected), icon: 'wallet', tone: 'ok' },
          { label: 'Açık Alacak', value: money(rep.openReceivable), icon: 'alert', tone: rep.openReceivable > 0 ? 'danger' : 'ok' },
          { label: 'Tahsilat Oranı', value: collRate.toFixed(1) + '%', icon: 'activity', tone: collRate >= 80 ? 'ok' : collRate >= 50 ? 'warn' : 'danger' },
          { label: 'Burslu Öğrenci', value: num(rep.scholarshipCount), icon: 'award' },
        ]}
      />

      <div className="home-grid">
        <Card title="Tahsilat Oranı" icon="activity" hint="Tahsil edilen / tahakkuk eden">
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span className="muted">{money(rep.totalCollected)} tahsil</span>
            <b>{collRate.toFixed(1)}%</b>
          </div>
          <div style={{ marginTop: 6 }}>
            <Meter value={collRate} />
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Kalan açık alacak: <b>{money(rep.openReceivable)}</b>
          </p>
        </Card>

        <Card title="Fatura Durum Dağılımı" icon="pie" hint={`${num(totalInvoices)} fatura · tutar bazlı`}>
          <table>
            <tbody>
              <tr>
                <td style={{ width: 90 }}>
                  <Badge tone="danger">Ödenmedi</Badge>
                </td>
                <td>
                  <ProgressBar value={(st.unpaid.amount / statusMax) * 100} tone="danger" />
                </td>
                <td style={{ textAlign: 'right', width: 60 }}>{num(st.unpaid.count)}</td>
                <td style={{ textAlign: 'right' }}>{money(st.unpaid.amount)}</td>
              </tr>
              <tr>
                <td>
                  <Badge tone="warn">Kısmi</Badge>
                </td>
                <td>
                  <ProgressBar value={(st.partial.amount / statusMax) * 100} tone="warn" />
                </td>
                <td style={{ textAlign: 'right' }}>{num(st.partial.count)}</td>
                <td style={{ textAlign: 'right' }}>{money(st.partial.amount)}</td>
              </tr>
              <tr>
                <td>
                  <Badge tone="ok">Ödendi</Badge>
                </td>
                <td>
                  <ProgressBar value={(st.paid.amount / statusMax) * 100} />
                </td>
                <td style={{ textAlign: 'right' }}>{num(st.paid.count)}</td>
                <td style={{ textAlign: 'right' }}>{money(st.paid.amount)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* Dönem trendi */}
      {rep.byTerm.length > 0 && (
        <Card title="Dönem Trendi" icon="chart" hint="Tüm dönemler · tahakkuk (çubuk) vs. tahsilat (oran)">
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th style={{ width: '35%' }}>Tahakkuk</th>
                <th style={{ textAlign: 'right' }}>Tahakkuk</th>
                <th style={{ textAlign: 'right' }}>Tahsilat</th>
                <th style={{ textAlign: 'right' }}>Oran</th>
              </tr>
            </thead>
            <tbody>
              {rep.byTerm.map((t) => {
                const rate = t.accrued > 0 ? (t.collected / t.accrued) * 100 : 0;
                return (
                  <tr key={t.termId} style={rep.term?.id === t.termId ? { background: 'var(--surface-2, #f0f6ff)' } : undefined}>
                    <td>
                      <b>{t.termName}</b>
                    </td>
                    <td>
                      <ProgressBar value={(t.accrued / termMax) * 100} />
                    </td>
                    <td style={{ textAlign: 'right' }}>{money(t.accrued)}</td>
                    <td style={{ textAlign: 'right' }}>{money(t.collected)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge tone={rate >= 80 ? 'ok' : rate >= 50 ? 'warn' : 'danger'}>{rate.toFixed(0)}%</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Program bazlı açık alacak + drawer */}
      {rep.byProgram.length > 0 && (
        <Card title="Program Bazlı Açık Alacak" icon="layers" hint="Satıra tıklayarak program mali detayını açın">
          <DataTable
            rows={rep.byProgram}
            csv
            csvName="program-mali-ozet"
            pageSize={30}
            columns={[
              { key: 'program', header: 'Program', sortable: true, value: (p) => p.program, render: (p) => <b>{p.program}</b> },
              { key: 'accrued', header: 'Tahakkuk', num: true, sortable: true, value: (p) => p.accrued, render: (p) => <ProgressBar value={(p.accrued / progMax) * 100} /> },
              {
                key: 'openDebt',
                header: 'Açık Alacak',
                num: true,
                sortable: true,
                value: (p) => p.openDebt,
                render: (p) => <Badge tone={p.openDebt > 0 ? 'danger' : 'ok'}>{money(p.openDebt)}</Badge>,
              },
              {
                key: 'detay',
                header: '',
                render: (p) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => setOpenProg(p)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* En yüksek borçlular */}
      <Card title="En Yüksek Açık Alacaklı Öğrenciler" icon="alert" hint={debtors.length ? `ilk ${debtors.length}` : undefined}>
        <DataTable
          rows={debtors}
          csv
          csvName="acik-alacaklilar"
          search={false}
          empty={<EmptyState icon="checkCircle" title="Açık alacaklı öğrenci yok" sub="Seçili kapsamda açık alacaklı öğrenci bulunmuyor." />}
          columns={[
            { key: 'studentNo', header: 'No', sortable: true, value: (r) => r.studentNo, render: (r) => <b>{r.studentNo}</b> },
            { key: 'fullName', header: 'Öğrenci', sortable: true, value: (r) => r.fullName },
            { key: 'programName', header: 'Program', sortable: true, value: (r) => r.programName },
            { key: 'outstanding', header: 'Açık Alacak', num: true, sortable: true, value: (r) => r.outstanding, render: (r) => <b>{money(r.outstanding)}</b> },
          ]}
        />
      </Card>

      <Drawer open={!!openProg} onClose={() => setOpenProg(null)} title={openProg?.program}>
        {openProg && (
          <>
            <StatGrid
              stats={[
                { label: 'Tahakkuk', value: money(openProg.accrued), icon: 'file' },
                { label: 'Tahsilat', value: money(openProg.collected), icon: 'wallet', tone: 'ok' },
                { label: 'Açık Alacak', value: money(openProg.openDebt), icon: 'alert', tone: openProg.openDebt > 0 ? 'danger' : 'ok' },
                { label: 'Tahsilat Oranı', value: openProgRate.toFixed(1) + '%', icon: 'activity' },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <div className="hint" style={{ marginBottom: 4 }}>Tahsilat oranı</div>
              <Meter value={openProgRate} />
            </div>
          </>
        )}
      </Drawer>

      <Alert tone="info">
        Salt-okunur üst yönetim görünümü. Fatura kesme, tahsilat, borç ve mutabakat işlemleri
        rektörlük panelinden yapılmaz; ilgili işlemler için{' '}
        <Link href="/mali">Mali İşler paneli</Link> kullanılır.
      </Alert>
    </>
  );
}
