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
  Segmented,
  Drawer,
  EmptyState,
  toast,
  money,
  fmtDate,
} from '@/app/ui';

interface Loan {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  itemTitle: string;
  loanedOn: string | null;
  dueOn: string | null;
  returnedOn: string | null;
  fineAmount: number;
  status: string;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

interface Debt {
  studentId: string;
  unpaidFine: number;
  overdueCount: number;
  clear: boolean;
}

type Filter = 'hepsi' | 'odunc' | 'iade' | 'gecikmis';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'odunc', label: 'Ödünçte' },
  { value: 'iade', label: 'İade' },
  { value: 'gecikmis', label: 'Gecikmiş' },
];

const STATUS_LABEL: Record<string, string> = {
  odunc: 'Ödünçte',
  iade: 'İade edildi',
  gecikmis: 'Gecikmiş',
  kayip: 'Kayıp',
};

const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'iade') return 'ok';
  if (s === 'gecikmis') return 'danger';
  if (s === 'kayip') return 'warn';
  if (s === 'odunc') return 'info';
  return 'muted';
}

/** ISO gün (YYYY-MM-DD) — date input ve backend z.string().date() ile uyumlu. */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** İade edilmemiş ve son tarihi geçmiş kayıt. */
function isOverdue(r: Loan): boolean {
  if (r.returnedOn) return false;
  if (r.status === 'gecikmis') return true;
  return !!r.dueOn && r.dueOn < isoDay(new Date());
}

