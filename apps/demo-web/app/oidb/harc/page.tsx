'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Drawer,
  EmptyState,
  Donut,
  money,
  fmtDate,
} from '@/app/ui';

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
  topDebtors: {
    studentId: string;
    studentNo: string;
    fullName: string;
    programName: string;
    status: string;
    outstanding: number;
  }[];
}

interface ReconItem {
  id: string;
  bankRef: string;
  amount: number;
  importedAt: string;
  matchedPaymentId: string | null;
  matchedStudentNo: string | null;
  matchedStudentName: string | null;
  matchedInvoiceId: string | null;
}
interface ReconReport {
  items: ReconItem[];
  summary: { total: number; matched: number; unmatched: number };
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa?: number;
}

interface PaymentRow {
  id: string;
  invoiceId: string;
  amount: number;
  provider: string;
  providerRef: string | null;
  createdAt: string;
}
interface Statement {
  invoices: {
    id: string;
    termName: string;
    gross: number;
    scholarshipDeduction: number;
    net: number;
    paidAmount: number;
    outstanding: number;
    status: string;
    createdAt: string;
    payments: PaymentRow[];
  }[];
  scholarships: {
    type: string;
    rateBps: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  totals: { accrued: number; paid: number; outstanding: number };
}

interface Debt {
  studentId: string;
  outstanding: number;
}

const INV_STATUS_TR: Record<string, string> = {
  unpaid: 'Ödenmemiş',
  partial: 'Kısmi ödenmiş',
  paid: 'Ödenmiş',
};
const INV_STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  unpaid: 'danger',
  partial: 'warn',
  paid: 'ok',
};

