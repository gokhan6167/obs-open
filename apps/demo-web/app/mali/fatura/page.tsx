'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Button,
  EmptyState,
  Alert,
  toast,
  money,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}
interface StudentsResp {
  items: StudentRow[];
  total: number;
}
interface ActiveTerm {
  id: string;
  year: number;
  term: string;
  name: string;
}
interface InvoiceRow {
  id: string;
  termName: string;
  year: number;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}
interface Quote {
  gross: number;
  scholarshipRate: number;
  afterScholarship: number;
  net: number;
  installments: { no: number; amount: number }[];
}
interface InvoiceResult {
  invoiceId: string;
  amount: number;
}

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

export default function Fatura(): React.ReactElement {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [term, setTerm] = useState<ActiveTerm | null>(null);
  const [selected, setSelected] = useState<StudentRow | null>(null);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invBusy, setInvBusy] = useState(false);

  const [year, setYear] = useState('');
  const [installments, setInstallments] = useState('1');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState('');

  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);
  const [payAmountTl, setPayAmountTl] = useState('');

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [stu, t] = await Promise.all([
        api<StudentsResp>('/portal/students'),
        api<ActiveTerm | null>('/calendar/active-term'),
      ]);
      setStudents(stu.items);
      setTerm(t);
      if (t) setYear(String(t.year));
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Veri alınamadı'));
  }, []);

  const outstanding = useMemo(
    () => invoices.reduce((a, i) => a + i.outstanding, 0),
    [invoices],
  );

  async function loadInvoices(sid: string): Promise<void> {
    setInvBusy(true);
    try {
      const rows = await api<InvoiceRow[]>(`/finance/students/${sid}/invoices`);
      setInvoices(rows);
    } catch {
      setInvoices([]);
    } finally {
      setInvBusy(false);
    }
  }

  async function selectStudent(s: StudentRow): Promise<void> {
    setSelected(s);
    setQuote(null);
    setQuoteErr('');
    setPayInvoice(null);
    setPayAmountTl('');
    setErr('');
    await loadInvoices(s.id);
  }

  async function getQuote(): Promise<void> {
    if (!selected) return;
    setQuoteErr('');
    setQuote(null);
    const yr = parseInt(year, 10);
    const inst = parseInt(installments, 10);
    if (!Number.isInteger(yr)) {
      setQuoteErr('Geçerli bir yıl girin.');
      return;
    }
    setQuoteBusy(true);
    try {
      const qres = await api<Quote>(
        `/finance/students/${selected.id}/quote?year=${yr}&installments=${
          Number.isInteger(inst) && inst >= 1 ? inst : 1
        }`,
      );
      setQuote(qres);
    } catch (e) {
      setQuoteErr(e instanceof Error ? e.message : 'Tahakkuk önizlemesi alınamadı');
    } finally {
      setQuoteBusy(false);
    }
  }

  async function createInvoice(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr('');
    if (!selected) {
      setErr('Önce bir öğrenci seçin.');
      return;
    }
    if (!term) {
      setErr('Aktif dönem bulunamadı; fatura kesilemez.');
      return;
    }
    const yr = parseInt(year, 10);
    if (!Number.isInteger(yr)) {
      setErr('Geçerli bir yıl girin.');
      return;
    }
    setBusy(true);
    try {
      const res = await api<InvoiceResult>('/finance/invoices', {
        method: 'POST',
        body: { studentId: selected.id, termId: term.id, year: yr },
      });
      toast('Fatura oluşturuldu', {
        tone: 'ok',
        body: `Net ${money(res.amount)} tahakkuk ettirildi. Aşağıdan tahsilat alabilirsiniz.`,
      });
      setQuote(null);
      await loadInvoices(selected.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Fatura oluşturulamadı';
      setErr(m);
      toast('Fatura oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function pickForPayment(inv: InvoiceRow): void {
    setPayInvoice(inv);
    setPayAmountTl((inv.outstanding / 100).toFixed(2));
    setErr('');
  }

  async function pay(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr('');
    if (!payInvoice) {
      setErr('Tahsil edilecek faturayı seçin.');
      return;
    }
    const kurus = Math.round(parseFloat(payAmountTl.replace(',', '.')) * 100);
    if (!Number.isFinite(kurus) || kurus <= 0) {
      setErr('Geçerli bir tutar girin.');
      return;
    }
    if (kurus > payInvoice.outstanding) {
      setErr(`Tutar kalan borcu aşamaz (kalan ${money(payInvoice.outstanding)}).`);
      return;
    }
    setPayBusy(true);
    try {
      await api(`/finance/invoices/${payInvoice.id}/pay`, {
        method: 'POST',
        body: { amount: kurus, idempotencyKey: crypto.randomUUID() },
      });
      toast('Tahsilat alındı', {
        tone: 'ok',
        body: `${money(kurus)} tahsil edildi (vPOS · idempotent).`,
      });
      setPayInvoice(null);
      setPayAmountTl('');
      if (selected) await loadInvoices(selected.id);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Tahsilat başarısız';
      setErr(m);
      toast('Tahsilat başarısız', { tone: 'err', body: m });
    } finally {
      setPayBusy(false);
    }
  }

  const studentColumns = [
    { key: 'studentNo', header: 'No', sortable: true, value: (s: StudentRow) => s.studentNo },
    { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (s: StudentRow) => s.fullName },
    { key: 'programName', header: 'Program', sortable: true, value: (s: StudentRow) => s.programName },
    {
      key: 'act',
      header: '',
      render: (s: StudentRow) => (
        <Button
          variant={selected?.id === s.id ? 'primary' : 'ghost'}
          sm
          icon="check"
          onClick={() => selectStudent(s)}
        >
          Seç
        </Button>
      ),
    },
  ];

  const invoiceColumns = [
    {
      key: 'termName',
      header: 'Dönem',
      sortable: true,
      value: (i: InvoiceRow) => i.termName,
      render: (i: InvoiceRow) => (
        <>
          {i.termName} <span className="muted">({i.year})</span>
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Net',
      num: true,
      sortable: true,
      value: (i: InvoiceRow) => i.amount,
      render: (i: InvoiceRow) => money(i.amount),
    },
    {
      key: 'paidAmount',
      header: 'Ödenen',
      num: true,
      sortable: true,
      value: (i: InvoiceRow) => i.paidAmount,
      render: (i: InvoiceRow) => <span style={{ color: 'var(--ok)' }}>{money(i.paidAmount)}</span>,
    },
    {
      key: 'outstanding',
      header: 'Kalan',
      num: true,
      sortable: true,
      value: (i: InvoiceRow) => i.outstanding,
      render: (i: InvoiceRow) => (
        <span style={{ color: i.outstanding > 0 ? 'var(--danger)' : 'var(--ok)' }}>
          {money(i.outstanding)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      value: (i: InvoiceRow) => i.status,
      render: (i: InvoiceRow) => {
        const b = statusTone(i.status);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: 'act',
      header: '',
      render: (i: InvoiceRow) => (
        <Button
          variant="ok"
          sm
          icon="wallet"
          disabled={i.outstanding <= 0}
          onClick={() => pickForPayment(i)}
        >
          Tahsil et
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Fatura / Tahakkuk"
        sub="Öğrenciye dönem faturası tahakkuk ettirin (ücret tarifesi + burs → net; taksit önizlemeli) ve açık faturaları sanal POS üzerinden tahsil edin."
      />

      {err && <Alert tone="err">{err}</Alert>}

      <Card title="Aktif Dönem" icon="calendar">
        {term ? (
          <Alert tone="info">
            <strong>{term.name}</strong> ({term.year}/{term.term}). Fatura bu döneme kesilir.
          </Alert>
        ) : (
          <Alert tone="err">
            Aktif akademik dönem bulunamadı. Takvim tanımlanmadan fatura kesilemez.
          </Alert>
        )}
      </Card>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', display: 'flex' }}>
          <Card title="1 · Öğrenci Seç" icon="users">
            {students.length === 0 ? (
              <EmptyState icon="users" title="Öğrenci bulunamadı" sub="Kayıtlı öğrenci listesi boş." />
            ) : (
              <DataTable rows={students} columns={studentColumns} csv csvName="ogrenciler" pageSize={10} />
            )}
          </Card>
        </div>

        <div style={{ flex: '1.2 1 380px', display: 'flex' }}>
          <Card title="2 · Tahakkuk Önizleme & Fatura" icon="file">
            {!selected ? (
              <EmptyState icon="user" title="Öğrenci seçilmedi" sub="Soldan bir öğrenci seçerek tahakkuka başlayın." />
            ) : (
              <>
                <div className="list-item">
                  <div>
                    <strong>{selected.fullName}</strong>
                    <div className="meta">
                      {selected.studentNo} · {selected.programName}
                    </div>
                  </div>
                  <Badge tone={outstanding > 0 ? 'danger' : 'ok'}>Kalan {money(outstanding)}</Badge>
                </div>

                <form onSubmit={createInvoice}>
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                      <label>Tarife Yılı</label>
                      <input
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        inputMode="numeric"
                        placeholder="2026"
                        required
                      />
                    </div>
                    <div className="field" style={{ flex: '1 1 100px', marginBottom: 0 }}>
                      <label>Taksit</label>
                      <input
                        value={installments}
                        onChange={(e) => setInstallments(e.target.value)}
                        inputMode="numeric"
                        placeholder="1"
                      />
                    </div>
                    <Button variant="ghost" type="button" icon="chart" onClick={getQuote} disabled={quoteBusy}>
                      {quoteBusy ? 'Hesaplanıyor…' : 'Önizle'}
                    </Button>
                  </div>

                  {quoteErr && <Alert tone="err">{quoteErr}</Alert>}

                  {quote && (
                    <div className="info-box" style={{ marginTop: 12 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span>Brüt ücret</span>
                        <strong>{money(quote.gross)}</strong>
                      </div>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span>Burs indirimi (%{(quote.scholarshipRate * 100).toFixed(0)})</span>
                        <strong style={{ color: 'var(--ok)' }}>
                          −{money(quote.gross - quote.afterScholarship)}
                        </strong>
                      </div>
                      <div
                        className="row"
                        style={{
                          justifyContent: 'space-between',
                          borderTop: '1px solid var(--line)',
                          paddingTop: 6,
                          marginTop: 6,
                        }}
                      >
                        <span>
                          <strong>Net tahakkuk</strong>
                        </span>
                        <strong style={{ fontSize: 16 }}>{money(quote.net)}</strong>
                      </div>
                      {quote.installments.length > 1 && (
                        <table style={{ marginTop: 8 }}>
                          <thead>
                            <tr>
                              <th>Taksit</th>
                              <th style={{ textAlign: 'right' }}>Tutar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quote.installments.map((t) => (
                              <tr key={t.no}>
                                <td>{t.no}. taksit</td>
                                <td style={{ textAlign: 'right' }}>{money(t.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <Button variant="ok" type="submit" icon="fileText" disabled={busy || !term}>
                      {busy ? 'Kesiliyor…' : 'Fatura Kes'}
                    </Button>
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Önizleme yazma yapmaz; “Fatura Kes” döneme tek net fatura tahakkuk ettirir.
                  </p>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>

      <Card title="3 · Açık Faturalar & Tahsilat" icon="wallet">
        {!selected ? (
          <EmptyState icon="wallet" title="Öğrenci seçilmedi" sub="Fatura ve tahsilat için önce bir öğrenci seçin." />
        ) : invBusy ? (
          <p className="muted">Faturalar yükleniyor…</p>
        ) : invoices.length === 0 ? (
          <EmptyState icon="checkCircle" title="Fatura yok" sub="Bu öğrenciye ait fatura bulunmuyor." />
        ) : (
          <DataTable
            rows={invoices}
            columns={invoiceColumns}
            csv
            csvName={`faturalar-${selected.studentNo}`}
            search={false}
            pageSize={20}
          />
        )}

        {payInvoice && (
          <form onSubmit={pay} style={{ marginTop: 12 }}>
            <div className="info-box" style={{ marginBottom: 10 }}>
              Seçili fatura: <strong>{payInvoice.termName}</strong> — kalan{' '}
              <strong style={{ color: 'var(--danger)' }}>{money(payInvoice.outstanding)}</strong>
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                <label>Tahsilat Tutarı (₺)</label>
                <input
                  value={payAmountTl}
                  onChange={(e) => setPayAmountTl(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  required
                />
              </div>
              <Button variant="ok" type="submit" icon="wallet" disabled={payBusy}>
                {payBusy ? 'İşleniyor…' : 'Tahsil Et'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setPayInvoice(null)}>
                Vazgeç
              </Button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Ödeme sanal POS üzerinden alınır; her işlem idempotent anahtarla tek sefer işlenir.
            </p>
          </form>
        )}
      </Card>
    </>
  );
}
