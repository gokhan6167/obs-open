'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Meter, Skeleton, SkeletonStats, toast, money, fmtDate,
} from '@/app/ui';

interface Plan {
  id: string;
  year: number;
  term: string | null;
  totalAmount: number;
  installmentCount: number;
  status: string;
  createdAt: string;
  paidCount: number;
  paidAmount: number;
  outstanding: number;
}
interface Installment {
  id: string;
  seq: number;
  dueOn: string | null;
  amount: number;
  paidAmount: number;
  paidOn: string | null;
  method: string | null;
  status: string;
}
interface Refund {
  id: string;
  amount: number;
  iban: string | null;
  accountHolder: string | null;
  bank: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

/** Taksit durumu (gecikme sunucuda tutulmaz; vade + ödenen tutardan türetilir). */
type InstState = 'odendi' | 'kismi' | 'gecikmis' | 'bekliyor';

const INST_TR: Record<InstState, string> = {
  odendi: 'Ödendi',
  kismi: 'Kısmi ödendi',
  gecikmis: 'Gecikmiş',
  bekliyor: 'Bekliyor',
};
const INST_BADGE: Record<InstState, 'ok' | 'warn' | 'danger' | 'muted'> = {
  odendi: 'ok',
  kismi: 'warn',
  gecikmis: 'danger',
  bekliyor: 'muted',
};

const REFUND_TR: Record<string, string> = {
  talep: 'Talep alındı',
  onaylandi: 'Onaylandı',
  odendi: 'Ödendi',
  reddedildi: 'Reddedildi',
};
const REFUND_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  talep: 'warn',
  onaylandi: 'info',
  odendi: 'ok',
  reddedildi: 'danger',
};

const PLAN_TR: Record<string, string> = {
  aktif: 'Aktif',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};

