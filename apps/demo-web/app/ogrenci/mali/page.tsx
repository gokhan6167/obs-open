'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Meter, Drawer, Skeleton, SkeletonStats, toast, money, fmtDate,
} from '@/app/ui';

interface Me {
  student?: { id: string; studentNo: string; program: { name: string } };
}
interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  provider: string;
  providerRef: string | null;
  createdAt: string;
}
interface StatementInvoice {
  id: string;
  termName: string;
  gross: number;
  scholarshipDeduction: number;
  net: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  createdAt: string;
  payments: Payment[];
}
interface Scholarship {
  type: string;
  rateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}
interface Statement {
  invoices: StatementInvoice[];
  scholarships: Scholarship[];
  totals: { accrued: number; paid: number; outstanding: number };
}

const dtFull = (iso: string): string => new Date(iso).toLocaleString('tr-TR');

const STATUS_TR: Record<string, string> = {
  paid: 'Ödendi',
  partial: 'Kısmi ödendi',
  unpaid: 'Ödenmedi',
  cancelled: 'İptal',
  open: 'Açık',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  paid: 'ok',
  partial: 'warn',
  unpaid: 'danger',
  cancelled: 'muted',
  open: 'warn',
};
const SCH_TR: Record<string, string> = {
  merit: 'Başarı bursu',
  need: 'İhtiyaç bursu',
  full: 'Tam burs',
  partial: 'Kısmi burs',
  sport: 'Spor bursu',
};