export default function HarcPage(): React.ReactElement {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [recon, setRecon] = useState<ReconReport | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Öğrenci borç sorgu sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [loadingStu, setLoadingStu] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      api<FinanceSummary>('/finance/summary'),
      api<ReconReport>('/finance/reconciliation'),
    ]);
    setSummary(s);
    setRecon(r);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const collectRate = useMemo(() => {
    if (!summary || summary.accrued <= 0) return 0;
    return Math.round((summary.collected / summary.accrued) * 100);
  }, [summary]);

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setDrawerErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
    } catch (e) {
      setDrawerErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  async function pick(s: StudentHit): Promise<void> {
    setPicked(s);
    setStatement(null);
    setDebt(null);
    setLoadingStu(true);
    setDrawerErr('');
    try {
      const [st, d] = await Promise.all([
        api<Statement>(`/finance/students/${s.id}/statement`),
        api<Debt>(`/finance/students/${s.id}/debt`),
      ]);
      setStatement(st);
      setDebt(d);
    } catch (e) {
      setDrawerErr(e instanceof Error ? e.message : 'Ekstre alınamadı');
    } finally {
      setLoadingStu(false);
    }
  }

  function closeDrawer(): void {
    setOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setStatement(null);
    setDebt(null);
    setDrawerErr('');
  }

  return (
    <>
      <PageHeader
        title="Harç İşlemleri"
        sub="Tahsilat özeti, banka mutabakatı ve öğrenci borç sorgulama."
        actions={
          <Button icon="search" onClick={() => setOpen(true)}>
            Öğrenci borç sorgu
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        summary && (
          <StatGrid
            stats={[
              { label: 'Tahakkuk', value: money(summary.accrued), icon: 'file' },
              {
                label: 'Tahsilat',
                value: money(summary.collected),
                icon: 'checkCircle',
                tone: 'ok',
              },
              {
                label: 'Açık alacak',
                value: money(summary.outstanding),
                icon: 'alert',
                tone: summary.outstanding > 0 ? 'warn' : undefined,
              },
              { label: 'Borçlu öğrenci', value: summary.debtorCount, icon: 'users' },
            ]}
          />
        )
      )}

      <div className="two-col">
        <Card title="Tahsilat oranı" icon="pie">
          {loading ? (
            <Skeleton lines={4} />
          ) : summary ? (
            <div className="row" style={{ gap: 20, alignItems: 'center', marginBottom: 0 }}>
              <Donut value={collectRate} />
              <div>
                <div className="muted">Tahsilat / Tahakkuk</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {money(summary.collected)} / {money(summary.accrued)}
                </div>
                <div className="muted">
                  {summary.paidCount} ödenmiş · {summary.partialCount} kısmi ·{' '}
                  {summary.scholarshipCount} burslu
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon="pie" title="Tahsilat verisi yok" />
          )}
        </Card>

        <Card title="Mutabakat özeti" icon="activity">
          {loading ? (
            <Skeleton lines={4} />
          ) : recon ? (
            <StatGrid
              stats={[
                { label: 'Toplam kayıt', value: recon.summary.total, icon: 'layers' },
                {
                  label: 'Eşleşen',
                  value: recon.summary.matched,
                  icon: 'checkCircle',
                  tone: 'ok',
                },
                {
                  label: 'Eşleşmeyen',
                  value: recon.summary.unmatched,
                  icon: 'alert',
                  tone: recon.summary.unmatched > 0 ? 'warn' : undefined,
                },
              ]}
            />
          ) : (
            <EmptyState icon="activity" title="Mutabakat verisi yok" />
          )}
        </Card>
      </div>

      <Card title="En yüksek borçlu öğrenciler" icon="users">
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable<FinanceSummary['topDebtors'][number]>
            rows={summary?.topDebtors ?? []}
            search
            csv
            csvName="oidb-harc-borclular"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Açık borç bulunmuyor"
                sub="Tüm faturalar tahsil edilmiş görünüyor."
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
              { key: 'fullName', header: 'Öğrenci', sortable: true, value: (r) => r.fullName },
              {
                key: 'programName',
                header: 'Program',
                sortable: true,
                value: (r) => r.programName,
              },
              {
                key: 'outstanding',
                header: 'Açık borç',
                sortable: true,
                num: true,
                value: (r) => r.outstanding,
                render: (r) => <Badge tone="danger">{money(r.outstanding)}</Badge>,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Banka mutabakatı"
        icon="activity"
        hint={recon ? `${recon.summary.unmatched} eşleşmeyen` : undefined}
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<ReconItem>
            rows={recon?.items ?? []}
            search
            csv
            csvName="oidb-harc-mutabakat"
            empty={
              <EmptyState
                icon="activity"
                title="Mutabakat kaydı yok"
                sub="Banka mutabakat dosyası içe aktarıldığında burada listelenir."
              />
            }
            columns={[
              {
                key: 'bankRef',
                header: 'Banka referansı',
                sortable: true,
                value: (r) => r.bankRef,
                render: (r) => <b>{r.bankRef}</b>,
              },
              {
                key: 'amount',
                header: 'Tutar',
                sortable: true,
                num: true,
                value: (r) => r.amount,
                render: (r) => money(r.amount),
              },
              {
                key: 'matched',
                header: 'Durum',
                sortable: true,
                value: (r) => (r.matchedPaymentId ? 'Eşleşti' : 'Eşleşmedi'),
                render: (r) =>
                  r.matchedPaymentId ? (
                    <Badge tone="ok">Eşleşti</Badge>
                  ) : (
                    <Badge tone="warn">Eşleşmedi</Badge>
                  ),
              },
              {
                key: 'student',
                header: 'Öğrenci',
                value: (r) =>
                  r.matchedStudentNo ? `${r.matchedStudentNo} ${r.matchedStudentName ?? ''}` : '—',
                render: (r) =>
                  r.matchedStudentNo ? (
                    <span>
                      <b>{r.matchedStudentNo}</b>
                      {r.matchedStudentName ? ` · ${r.matchedStudentName}` : ''}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'importedAt',
                header: 'İçe aktarma',
                sortable: true,
                value: (r) => r.importedAt,
                render: (r) => fmtDate(r.importedAt),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={open} onClose={closeDrawer} title="Öğrenci borç sorgu">
        {drawerErr && <Alert tone="err">{drawerErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Öğrenci</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={searching}>
              {searching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {picked ? (
          <div className="info-box" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
                <span className="muted"> · {picked.programName}</span>
              </span>
              <Button
                variant="ghost"
                sm
                icon="refresh"
                onClick={() => {
                  setPicked(null);
                  setStatement(null);
                  setDebt(null);
                }}
              >
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          hits.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <b>{h.studentNo}</b>
                    </td>
                    <td>{h.fullName}</td>
                    <td className="muted">{h.programName}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" sm icon="check" onClick={() => void pick(h)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {picked && (
          <>
            <h2>2 · Mali ekstre</h2>
            {loadingStu ? (
              <Skeleton lines={6} />
            ) : statement ? (
              <>
                <StatGrid
                  stats={[
                    { label: 'Tahakkuk', value: money(statement.totals.accrued), icon: 'file' },
                    {
                      label: 'Ödenen',
                      value: money(statement.totals.paid),
                      icon: 'checkCircle',
                      tone: 'ok',
                    },
                    {
                      label: 'Kalan borç',
                      value: money(debt?.outstanding ?? statement.totals.outstanding),
                      icon: 'alert',
                      tone:
                        (debt?.outstanding ?? statement.totals.outstanding) > 0 ? 'warn' : undefined,
                    },
                  ]}
                />
                <div style={{ marginTop: 16 }}>
                  <DataTable<Statement['invoices'][number]>
                    rows={statement.invoices}
                    search={false}
                    csv
                    csvName={`ekstre-${picked.studentNo}`}
                    empty={<EmptyState icon="file" title="Fatura kaydı yok" />}
                    columns={[
                      {
                        key: 'termName',
                        header: 'Dönem',
                        sortable: true,
                        value: (r) => r.termName,
                        render: (r) => <b>{r.termName}</b>,
                      },
                      {
                        key: 'net',
                        header: 'Net',
                        sortable: true,
                        num: true,
                        value: (r) => r.net,
                        render: (r) => money(r.net),
                      },
                      {
                        key: 'paidAmount',
                        header: 'Ödenen',
                        sortable: true,
                        num: true,
                        value: (r) => r.paidAmount,
                        render: (r) => money(r.paidAmount),
                      },
                      {
                        key: 'outstanding',
                        header: 'Kalan',
                        sortable: true,
                        num: true,
                        value: (r) => r.outstanding,
                        render: (r) =>
                          r.outstanding > 0 ? (
                            <Badge tone="danger">{money(r.outstanding)}</Badge>
                          ) : (
                            money(r.outstanding)
                          ),
                      },
                      {
                        key: 'status',
                        header: 'Durum',
                        sortable: true,
                        value: (r) => INV_STATUS_TR[r.status] ?? r.status,
                        render: (r) => (
                          <Badge tone={INV_STATUS_TONE[r.status] ?? 'muted'}>
                            {INV_STATUS_TR[r.status] ?? r.status}
                          </Badge>
                        ),
                      },
                    ]}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </Drawer>
    </>
  );
}