export default function KutuphanePage(): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('hepsi');
  const [rows, setRows] = useState<Loan[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni ödünç sürgüsü.
  const [newOpen, setNewOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [loanedOn, setLoanedOn] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Satır işlemi sürgüsü (iade / ceza).
  const [active, setActive] = useState<Loan | null>(null);
  const [returnedOn, setReturnedOn] = useState('');
  const [fineTl, setFineTl] = useState('');
  const [rowErr, setRowErr] = useState('');
  const [rowBusy, setRowBusy] = useState(false);

  // Borç sorgusu sürgüsü.
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtQ, setDebtQ] = useState('');
  const [debtHits, setDebtHits] = useState<StudentHit[]>([]);
  const [debtSearching, setDebtSearching] = useState(false);
  const [debtStudent, setDebtStudent] = useState<StudentHit | null>(null);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [debtErr, setDebtErr] = useState('');

  const load = useCallback(async () => {
    const qs = filter === 'hepsi' ? '' : `?status=${filter}`;
    const res = await api<{ items: Loan[] }>(`/campus/library${qs}`);
    setRows(res.items ?? []);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      open: rows.filter((r) => !r.returnedOn).length,
      overdue: rows.filter(isOverdue).length,
      fine: rows.filter((r) => r.status !== 'iade').reduce((a, r) => a + (r.fineAmount ?? 0), 0),
    }),
    [rows],
  );

  async function searchStudent(term: string): Promise<StudentHit[]> {
    const res = await api<{ items: StudentHit[] }>(
      `/portal/students?q=${encodeURIComponent(term)}`,
    );
    return res.items ?? [];
  }

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setFormErr('');
    try {
      setHits(await searchStudent(term));
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  function openNew(): void {
    const today = new Date();
    const due = new Date(today.getTime() + 15 * 86400000);
    setLoanedOn(isoDay(today));
    setDueOn(isoDay(due));
    setNewOpen(true);
  }

  function closeNew(): void {
    setNewOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setItemTitle('');
    setLoanedOn('');
    setDueOn('');
    setFormErr('');
  }

  async function submitLoan(): Promise<void> {
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    if (!itemTitle.trim()) {
      setFormErr('Materyal adı zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/campus/library', {
        method: 'POST',
        body: {
          studentId: picked.id,
          itemTitle: itemTitle.trim(),
          ...(loanedOn ? { loanedOn } : {}),
          ...(dueOn ? { dueOn } : {}),
        },
      });
      toast('Ödünç kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${itemTitle.trim()}`,
      });
      closeNew();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function openRow(r: Loan): void {
    setActive(r);
    setReturnedOn(r.returnedOn ?? isoDay(new Date()));
    setFineTl(r.fineAmount ? (r.fineAmount / 100).toFixed(2) : '');
    setRowErr('');
  }

  function closeRow(): void {
    setActive(null);
    setReturnedOn('');
    setFineTl('');
    setRowErr('');
  }

  async function patchLoan(id: string, body: Record<string, unknown>, okMsg: string): Promise<void> {
    setRowBusy(true);
    setRowErr('');
    try {
      await api(`/campus/library/${id}`, { method: 'PATCH', body });
      toast(okMsg, { tone: 'ok' });
      closeRow();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setRowErr(m);
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setRowBusy(false);
    }
  }

  async function submitReturn(): Promise<void> {
    if (!active) return;
    if (!returnedOn) {
      setRowErr('İade tarihi zorunludur.');
      return;
    }
    await patchLoan(active.id, { returnedOn, status: 'iade' }, 'İade alındı');
  }

  async function submitFine(): Promise<void> {
    if (!active) return;
    const tl = Number(fineTl.replace(',', '.'));
    if (!fineTl.trim() || !isFinite(tl) || tl < 0) {
      setRowErr('Geçerli bir ceza tutarı girin.');
      return;
    }
    await patchLoan(active.id, { fineAmount: Math.round(tl * 100) }, 'Ceza işlendi');
  }

  async function searchDebtStudent(): Promise<void> {
    const term = debtQ.trim();
    if (!term) return;
    setDebtSearching(true);
    setDebtErr('');
    try {
      setDebtHits(await searchStudent(term));
    } catch (e) {
      setDebtErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setDebtSearching(false);
    }
  }

  async function loadDebt(s: StudentHit): Promise<void> {
    setDebtStudent(s);
    setDebt(null);
    setDebtErr('');
    try {
      setDebt(await api<Debt>(`/campus/library/debt/${s.id}`));
    } catch (e) {
      setDebtErr(e instanceof Error ? e.message : 'Borç sorgusu başarısız');
    }
  }

  function closeDebt(): void {
    setDebtOpen(false);
    setDebtQ('');
    setDebtHits([]);
    setDebtStudent(null);
    setDebt(null);
    setDebtErr('');
  }

  return (
    <>
      <PageHeader
        title="Kütüphane Ödünç / Borç"
        sub="Ödünç verme, iade ve gecikme cezası takibi; ilişik kesme ve mezuniyet için borç sorgusu."
        actions={
          <div className="row">
            <Button variant="ghost" icon="search" onClick={() => setDebtOpen(true)}>
              Borç sorgusu
            </Button>
            <Button icon="book" onClick={openNew}>
              Yeni ödünç
            </Button>
          </div>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Kayıt', value: stats.total, icon: 'book' },
            { label: 'İade bekleyen', value: stats.open, icon: 'clock', tone: 'warn' },
            { label: 'Gecikmiş', value: stats.overdue, icon: 'alert', tone: 'danger' },
            { label: 'Ödenmemiş ceza', value: money(stats.fine), icon: 'money', tone: 'warn' },
          ]}
        />
      )}

      <Card
        title="Ödünç kayıtları"
        icon="book"
        hint="Sayaçlar seçili filtreye göre hesaplanır."
        actions={<Segmented value={filter} onChange={setFilter} options={FILTERS} />}
      >
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Loan>
            rows={rows}
            search
            csv
            csvName="oidb-kutuphane"
            empty={
              <EmptyState
                icon="book"
                title="Kayıt bulunamadı"
                sub="Seçili filtrede ödünç kaydı yok. Sağ üstten yeni ödünç ekleyebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => (
                  <>
                    <b>{r.studentNo}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.studentEmail}
                    </div>
                  </>
                ),
              },
              {
                key: 'itemTitle',
                header: 'Materyal',
                sortable: true,
                value: (r) => r.itemTitle,
              },
              {
                key: 'loanedOn',
                header: 'Ödünç Tarihi',
                sortable: true,
                value: (r) => r.loanedOn ?? '',
                render: (r) => fmtDate(r.loanedOn),
              },
              {
                key: 'dueOn',
                header: 'Son Tarih',
                sortable: true,
                value: (r) => r.dueOn ?? '',
                render: (r) =>
                  isOverdue(r) ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      {fmtDate(r.dueOn)}
                    </span>
                  ) : (
                    fmtDate(r.dueOn)
                  ),
              },
              {
                key: 'returnedOn',
                header: 'İade',
                sortable: true,
                value: (r) => r.returnedOn ?? '',
                render: (r) =>
                  r.returnedOn ? fmtDate(r.returnedOn) : <span className="muted">—</span>,
              },
              {
                key: 'fineAmount',
                header: 'Ceza',
                sortable: true,
                num: true,
                value: (r) => r.fineAmount ?? 0,
                render: (r) => money(r.fineAmount),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => statusLabel(r.status),
                render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
              },
              {
                key: 'islem',
                header: 'İşlem',
                render: (r) => (
                  <Button variant="ghost" sm icon="edit" onClick={() => openRow(r)}>
                    İşlem
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* ---------------------------- YENİ ÖDÜNÇ ---------------------------- */}
      <Drawer open={newOpen} onClose={closeNew} title="Yeni ödünç kaydı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

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
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
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
                      <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        <h2>2 · Materyal</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitLoan();
          }}
        >
          <div className="field">
            <label>Materyal adı</label>
            <input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Örn. Genel Matematik – Cilt I"
              required
            />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Ödünç tarihi</label>
              <input type="date" value={loanedOn} onChange={(e) => setLoanedOn(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 150px', marginBottom: 0 }}>
              <label>Son iade tarihi</label>
              <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="book" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Ödünç ver'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* -------------------------- İADE / CEZA -------------------------- */}
      <Drawer open={!!active} onClose={closeRow} title="İade ve ceza işlemi">
        {active && (
          <>
            {rowErr && <Alert tone="err">{rowErr}</Alert>}

            <div className="info-box">
              <div>
                <b>{active.studentNo}</b> · {active.studentEmail}
              </div>
              <div>{active.itemTitle}</div>
              <div className="muted">
                Ödünç: {fmtDate(active.loanedOn)} · Son tarih: {fmtDate(active.dueOn)} · Ceza:{' '}
                {money(active.fineAmount)}
              </div>
              <div style={{ marginTop: 8 }}>
                <Badge tone={statusTone(active.status)}>{statusLabel(active.status)}</Badge>
              </div>
            </div>

            <h2>İade al</h2>
            {active.returnedOn ? (
              <Alert tone="ok">
                Bu materyal {fmtDate(active.returnedOn)} tarihinde iade edilmiş.
              </Alert>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitReturn();
                }}
              >
                <div className="field">
                  <label>İade tarihi</label>
                  <input
                    type="date"
                    value={returnedOn}
                    onChange={(e) => setReturnedOn(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" variant="ok" icon="checkCircle" disabled={rowBusy} block>
                  {rowBusy ? 'İşleniyor…' : 'İadeyi kaydet'}
                </Button>
              </form>
            )}

            <h2>Gecikme cezası</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitFine();
              }}
            >
              <div className="field">
                <label>Ceza tutarı (₺)</label>
                <input
                  value={fineTl}
                  onChange={(e) => setFineTl(e.target.value)}
                  inputMode="decimal"
                  placeholder="Örn. 25,00"
                />
                <div className="hint-sm">Tutar kuruşa çevrilerek kaydedilir.</div>
              </div>
              <Button type="submit" variant="ghost" icon="money" disabled={rowBusy} block>
                {rowBusy ? 'İşleniyor…' : 'Cezayı kaydet'}
              </Button>
            </form>
          </>
        )}
      </Drawer>

      {/* --------------------------- BORÇ SORGUSU --------------------------- */}
      <Drawer open={debtOpen} onClose={closeDebt} title="Öğrenci kütüphane borcu">
        {debtErr && <Alert tone="err">{debtErr}</Alert>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void searchDebtStudent();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={debtQ}
                onChange={(e) => setDebtQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={debtSearching}>
              {debtSearching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {!debtStudent && debtHits.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {debtHits.map((h) => (
                <tr key={h.id}>
                  <td>
                    <b>{h.studentNo}</b>
                  </td>
                  <td>{h.fullName}</td>
                  <td className="muted">{h.programName}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" sm icon="search" onClick={() => void loadDebt(h)}>
                      Sorgula
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {debtStudent && (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <b>{debtStudent.studentNo}</b> · {debtStudent.fullName}
              </span>
              <Button
                variant="ghost"
                sm
                icon="refresh"
                onClick={() => {
                  setDebtStudent(null);
                  setDebt(null);
                }}
              >
                Değiştir
              </Button>
            </div>

            {!debt && !debtErr ? (
              <Skeleton lines={3} />
            ) : (
              debt && (
                <Card title="Borç özeti" icon="money">
                  <StatGrid
                    stats={[
                      {
                        label: 'Ödenmemiş ceza',
                        value: money(debt.unpaidFine),
                        icon: 'money',
                        tone: debt.unpaidFine > 0 ? 'danger' : 'ok',
                      },
                      {
                        label: 'Gecikmiş materyal',
                        value: debt.overdueCount,
                        icon: 'alert',
                        tone: debt.overdueCount > 0 ? 'danger' : 'ok',
                      },
                    ]}
                  />
                  {debt.clear ? (
                    <Alert tone="ok">
                      Kütüphane ilişiği temiz. İlişik kesme ve mezuniyet işlemleri için engel yok.
                    </Alert>
                  ) : (
                    <Alert tone="warn">
                      Kütüphane borcu bulunuyor. Bu kayıt kapanmadan ilişik kesme ve mezuniyet
                      işlemleri tamamlanamaz.
                    </Alert>
                  )}
                </Card>
              )
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
