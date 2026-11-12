'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Segmented,
  Meter,
  EmptyState,
  Alert,
  SkeletonStats,
  toast,
  money,
} from '@/app/ui';

/* ── API şekilleri (canlı finance uçlarından doğrulandı) ──────────────────── */
interface FinanceSummary {
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
interface ReconResp {
  items: ReconItem[];
  summary: { total: number; matched: number; unmatched: number };
}

function fmtDt(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}
/** Sunucu paymentId için UUID bekler; boşuna 400 almamak için istemcide de doğrula. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MaliOzet(): React.ReactElement {
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [recon, setRecon] = useState<ReconResp | null>(null);
  const [onlyUnmatched, setOnlyUnmatched] = useState(true);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Mutabakat manuel eşleştirme akışı.
  const [matchRow, setMatchRow] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRecon = useCallback(async (unmatched: boolean) => {
    const r = await api<ReconResp>(
      `/finance/reconciliation${unmatched ? '?unmatched=true' : ''}`,
    );
    setRecon(r);
  }, []);

  const load = useCallback(async () => {
    const f = await api<FinanceSummary>('/reports/finance-summary');
    setFin(f);
    try {
      await loadRecon(true);
    } catch {
      setRecon(null);
    }
    setLoaded(true);
  }, [loadRecon]);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  async function toggleUnmatched(next: boolean): Promise<void> {
    setOnlyUnmatched(next);
    setErr('');
    try {
      await loadRecon(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Mutabakat kaydı okunamadı');
    }
  }

  async function doMatch(recordId: string): Promise<void> {
    setBusy(true);
    setErr('');
    try {
      await api(`/finance/reconciliation/${recordId}/match`, {
        method: 'POST',
        body: { paymentId: paymentId.trim() },
      });
      toast('Eşleştirildi', { tone: 'ok', body: 'Banka kaydı ödemeye bağlandı.' });
      setMatchRow(null);
      setPaymentId('');
      await loadRecon(onlyUnmatched);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Eşleştirme başarısız';
      setErr(m);
      toast('Eşleştirme başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const rate = fin ? fin.collectionRateBps / 100 : 0;
  const statusRows = useMemo(() => {
    if (!fin)
      return [] as { key: string; label: string; count: number; amount: number; tone: 'ok' | 'warn' | 'danger' }[];
    return [
      { key: 'paid', label: 'Ödendi', ...fin.invoiceStatus.paid, tone: 'ok' as const },
      { key: 'partial', label: 'Kısmi', ...fin.invoiceStatus.partial, tone: 'warn' as const },
      { key: 'unpaid', label: 'Ödenmedi', ...fin.invoiceStatus.unpaid, tone: 'danger' as const },
    ];
  }, [fin]);
  const totalInvoices = statusRows.reduce((a, r) => a + r.count, 0);

  return (
    <>
      <PageHeader
        title="Mali Özet & Mutabakat"
        sub="Kiracı genelinde tahakkuk/tahsilat, açık alacak, program ve dönem kırılımı ile banka mutabakat istisnalarının çözümü."
        actions={
          <Button variant="ghost" sm icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <SkeletonStats n={4} />
      ) : !fin ? (
        <Card>
          <EmptyState icon="money" title="Mali özet verisi alınamadı" sub="Finans raporu bu kapsamda okunamadı." />
        </Card>
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam Tahakkuk', value: money(fin.totalAccrued), icon: 'chart' },
              {
                label: 'Tahsil Edilen',
                value: money(fin.totalCollected),
                icon: 'wallet',
                tone: 'ok',
              },
              {
                label: 'Açık Alacak',
                value: money(fin.openReceivable),
                icon: 'money',
                tone: fin.openReceivable > 0 ? 'danger' : undefined,
              },
              {
                label: 'Tahsilat Oranı',
                value: `%${rate.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`,
                icon: 'target',
                tone: rate < 60 ? 'warn' : undefined,
              },
            ]}
          />

          <Card title="Tahsilat Oranı" icon="target" hint="Toplam tahakkuk üzerinden tahsil edilen pay.">
            <Meter value={rate} label={`%${rate.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`} />
          </Card>

          <Card
            title="Fatura Durum Dağılımı"
            icon="pie"
            actions={<Badge tone="muted">{fin.scholarshipCount} burslu öğrenci</Badge>}
          >
            {totalInvoices === 0 ? (
              <EmptyState icon="fileText" title="Bu kapsamda fatura yok" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Durum</th>
                    <th className="num">Adet</th>
                    <th className="num">Tutar</th>
                    <th style={{ width: 200 }}>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.map((r) => {
                    const pct = totalInvoices ? (r.count / totalInvoices) * 100 : 0;
                    return (
                      <tr key={r.key}>
                        <td>
                          <Badge tone={r.tone}>{r.label}</Badge>
                        </td>
                        <td className="num">{r.count.toLocaleString('tr-TR')}</td>
                        <td className="num">{money(r.amount)}</td>
                        <td>
                          <Meter value={pct} label={`%${pct.toFixed(0)}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Dönem Bazlı Tahsilat" icon="calendar">
            {fin.byTerm.length === 0 ? (
              <EmptyState icon="calendar" title="Dönem verisi yok" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Dönem</th>
                    <th className="num">Tahakkuk</th>
                    <th className="num">Tahsilat</th>
                    <th className="num">Açık</th>
                    <th style={{ width: 180 }}>Oran</th>
                  </tr>
                </thead>
                <tbody>
                  {fin.byTerm.map((t) => {
                    const open = t.accrued - t.collected;
                    const pct = t.accrued > 0 ? (t.collected / t.accrued) * 100 : 0;
                    return (
                      <tr key={t.termId}>
                        <td>
                          <b>{t.termName}</b>
                        </td>
                        <td className="num">{money(t.accrued)}</td>
                        <td className="num" style={{ color: 'var(--ok)' }}>
                          {money(t.collected)}
                        </td>
                        <td className="num" style={{ color: open > 0 ? 'var(--danger)' : undefined }}>
                          {money(open)}
                        </td>
                        <td>
                          <Meter value={pct} label={`%${pct.toFixed(0)}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Program Bazlı Açık Alacak" icon="building" hint="Açık borca göre azalan sıralı.">
            {fin.byProgram.length === 0 ? (
              <EmptyState icon="building" title="Program verisi yok" />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Program</th>
                    <th className="num">Tahakkuk</th>
                    <th className="num">Tahsilat</th>
                    <th className="num">Açık Alacak</th>
                  </tr>
                </thead>
                <tbody>
                  {fin.byProgram.map((p) => (
                    <tr key={p.program}>
                      <td>{p.program}</td>
                      <td className="num">{money(p.accrued)}</td>
                      <td className="num" style={{ color: 'var(--ok)' }}>
                        {money(p.collected)}
                      </td>
                      <td className="num">
                        <b style={{ color: p.openDebt > 0 ? 'var(--danger)' : undefined }}>
                          {money(p.openDebt)}
                        </b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title="Banka Mutabakatı"
            icon="wallet"
            hint="Banka ekstresindeki her kayıt bir ödemeye bağlanmalı. Eşleşmeyen istisnaları manuel olarak ödeme kimliğiyle bağlayın."
            actions={
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                {recon && (
                  <>
                    <Badge tone="muted">{recon.summary.total} kayıt</Badge>
                    <Badge tone="ok">{recon.summary.matched} eşleşti</Badge>
                    <Badge tone="danger">{recon.summary.unmatched} istisna</Badge>
                  </>
                )}
                <Segmented
                  value={onlyUnmatched ? 'unmatched' : 'all'}
                  onChange={(v) => toggleUnmatched(v === 'unmatched')}
                  options={[
                    { value: 'unmatched', label: 'İstisnalar' },
                    { value: 'all', label: 'Tümü' },
                  ]}
                />
              </div>
            }
          >
            {!recon ? (
              <EmptyState icon="wallet" title="Mutabakat verisi alınamadı" sub="Bu kapsamda banka mutabakat kaydı okunamadı." />
            ) : recon.items.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title={onlyUnmatched ? 'Açık istisna yok' : 'Mutabakat kaydı yok'}
                sub={onlyUnmatched ? 'Tüm banka kayıtları bir ödemeye eşleşmiş durumda.' : undefined}
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Banka Ref.</th>
                    <th className="num">Tutar</th>
                    <th>İçe Aktarım</th>
                    <th>Eşleşme</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recon.items.map((r) => {
                    const matching = matchRow === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td>
                            <code>{r.bankRef}</code>
                          </td>
                          <td className="num">{money(r.amount)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDt(r.importedAt)}</td>
                          <td>
                            {r.matchedPaymentId ? (
                              <div>
                                <Badge tone="ok">eşleşti</Badge>
                                {r.matchedStudentNo && (
                                  <div className="meta">
                                    {r.matchedStudentNo} · {r.matchedStudentName}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge tone="danger">istisna</Badge>
                            )}
                          </td>
                          <td>
                            {!r.matchedPaymentId &&
                              (matching ? (
                                <Button
                                  variant="ghost"
                                  sm
                                  onClick={() => {
                                    setMatchRow(null);
                                    setPaymentId('');
                                  }}
                                >
                                  Vazgeç
                                </Button>
                              ) : (
                                <Button
                                  variant="subtle"
                                  sm
                                  icon="link"
                                  onClick={() => {
                                    setMatchRow(r.id);
                                    setPaymentId('');
                                  }}
                                >
                                  Eşleştir
                                </Button>
                              ))}
                          </td>
                        </tr>
                        {matching && (
                          <tr>
                            <td colSpan={5} style={{ background: 'var(--surface-2, rgba(0,0,0,0.02))' }}>
                              <div
                                className="row"
                                style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}
                              >
                                <div className="field" style={{ margin: 0, minWidth: 320 }}>
                                  <label>Ödeme kimliği (payment UUID)</label>
                                  <input
                                    placeholder="örn. 3f9c…-…"
                                    value={paymentId}
                                    onChange={(e) => setPaymentId(e.target.value)}
                                  />
                                </div>
                                <Button
                                  variant="ok"
                                  sm
                                  icon="check"
                                  disabled={busy || !UUID_RE.test(paymentId.trim())}
                                  onClick={() => doMatch(r.id)}
                                >
                                  {busy ? 'Bağlanıyor…' : 'Ödemeye bağla'}
                                </Button>
                              </div>
                              <div className="hint" style={{ marginTop: 6 }}>
                                Sunucu ödemenin aynı kiracıda olduğunu doğrular ve işlem Audit
                                Log&apos;a düşer (
                                <code>POST /finance/reconciliation/:id/match</code>).
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
