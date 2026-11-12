'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Alert,
  Drawer,
  Icon,
  money,
  fmtDate,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface StudentsResp {
  items: StudentRow[];
  total: number;
}
interface PaymentRow {
  id: string;
  invoiceId: string;
  amount: number;
  provider: string;
  providerRef: string | null;
  createdAt: string;
}
interface InvoiceLine {
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
}
interface Statement {
  invoices: InvoiceLine[];
  scholarships: {
    type: string;
    rateBps: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  totals: { accrued: number; paid: number; outstanding: number };
}

const dt = (iso: string): string =>
  new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function statusTone(status: string): { tone: 'ok' | 'warn' | 'danger' | 'muted'; label: string } {
  switch (status) {
    case 'paid':
      return { tone: 'ok', label: 'ödendi' };
    case 'partial':
      return { tone: 'warn', label: 'kısmi' };
    case 'unpaid':
      return { tone: 'danger', label: 'ödenmemiş' };
    default:
      return { tone: 'muted', label: status };
  }
}

export default function BorcArama(): React.ReactElement {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [stmtBusy, setStmtBusy] = useState(false);
  const [openInv, setOpenInv] = useState<InvoiceLine | null>(null);
  const [err, setErr] = useState('');
  const [stmtErr, setStmtErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<StudentsResp>('/portal/students')
      .then((r) => {
        setStudents(r.items);
        // Özet sayfasından ?id= ile gelindiyse ilgili öğrenciyi otomatik aç.
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('id');
        if (pid) {
          const found = r.items.find((s) => s.id === pid);
          if (found) void pick(found);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Öğrenciler alınamadı'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(s: StudentRow): Promise<void> {
    setSelected(s);
    setStmt(null);
    setStmtErr('');
    setOpenInv(null);
    setStmtBusy(true);
    try {
      const d = await api<Statement>(`/finance/students/${s.id}/statement`);
      setStmt(d);
    } catch (e) {
      setStmtErr(e instanceof Error ? e.message : 'Mali ekstre alınamadı');
    } finally {
      setStmtBusy(false);
    }
  }

  const outstanding = stmt?.totals.outstanding ?? null;
  const activeSch = stmt?.scholarships.find((s) => s.effectiveTo === null) ?? null;

  const studentColumns = [
    { key: 'studentNo', header: 'No', sortable: true, value: (s: StudentRow) => s.studentNo },
    { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (s: StudentRow) => s.fullName },
    { key: 'programName', header: 'Program', sortable: true, value: (s: StudentRow) => s.programName },
    {
      key: 'status',
      header: 'Durum',
      value: (s: StudentRow) => s.status,
      render: (s: StudentRow) => (
        <Badge tone={s.status === 'aktif' ? 'ok' : 'muted'}>{s.status}</Badge>
      ),
    },
    {
      key: 'act',
      header: '',
      render: (s: StudentRow) => (
        <Button
          variant={selected?.id === s.id ? 'primary' : 'ghost'}
          sm
          icon="fileText"
          onClick={() => pick(s)}
          disabled={selected?.id === s.id && stmtBusy}
        >
          Ekstre
        </Button>
      ),
    },
  ];

  const invoiceColumns = [
    { key: 'termName', header: 'Dönem', sortable: true, value: (i: InvoiceLine) => i.termName },
    {
      key: 'net',
      header: 'Net',
      num: true,
      sortable: true,
      value: (i: InvoiceLine) => i.net,
      render: (i: InvoiceLine) => money(i.net),
    },
    {
      key: 'paidAmount',
      header: 'Ödenen',
      num: true,
      sortable: true,
      value: (i: InvoiceLine) => i.paidAmount,
      render: (i: InvoiceLine) => <span style={{ color: 'var(--ok)' }}>{money(i.paidAmount)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Kalan',
      num: true,
      sortable: true,
      value: (i: InvoiceLine) => i.outstanding,
      render: (i: InvoiceLine) => (
        <span style={{ color: i.outstanding > 0 ? 'var(--danger)' : 'var(--ok)' }}>
          {money(i.outstanding)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      value: (i: InvoiceLine) => i.status,
      render: (i: InvoiceLine) => {
        const b = statusTone(i.status);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: 'act',
      header: '',
      render: (i: InvoiceLine) => (
        <Button variant="subtle" sm icon="eye" onClick={() => setOpenInv(i)}>
          Dekont ({i.payments.length})
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Öğrenci Borç Arama"
        sub="Öğrenci seçin; tam mali ekstresini (fatura kalemleri, ödeme dekontları, burs geçmişi ve toplamlar) görüntüleyin. Borçlu öğrenci kayıt/mezuniyet mali engeli taşır."
      />

      {err && <Alert tone="err">{err}</Alert>}

      <Card title="Öğrenci Ara" icon="search" hint="Ekstresini görmek istediğiniz öğrenciyi arayın veya listeden seçin.">
        {loading ? (
          <Skeleton lines={6} />
        ) : students.length === 0 ? (
          <EmptyState icon="users" title="Öğrenci bulunamadı" sub="Kayıtlı öğrenci listesi boş." />
        ) : (
          <DataTable rows={students} columns={studentColumns} csv csvName="ogrenciler" pageSize={12} />
        )}
      </Card>

      <Card title="Mali Ekstre" icon="fileText">
        {!selected ? (
          <EmptyState icon="fileText" title="Öğrenci seçilmedi" sub="Yukarıdaki listeden bir öğrencinin ekstresini açın." />
        ) : (
          <>
            <div className="list-item">
              <div>
                <strong>{selected.fullName}</strong>
                <div className="meta">
                  {selected.studentNo} · {selected.programName} · GNO{' '}
                  {selected.gpa === null ? '—' : selected.gpa.toFixed(2)}
                </div>
              </div>
              {activeSch && (
                <Badge tone="ok">
                  Burs %{(activeSch.rateBps / 100).toFixed(0)} ({activeSch.type})
                </Badge>
              )}
            </div>

            {stmtErr && <Alert tone="err">{stmtErr}</Alert>}

            {stmtBusy ? (
              <Skeleton lines={5} />
            ) : stmt ? (
              <>
                <div style={{ marginTop: 12 }}>
                  <StatGrid
                    stats={[
                      { label: 'Tahakkuk', value: money(stmt.totals.accrued), icon: 'money' },
                      { label: 'Tahsil edilen', value: money(stmt.totals.paid), icon: 'wallet', tone: 'ok' },
                      {
                        label: 'Kalan borç',
                        value: money(stmt.totals.outstanding),
                        icon: 'alert',
                        tone: (outstanding ?? 0) > 0 ? 'danger' : 'ok',
                      },
                    ]}
                  />
                </div>

                {outstanding !== null && outstanding > 0 ? (
                  <Alert tone="err">
                    Açık borç var. Kayıt yenileme ve mezuniyet onayı borç kapanana kadar mali
                    engel taşır. Tahsilat için <a href="/mali/fatura">Fatura / Tahakkuk</a> ekranını kullanın.
                  </Alert>
                ) : (
                  <Alert tone="ok">Açık borç yok. Kayıt/mezuniyet için mali engel bulunmuyor.</Alert>
                )}

                <h2 style={{ marginTop: 18 }}>Fatura Kalemleri</h2>
                {stmt.invoices.length === 0 ? (
                  <EmptyState icon="file" title="Fatura yok" sub="Bu öğrenciye ait fatura kaydı bulunmuyor." />
                ) : (
                  <DataTable
                    rows={stmt.invoices}
                    columns={invoiceColumns}
                    csv
                    csvName={`ekstre-${selected.studentNo}`}
                    search={false}
                    pageSize={20}
                  />
                )}

                {stmt.scholarships.length > 0 && (
                  <>
                    <h2 style={{ marginTop: 18 }}>Burs Zaman Çizelgesi</h2>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                      {stmt.scholarships.map((s, i) => (
                        <li
                          key={i}
                          className="list-item"
                          style={{ borderLeft: '3px solid var(--ok)', paddingLeft: 10 }}
                        >
                          <div>
                            <strong>
                              %{(s.rateBps / 100).toFixed(0)} · {s.type}
                            </strong>
                            <div className="meta">
                              {fmtDate(s.effectiveFrom)} →{' '}
                              {s.effectiveTo ? fmtDate(s.effectiveTo) : 'devam ediyor'}
                            </div>
                          </div>
                          <Badge tone={s.effectiveTo ? 'muted' : 'ok'}>
                            {s.effectiveTo ? 'geçmiş' : 'aktif'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </Card>

      <Drawer
        open={openInv !== null}
        onClose={() => setOpenInv(null)}
        title={openInv ? `Dekontlar · ${openInv.termName}` : undefined}
      >
        {openInv && (
          <>
            <div className="meta" style={{ marginBottom: 10 }}>
              Tahakkuk: {fmtDate(openInv.createdAt)} · Brüt {money(openInv.gross)} · Burs indirimi −
              {money(openInv.scholarshipDeduction)} · Net {money(openInv.net)}
            </div>
            <StatGrid
              stats={[
                { label: 'Net', value: money(openInv.net), icon: 'money' },
                { label: 'Ödenen', value: money(openInv.paidAmount), icon: 'wallet', tone: 'ok' },
                {
                  label: 'Kalan',
                  value: money(openInv.outstanding),
                  icon: 'alert',
                  tone: openInv.outstanding > 0 ? 'danger' : 'ok',
                },
              ]}
            />
            <h2 style={{ marginTop: 14 }}>Ödeme Dekontları</h2>
            {openInv.payments.length === 0 ? (
              <EmptyState icon="wallet" title="Dekont yok" sub="Bu faturaya ait ödeme kaydı bulunmuyor." />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                {openInv.payments.map((p) => (
                  <li
                    key={p.id}
                    className="list-item"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <div>
                      <strong>{money(p.amount)}</strong>
                      <div className="meta">
                        {dt(p.createdAt)} · {p.provider}
                        {p.providerRef ? ` · ref ${p.providerRef}` : ''}
                      </div>
                      <div className="meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="fileText" size={12} /> UUID {p.id}
                      </div>
                    </div>
                    <Badge tone="ok">tahsil</Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