/** Yerel saate göre bugünün ISO tarihi (dueOn ile string karşılaştırması için). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function instState(i: Installment, today: string): InstState {
  if (i.paidAmount >= i.amount) return 'odendi';
  if (i.dueOn && i.dueOn < today) return 'gecikmis';
  if (i.paidAmount > 0) return 'kismi';
  return 'bekliyor';
}

/** IBAN'ı 4'erli gruplayarak okunur biçimde göster. */
function ibanFmt(iban: string | null): string {
  if (!iban) return '—';
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** TL girdisini kuruşa çevir ("1.250,50" veya "1250.5" kabul). */
function toKurus(input: string): number {
  const norm = input.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  if (!isFinite(n) || n <= 0) return NaN;
  return Math.round(n * 100);
}

const planTitle = (p: Plan): string => `${p.year}${p.term ? ` · ${p.term}` : ''}`;

export default function OdemePlanim(): React.ReactElement {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [insts, setInsts] = useState<Record<string, Installment[]>>({});
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [bank, setBank] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRefunds = useCallback(async () => {
    const r = await api<{ items: Refund[] }>('/billing/refunds/my');
    setRefunds(r.items ?? []);
  }, []);

  const loadPlans = useCallback(async () => {
    const p = await api<{ items: Plan[] }>('/billing/plans/my');
    const rows = p.items ?? [];
    setPlans(rows);
    const pairs = await Promise.all(
      rows.map(async (pl) => {
        const d = await api<{ items: Installment[] }>(`/billing/plans/${pl.id}/installments`);
        return [pl.id, d.items ?? []] as const;
      }),
    );
    setInsts(Object.fromEntries(pairs));
  }, []);

  useEffect(() => {
    Promise.all([loadPlans(), loadRefunds()])
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadPlans, loadRefunds]);

  const today = todayIso();

  const totals = useMemo(() => {
    const total = plans.reduce((s, p) => s + p.totalAmount, 0);
    const paid = plans.reduce((s, p) => s + p.paidAmount, 0);
    const outstanding = plans.reduce((s, p) => s + p.outstanding, 0);
    const overdue = Object.values(insts)
      .flat()
      .filter((i) => instState(i, today) === 'gecikmis').length;
    return { total, paid, outstanding, overdue, pct: total > 0 ? (paid / total) * 100 : 0 };
  }, [plans, insts, today]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const kurus = toKurus(amount);
    const ibanClean = iban.replace(/\s+/g, '').toUpperCase();
    if (isNaN(kurus)) {
      setFormErr('Geçerli bir iade tutarı giriniz.');
      return;
    }
    if (ibanClean.length < 10 || ibanClean.length > 34) {
      setFormErr('Geçerli bir IBAN giriniz.');
      return;
    }
    if (!accountHolder.trim() || !bank.trim()) {
      setFormErr('Hesap sahibi ve banka bilgisi zorunludur.');
      return;
    }
    setBusy(true);
    setFormErr('');
    try {
      await api('/billing/refunds', {
        method: 'POST',
        body: {
          amount: kurus,
          iban: ibanClean,
          accountHolder: accountHolder.trim(),
          bank: bank.trim(),
          reason: reason.trim() || undefined,
        },
      });
      setAmount('');
      setIban('');
      setAccountHolder('');
      setBank('');
      setReason('');
      await loadRefunds();
      toast('İade talebi alındı', {
        tone: 'ok',
        body: 'Talebiniz mali işlerin değerlendirmesine gönderildi.',
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Talep oluşturulamadı';
      setFormErr(m);
      toast('Talep oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Ödeme Planım"
        sub="Taksitlerinizi, ödeme ilerlemenizi ve iade taleplerinizi buradan takip edebilirsiniz."
      />

      {loading ? (
        <>
          <SkeletonStats n={4} />
          <Skeleton lines={6} />
        </>
      ) : err ? (
        <Alert tone="err">{err}</Alert>
      ) : (
        <>
          {plans.length > 0 && (
            <StatGrid
              stats={[
                { label: 'Toplam tutar', value: money(totals.total), icon: 'wallet' },
                { label: 'Ödenen', value: money(totals.paid), icon: 'checkCircle', tone: 'ok' },
                {
                  label: 'Kalan tutar',
                  value: money(totals.outstanding),
                  icon: 'money',
                  tone: totals.outstanding > 0 ? 'warn' : undefined,
                },
                {
                  label: 'Geciken taksit',
                  value: totals.overdue,
                  icon: 'alert',
                  tone: totals.overdue > 0 ? 'danger' : undefined,
                },
              ]}
            />
          )}

          {totals.overdue > 0 && (
            <Alert tone="warn">
              Vadesi geçmiş {totals.overdue} taksitiniz bulunuyor. Gecikmeler kayıt yenileme
              işlemlerinizi engelleyebilir; lütfen en kısa sürede ödeme yapınız.
            </Alert>
          )}

          {plans.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="Tanımlı ödeme planınız yok"
              sub="Adınıza henüz bir ödeme planı oluşturulmamış. Soru ve talepleriniz için mali işler birimine başvurabilirsiniz."
            />
          ) : (
            plans.map((p) => {
              const rows = insts[p.id] ?? [];
              const pct = p.totalAmount > 0 ? (p.paidAmount / p.totalAmount) * 100 : 0;
              return (
                <Card
                  key={p.id}
                  icon="wallet"
                  title={`${planTitle(p)} Ödeme Planı`}
                  hint={`${p.installmentCount} taksit · Toplam ${money(p.totalAmount)} · Ödenen ${money(p.paidAmount)} · Kalan ${money(p.outstanding)}`}
                  actions={<Badge tone={p.status === 'tamamlandi' ? 'ok' : 'info'}>{PLAN_TR[p.status] ?? p.status}</Badge>}
                >
                  <div style={{ marginBottom: 14 }}>
                    <Meter
                      value={pct}
                      label={`%${pct.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ödendi`}
                    />
                  </div>

                  {rows.length === 0 ? (
                    <EmptyState
                      icon="inbox"
                      title="Taksit bulunmuyor"
                      sub="Bu plana ait taksit kaydı görünmüyor."
                    />
                  ) : (
                    <DataTable
                      rows={rows}
                      search={false}
                      csv
                      csvName={`taksitler-${p.year}${p.term ? `-${p.term}` : ''}`}
                      empty="Taksit bulunamadı."
                      columns={[
                        { key: 'seq', header: 'Sıra', num: true, value: (r) => r.seq },
                        {
                          key: 'dueOn', header: 'Vade',
                          value: (r) => r.dueOn ?? '',
                          render: (r) => fmtDate(r.dueOn),
                        },
                        {
                          key: 'amount', header: 'Tutar', num: true,
                          value: (r) => r.amount,
                          render: (r) => <b>{money(r.amount)}</b>,
                        },
                        {
                          key: 'paidAmount', header: 'Ödenen', num: true,
                          value: (r) => r.paidAmount,
                          render: (r) => money(r.paidAmount),
                        },
                        {
                          key: 'paidOn', header: 'Ödeme tarihi',
                          value: (r) => r.paidOn ?? '',
                          render: (r) => <span className="muted">{fmtDate(r.paidOn)}</span>,
                        },
                        {
                          key: 'status', header: 'Durum',
                          value: (r) => INST_TR[instState(r, today)],
                          render: (r) => {
                            const s = instState(r, today);
                            return <Badge tone={INST_BADGE[s]}>{INST_TR[s]}</Badge>;
                          },
                        },
                      ]}
                    />
                  )}
                </Card>
              );
            })
          )}

          <Card icon="edit" title="Yeni İade Talebi">
            {formErr && <Alert tone="err">{formErr}</Alert>}
            <form onSubmit={submit}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '2 1 320px', marginBottom: 0 }}>
                  <label>IBAN</label>
                  <input
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                    autoComplete="off"
                  />
                </div>
                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label>Hesap sahibi</label>
                  <input
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Ad Soyad"
                  />
                </div>
              </div>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label>Banka</label>
                  <input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="Banka adı"
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>İade tutarı (₺)</label>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
                <div className="field" style={{ flex: '2 1 260px', marginBottom: 0 }}>
                  <label>İade sebebi (isteğe bağlı)</label>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Fazla ödeme, mükerrer tahsilat vb."
                  />
                </div>
                <Button type="submit" icon="arrowRight" disabled={busy}>
                  {busy ? 'Gönderiliyor…' : 'Talep Oluştur'}
                </Button>
              </div>
            </form>
          </Card>

          <Card icon="fileText" title="İade Taleplerim">
            {refunds.length === 0 ? (
              <EmptyState
                icon="wallet"
                title="Henüz iade talebi yok"
                sub="Fazla veya yersiz ödemeleriniz için yukarıdaki formdan iade talebi oluşturabilirsiniz."
              />
            ) : (
              <DataTable
                rows={refunds}
                csv
                csvName="iade-taleplerim"
                empty="Kayıt bulunamadı."
                columns={[
                  {
                    key: 'createdAt', header: 'Tarih',
                    value: (r) => r.createdAt,
                    render: (r) => fmtDate(r.createdAt),
                  },
                  {
                    key: 'amount', header: 'Tutar', num: true,
                    value: (r) => r.amount,
                    render: (r) => <b>{money(r.amount)}</b>,
                  },
                  {
                    key: 'iban', header: 'IBAN',
                    value: (r) => r.iban ?? '',
                    render: (r) => (
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{ibanFmt(r.iban)}</span>
                    ),
                  },
                  {
                    key: 'bank', header: 'Banka',
                    value: (r) => r.bank ?? '',
                    render: (r) => <span className="muted">{r.bank || '—'}</span>,
                  },
                  {
                    key: 'status', header: 'Durum',
                    value: (r) => REFUND_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={REFUND_BADGE[r.status] ?? 'muted'}>
                        {REFUND_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'paidAt', header: 'Ödeme',
                    value: (r) => r.paidAt ?? '',
                    render: (r) => <span className="muted">{fmtDate(r.paidAt)}</span>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
