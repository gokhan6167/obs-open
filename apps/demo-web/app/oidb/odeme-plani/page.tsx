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
  EmptyState,
  Drawer,
  ProgressBar,
  toast,
  money,
  fmtDate,
} from '@/app/ui';

interface PlanRow {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  year: number;
  term: string | null;
  totalAmount: number;
  installmentCount: number;
  status: string;
  createdAt: string;
  installmentTotal: number;
  paidCount: number;
  paidAmount: number;
  outstanding: number;
}

interface Installment {
  id: string;
  planId: string;
  seq: number;
  dueOn: string | null;
  amount: number;
  paidAmount: number;
  paidOn: string | null;
  method: string | null;
  status: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

type PayMethod = 'havale' | 'kart' | 'nakit';

const PLAN_STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};
const PLAN_STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  aktif: 'info',
  tamamlandi: 'ok',
  iptal: 'muted',
};

const INST_STATUS_TR: Record<string, string> = {
  bekliyor: 'Bekliyor',
  kismi: 'Kısmi',
  odendi: 'Ödendi',
};
const INST_STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  bekliyor: 'muted',
  kismi: 'warn',
  odendi: 'ok',
};

const METHOD_TR: Record<string, string> = {
  havale: 'Havale/EFT',
  kart: 'Kredi kartı',
  nakit: 'Nakit',
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** "12.500,50" veya "12500.50" -> kuruş (integer). Geçersiz/sıfır ise null. */
function tlToKurus(input: string): number | null {
  const s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  // Virgül varsa ondalık ayracı odur; nokta binlik ayracıdır.
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function OdemePlaniPage(): React.ReactElement {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Yeni plan sürgüsü.
  const [newOpen, setNewOpen] = useState(false);
  const [students, setStudents] = useState<StudentHit[]>([]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [term, setTerm] = useState('');
  const [totalTl, setTotalTl] = useState('');
  const [count, setCount] = useState('4');
  const [firstDueOn, setFirstDueOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Taksit sürgüsü.
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [insts, setInsts] = useState<Installment[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [instErr, setInstErr] = useState('');
  const [payTarget, setPayTarget] = useState<Installment | null>(null);
  const [payTl, setPayTl] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('havale');
  const [paidOn, setPaidOn] = useState(todayIso());
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');

  const loadPlans = useCallback(async () => {
    const res = await api<{ items: PlanRow[] }>('/billing/plans');
    setPlans(res.items ?? []);
  }, []);

  useEffect(() => {
    loadPlans()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Ödeme planları alınamadı'))
      .finally(() => setLoading(false));
  }, [loadPlans]);

  const totals = useMemo(() => {
    const accrued = plans.reduce((a, p) => a + p.totalAmount, 0);
    const paid = plans.reduce((a, p) => a + p.paidAmount, 0);
    return {
      accrued,
      paid,
      outstanding: accrued - paid,
      rate: accrued > 0 ? (paid / accrued) * 100 : 0,
      active: plans.filter((p) => p.status === 'aktif').length,
    };
  }, [plans]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return students.slice(0, 8);
    return students
      .filter(
        (x) =>
          x.studentNo.toLowerCase().includes(s) ||
          x.fullName.toLowerCase().includes(s) ||
          x.programName.toLowerCase().includes(s),
      )
      .slice(0, 8);
  }, [students, q]);

  function openNew(): void {
    setNewOpen(true);
    setFormErr('');
    if (students.length === 0) {
      api<{ items: StudentHit[] }>('/portal/students')
        .then((r) => setStudents(r.items ?? []))
        .catch((e) => setFormErr(e instanceof Error ? e.message : 'Öğrenci listesi alınamadı'));
    }
  }

  function closeNew(): void {
    setNewOpen(false);
    setPicked(null);
    setQ('');
    setTerm('');
    setTotalTl('');
    setCount('4');
    setFormErr('');
  }

  async function submitPlan(): Promise<void> {
    setFormErr('');
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    const kurus = tlToKurus(totalTl);
    if (kurus === null) {
      setFormErr('Toplam tutar geçerli bir TL değeri olmalı.');
      return;
    }
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      setFormErr('Taksit sayısı 1 ile 24 arasında olmalı.');
      return;
    }
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      setFormErr('Yıl 2000 ile 2100 arasında olmalı.');
      return;
    }

    setSaving(true);
    try {
      const res = await api<{ installments: Installment[] }>('/billing/plans', {
        method: 'POST',
        body: {
          studentId: picked.id,
          year: y,
          totalAmount: kurus,
          installmentCount: n,
          ...(term.trim() ? { term: term.trim() } : {}),
          ...(firstDueOn ? { firstDueOn } : {}),
        },
      });
      toast('Ödeme planı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${money(kurus)} · ${res.installments?.length ?? n} taksit üretildi`,
      });
      closeNew();
      await loadPlans();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Plan oluşturulamadı');
    } finally {
      setSaving(false);
    }
  }

  const loadInstallments = useCallback(async (planId: string) => {
    setInstLoading(true);
    setInstErr('');
    try {
      const res = await api<{ items: Installment[] }>(`/billing/plans/${planId}/installments`);
      setInsts(res.items ?? []);
    } catch (e) {
      setInstErr(e instanceof Error ? e.message : 'Taksitler alınamadı');
    } finally {
      setInstLoading(false);
    }
  }, []);

  function openPlan(row: PlanRow): void {
    setPlan(row);
    setInsts([]);
    setPayTarget(null);
    setPayErr('');
    void loadInstallments(row.id);
  }

  function closePlan(): void {
    setPlan(null);
    setInsts([]);
    setPayTarget(null);
    setPayErr('');
  }

  function startPay(inst: Installment): void {
    setPayTarget(inst);
    setPayErr('');
    setPayMethod('havale');
    setPaidOn(todayIso());
    // Kalan tutarı TL olarak öner.
    setPayTl(((inst.amount - inst.paidAmount) / 100).toFixed(2));
  }

  async function submitPay(): Promise<void> {
    if (!payTarget || !plan) return;
    setPayErr('');
    const kurus = tlToKurus(payTl);
    if (kurus === null) {
      setPayErr('Tahsilat tutarı geçerli bir TL değeri olmalı.');
      return;
    }
    setPaying(true);
    try {
      await api(`/billing/installments/${payTarget.id}/pay`, {
        method: 'POST',
        body: { amount: kurus, method: payMethod, ...(paidOn ? { paidOn } : {}) },
      });
      toast('Tahsilat kaydedildi', {
        tone: 'ok',
        body: `${payTarget.seq}. taksit · ${money(kurus)} · ${METHOD_TR[payMethod]}`,
      });
      setPayTarget(null);
      setPayTl('');
      await Promise.all([loadInstallments(plan.id), loadPlans()]);
    } catch (e) {
      // Taksit tutarını aşan ödemede sunucu 409 döner; mesajı olduğu gibi göster.
      setPayErr(e instanceof Error ? e.message : 'Tahsilat kaydedilemedi');
    } finally {
      setPaying(false);
    }
  }

  const planPaid = useMemo(() => insts.reduce((a, i) => a + i.paidAmount, 0), [insts]);
  const planRate = plan && plan.totalAmount > 0 ? (planPaid / plan.totalAmount) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Ödeme Planı ve Taksitler"
        sub="Öğrenci bazlı taksitlendirme, tahsilat kaydı ve tahsilat takibi."
        actions={
          <Button icon="wallet" onClick={openNew}>
            Yeni ödeme planı
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam plan', value: plans.length, icon: 'fileText' },
              { label: 'Aktif plan', value: totals.active, icon: 'clock' },
              { label: 'Tahakkuk', value: money(totals.accrued), icon: 'money' },
              {
                label: 'Kalan alacak',
                value: money(totals.outstanding),
                icon: 'wallet',
                tone: totals.outstanding > 0 ? 'warn' : 'ok',
              },
            ]}
          />

          <Card title="Genel tahsilat ilerlemesi" icon="activity">
            <ProgressBar value={totals.rate} />
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              {money(totals.paid)} tahsil edildi · {money(totals.outstanding)} kalan ·{' '}
              <b>%{Math.round(totals.rate)}</b>
            </p>
          </Card>

          <Card title="Ödeme planları" icon="grid" hint="Satırdaki Taksitler ile plan detayına gidin.">
            {plans.length === 0 ? (
              <EmptyState
                icon="wallet"
                title="Henüz ödeme planı yok"
                sub="Öğrenci seçip taksitlendirme oluşturarak başlayın."
                action={
                  <Button icon="wallet" onClick={openNew}>
                    Yeni ödeme planı
                  </Button>
                }
              />
            ) : (
              <DataTable
                rows={plans}
                csv
                csvName="odeme-planlari"
                columns={[
                  {
                    key: 'student',
                    header: 'Öğrenci',
                    value: (r) => `${r.studentNo} ${r.studentName}`,
                    render: (r) => (
                      <div className="stack">
                        <b>{r.studentNo}</b>
                        <span className="muted">{r.studentName}</span>
                      </div>
                    ),
                  },
                  { key: 'year', header: 'Yıl', num: true, value: (r) => r.year },
                  {
                    key: 'term',
                    header: 'Dönem',
                    value: (r) => r.term ?? '',
                    render: (r) => r.term ?? '—',
                  },
                  {
                    key: 'totalAmount',
                    header: 'Toplam',
                    num: true,
                    value: (r) => r.totalAmount,
                    render: (r) => money(r.totalAmount),
                  },
                  {
                    key: 'installmentCount',
                    header: 'Taksit',
                    num: true,
                    value: (r) => r.installmentCount,
                    render: (r) => `${r.paidCount}/${r.installmentCount}`,
                  },
                  {
                    key: 'paidAmount',
                    header: 'Ödenen',
                    num: true,
                    value: (r) => r.paidAmount,
                    render: (r) => money(r.paidAmount),
                  },
                  {
                    key: 'outstanding',
                    header: 'Kalan',
                    num: true,
                    value: (r) => r.outstanding,
                    render: (r) => money(r.outstanding),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => PLAN_STATUS_TR[r.status] ?? r.status,
                    render: (r) => (
                      <Badge tone={PLAN_STATUS_TONE[r.status] ?? 'muted'}>
                        {PLAN_STATUS_TR[r.status] ?? r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'act',
                    header: '',
                    sortable: false,
                    value: () => '',
                    render: (r) => (
                      <Button variant="ghost" sm icon="eye" onClick={() => openPlan(r)}>
                        Taksitler
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      {/* ---------------- Yeni plan ---------------- */}
      <Drawer open={newOpen} onClose={closeNew} title="Yeni ödeme planı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Öğrenci</h2>
        {picked ? (
          <div className="info-box">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
                <br />
                <span className="muted">{picked.programName}</span>
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Öğrenci no / ad / program ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            {hits.length === 0 ? (
              <EmptyState icon="users" title="Öğrenci bulunamadı" sub="Arama terimini değiştirin." />
            ) : (
              <table>
                <tbody>
                  {hits.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <b>{h.studentNo}</b>
                      </td>
                      <td>{h.fullName}</td>
                      <td className="muted">{h.programName}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                          Seç
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        <h2>2 · Plan bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPlan();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 110px', marginBottom: 0 }}>
              <label>Yıl</label>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                inputMode="numeric"
                placeholder="2026"
                required
              />
            </div>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Dönem</label>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Örn. Güz"
                maxLength={60}
              />
            </div>
          </div>

          <div className="row" style={{ alignItems: 'flex-end', marginTop: 14 }}>
            <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label>Toplam tutar (TL)</label>
              <input
                value={totalTl}
                onChange={(e) => setTotalTl(e.target.value)}
                inputMode="decimal"
                placeholder="48.000,00"
                required
              />
              <div className="hint-sm">
                {tlToKurus(totalTl) !== null ? money(tlToKurus(totalTl)) : 'TL olarak girin'}
              </div>
            </div>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Taksit sayısı</label>
              <input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                inputMode="numeric"
                placeholder="4"
                required
              />
              <div className="hint-sm">1–24 arası</div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>İlk taksit vadesi</label>
            <input type="date" value={firstDueOn} onChange={(e) => setFirstDueOn(e.target.value)} />
            <div className="hint-sm">Sonraki taksitler birer ay arayla otomatik üretilir.</div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="check" disabled={saving || !picked} block>
              {saving ? 'Oluşturuluyor…' : 'Planı oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* ---------------- Taksitler / tahsilat ---------------- */}
      <Drawer
        open={plan !== null}
        onClose={closePlan}
        title={plan ? `${plan.studentNo} · Taksitler` : 'Taksitler'}
      >
        {plan && (
          <>
            <div className="info-box">
              <div className="stack" style={{ gap: 2 }}>
                <b>{plan.studentName}</b>
                <span className="muted">
                  {plan.year}
                  {plan.term ? ` · ${plan.term}` : ''} · {plan.installmentCount} taksit ·{' '}
                  {money(plan.totalAmount)}
                </span>
              </div>
              <div style={{ marginTop: 12 }}>
                <ProgressBar value={planRate} />
                <div className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                  {money(planPaid)} ödendi · {money(plan.totalAmount - planPaid)} kalan ·{' '}
                  <b>%{Math.round(planRate)}</b>
                </div>
              </div>
            </div>

            {instErr && <Alert tone="err">{instErr}</Alert>}

            {instLoading ? (
              <Skeleton lines={5} />
            ) : insts.length === 0 ? (
              !instErr && (
                <EmptyState
                  icon="inbox"
                  title="Taksit bulunamadı"
                  sub="Bu plan için taksit kaydı yok."
                />
              )
            ) : (
              <table style={{ marginTop: 14 }}>
                <thead>
                  <tr>
                    <th className="num">Sıra</th>
                    <th>Vade</th>
                    <th className="num">Tutar</th>
                    <th className="num">Ödenen</th>
                    <th>Durum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {insts.map((i) => (
                    <tr key={i.id}>
                      <td className="num">{i.seq}</td>
                      <td>{fmtDate(i.dueOn)}</td>
                      <td className="num">{money(i.amount)}</td>
                      <td className="num">{money(i.paidAmount)}</td>
                      <td>
                        <Badge tone={INST_STATUS_TONE[i.status] ?? 'muted'}>
                          {INST_STATUS_TR[i.status] ?? i.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {i.status !== 'odendi' && (
                          <Button variant="ghost" sm icon="money" onClick={() => startPay(i)}>
                            Tahsilat
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {payTarget && (
              <>
                <hr className="divider" />
                <h2 style={{ marginTop: 0 }}>{payTarget.seq}. taksit · tahsilat</h2>
                <p className="hint">
                  Taksit tutarı {money(payTarget.amount)} · kalan{' '}
                  {money(payTarget.amount - payTarget.paidAmount)}
                </p>

                {payErr && <Alert tone="err">{payErr}</Alert>}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitPay();
                  }}
                >
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                      <label>Tutar (TL)</label>
                      <input
                        value={payTl}
                        onChange={(e) => setPayTl(e.target.value)}
                        inputMode="decimal"
                        placeholder="1.500,00"
                        required
                      />
                      <div className="hint-sm">
                        {tlToKurus(payTl) !== null ? money(tlToKurus(payTl)) : 'TL olarak girin'}
                      </div>
                    </div>
                    <div className="field" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                      <label>Yöntem</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PayMethod)}
                      >
                        <option value="havale">Havale/EFT</option>
                        <option value="kart">Kredi kartı</option>
                        <option value="nakit">Nakit</option>
                      </select>
                    </div>
                    <div className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                      <label>Ödeme tarihi</label>
                      <input
                        type="date"
                        value={paidOn}
                        onChange={(e) => setPaidOn(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 16 }}>
                    <Button type="submit" icon="check" disabled={paying}>
                      {paying ? 'Kaydediliyor…' : 'Tahsilatı kaydet'}
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => setPayTarget(null)}>
                      Vazgeç
                    </Button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