export default function Mali(): React.ReactElement {
  const [studentId, setStudentId] = useState('');
  const [me, setMe] = useState<Me['student'] | null>(null);
  const [st, setSt] = useState<Statement | null>(null);
  const [selInvoice, setSelInvoice] = useState('');
  const [amountTl, setAmountTl] = useState('');
  const [detail, setDetail] = useState<StatementInvoice | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStatement = useCallback(async (sid: string) => {
    const s = await api<Statement>(`/finance/students/${sid}/statement`);
    setSt(s);
  }, []);

  useEffect(() => {
    (async () => {
      const m = await api<Me>('/portal/me');
      if (m.student?.id) {
        setStudentId(m.student.id);
        setMe(m.student);
        await loadStatement(m.student.id);
      }
    })()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadStatement]);

  // Ödenebilir faturalar (kalan borcu olanlar).
  const payable = useMemo(
    () => (st?.invoices ?? []).filter((i) => i.outstanding > 0 && i.status !== 'cancelled'),
    [st],
  );
  const selected = payable.find((i) => i.id === selInvoice) ?? null;

  // Seçilen fatura değişince kalan tutarı otomatik doldur (kolaylık).
  useEffect(() => {
    if (selected) setAmountTl((selected.outstanding / 100).toFixed(2).replace('.', ','));
  }, [selInvoice]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const kurus = Math.round(parseFloat(amountTl.replace(',', '.')) * 100);
    if (!selInvoice || !Number.isFinite(kurus) || kurus <= 0) {
      setErr('Ödenecek faturayı seçin ve geçerli bir tutar girin.');
      return;
    }
    if (selected && kurus > selected.outstanding) {
      setErr(`Tutar kalan borcu (${money(selected.outstanding)}) aşamaz.`);
      return;
    }
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await api(`/finance/invoices/${selInvoice}/pay`, {
        method: 'POST',
        body: { amount: kurus, idempotencyKey: crypto.randomUUID() },
      });
      setMsg(`${money(kurus)} ödeme alındı (vPOS · idempotent). Makbuz ekstreye işlendi.`);
      setAmountTl('');
      setSelInvoice('');
      toast('Ödeme alındı', { tone: 'ok', body: `${money(kurus)} vPOS üzerinden tahsil edildi.` });
      if (studentId) await loadStatement(studentId);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Ödeme başarısız';
      setErr(m);
      toast('Ödeme başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Mali Durum" sub="Hesap ekstresi ve çevrimiçi ödeme." />
        <SkeletonStats n={4} />
        <Skeleton lines={5} />
      </>
    );
  }
  if (err && !st) return <Alert tone="err">{err}</Alert>;

  const totals = st?.totals ?? { accrued: 0, paid: 0, outstanding: 0 };
  const activeSch = (st?.scholarships ?? []).find(
    (s) => !s.effectiveTo || new Date(s.effectiveTo) >= new Date(),
  );
  const collectRate =
    totals.accrued > 0 ? Math.round((totals.paid / totals.accrued) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Mali Durum"
        sub={me ? `${me.studentNo} · ${me.program.name}` : 'Hesap ekstresi ve çevrimiçi ödeme.'}
      />

      <StatGrid
        stats={[
          { label: 'Tahakkuk (net)', value: money(totals.accrued), icon: 'money' },
          { label: 'Tahsil edilen', value: money(totals.paid), icon: 'checkCircle', tone: 'ok' },
          { label: 'Kalan borç', value: money(totals.outstanding), icon: 'wallet', tone: totals.outstanding > 0 ? 'danger' : 'ok' },
          { label: 'Ödeme oranı', value: '%' + collectRate, icon: 'chart', tone: collectRate >= 100 ? 'ok' : undefined },
        ]}
      />

      <Card className="reveal">
        <Meter value={collectRate} label={`%${collectRate} tahsil edildi`} />
      </Card>

      {totals.outstanding <= 0 && (st?.invoices.length ?? 0) > 0 && (
        <Alert tone="ok">Ödenmemiş borcunuz bulunmuyor. Tüm faturalarınız kapalı.</Alert>
      )}

      {activeSch && (
        <Alert tone="info">
          Aktif burs: <b>{SCH_TR[activeSch.type] ?? activeSch.type}</b> —{' '}
          %{(activeSch.rateBps / 100).toFixed(activeSch.rateBps % 100 === 0 ? 0 : 2)} indirim
          {' '}({fmtDate(activeSch.effectiveFrom)}
          {activeSch.effectiveTo ? ` — ${fmtDate(activeSch.effectiveTo)}` : ' — süresiz'}). Burs indirimi
          fatura tutarlarına yansıtılmıştır.
        </Alert>
      )}

      {payable.length > 0 && (
        <Card
          icon="wallet"
          title="Çevrimiçi Ödeme"
          hint="Ödemek istediğiniz faturayı seçin; kalan tutar otomatik gelir, kısmi ödeme yapabilirsiniz. Ödeme sanal POS üzerinden alınır ve idempotent anahtarla tek sefer işlenir."
          className="reveal"
        >
          {msg && <Alert tone="ok">{msg}</Alert>}
          {err && <Alert tone="err">{err}</Alert>}
          <form onSubmit={pay}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '2 1 300px', marginBottom: 0 }}>
                <label>Fatura</label>
                <select value={selInvoice} onChange={(e) => setSelInvoice(e.target.value)} required>
                  <option value="">Ödenecek faturayı seçin…</option>
                  {payable.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.termName} · kalan {money(i.outstanding)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                <label>Tutar (₺)</label>
                <input
                  value={amountTl}
                  onChange={(e) => setAmountTl(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  required
                />
              </div>
              <Button variant="ok" type="submit" icon="check" disabled={busy || !selInvoice}>
                {busy ? 'İşleniyor…' : 'Öde'}
              </Button>
            </div>
            {selected && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Seçili fatura kalan borcu: <b>{money(selected.outstanding)}</b> · Tam ödeme için
                tutarı olduğu gibi bırakın.
              </p>
            )}
          </form>
        </Card>
      )}

      <Card
        icon="fileText"
        title="Hesap Ekstresi"
        hint="Fatura satırındaki Dekont ile ödeme dökümünü görebilirsiniz."
        className="reveal"
      >
        {(st?.invoices.length ?? 0) === 0 ? (
          <EmptyState icon="fileText" title="Henüz fatura oluşturulmamış" sub="Dönem tahakkuku yapıldığında faturalarınız burada listelenir." />
        ) : (
          <DataTable
            rows={st!.invoices}
            csv
            csvName="hesap-ekstresi"
            empty="Kayıt bulunamadı."
            columns={[
              { key: 'termName', header: 'Dönem', value: (i) => i.termName },
              { key: 'createdAt', header: 'Tarih', value: (i) => i.createdAt, render: (i) => fmtDate(i.createdAt) },
              { key: 'gross', header: 'Brüt', num: true, value: (i) => i.gross, render: (i) => money(i.gross) },
              {
                key: 'scholarship', header: 'Burs', num: true, value: (i) => i.scholarshipDeduction,
                render: (i) => <span className="muted">{i.scholarshipDeduction > 0 ? '−' + money(i.scholarshipDeduction) : '—'}</span>,
              },
              { key: 'net', header: 'Net', num: true, value: (i) => i.net, render: (i) => money(i.net) },
              { key: 'paid', header: 'Ödenen', num: true, value: (i) => i.paidAmount, render: (i) => <span style={{ color: 'var(--ok)' }}>{money(i.paidAmount)}</span> },
              {
                key: 'outstanding', header: 'Kalan', num: true, value: (i) => i.outstanding,
                render: (i) => <span style={{ color: i.outstanding > 0 ? 'var(--danger)' : undefined }}>{money(i.outstanding)}</span>,
              },
              {
                key: 'status', header: 'Durum', value: (i) => STATUS_TR[i.status] ?? i.status,
                render: (i) => <Badge tone={STATUS_BADGE[i.status] ?? 'muted'}>{STATUS_TR[i.status] ?? i.status}</Badge>,
              },
              {
                key: 'detail', header: '', sortable: false,
                render: (i) => <Button variant="ghost" sm icon="eye" onClick={() => setDetail(i)}>Dekont</Button>,
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={detail != null} onClose={() => setDetail(null)} title={detail ? `${detail.termName} · Dekont` : ''}>
        {detail && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Badge tone={STATUS_BADGE[detail.status] ?? 'muted'}>{STATUS_TR[detail.status] ?? detail.status}</Badge>
            </div>
            <div className="list-item"><span className="muted">Brüt</span><b>{money(detail.gross)}</b></div>
            <div className="list-item"><span className="muted">Burs indirimi</span><b>{detail.scholarshipDeduction > 0 ? '−' + money(detail.scholarshipDeduction) : '—'}</b></div>
            <div className="list-item"><span className="muted">Net tutar</span><b>{money(detail.net)}</b></div>
            <div className="list-item"><span className="muted">Ödenen</span><b style={{ color: 'var(--ok)' }}>{money(detail.paidAmount)}</b></div>
            <div className="list-item"><span className="muted">Kalan</span><b style={{ color: detail.outstanding > 0 ? 'var(--danger)' : undefined }}>{money(detail.outstanding)}</b></div>
            <div className="meta" style={{ margin: '14px 0 6px' }}>Ödeme / dekont geçmişi</div>
            {detail.payments.length === 0 ? (
              <span className="muted">Bu faturaya ait ödeme kaydı yok.</span>
            ) : (
              detail.payments.map((p) => (
                <div className="list-item" key={p.id} style={{ display: 'block' }}>
                  <b>{money(p.amount)}</b> · {p.provider}
                  <div className="meta">
                    {dtFull(p.createdAt)}
                    {p.providerRef ? ` · dekont ${p.providerRef}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
